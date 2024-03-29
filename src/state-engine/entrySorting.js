const { dew, isInstance, chain, memoize, setsIntersect } = require("../utils");

/**
 * @callback SortingFn
 * @param {SortableEntry} a 
 * @param {SortableEntry} b
 * @returns {number}
 */

/**
 * @param {{ result: number }} mem
 * @param {SortableEntry} a 
 * @param {SortableEntry} b 
 * @returns {(sorter: SortingFn) => boolean}
 */
const checkSorting = (mem, a, b) => (sorter) => {
  mem.result = sorter(a, b);
  return mem.result !== 0;
};

/**
 * @param {SortableEntry} arg
 * @returns {string}
 */
const debugText = ({ text }) => text?.split(" ").slice(0, 10).join(" ") ?? "(no text)";

/**
 * Builds a set of functions that allow quick(er) queries about the entries.
 * 
 * @param {SortableEntry[]} theEntries
 */
exports.sortingHelpers = (theEntries) => {
  /** @type {Set<string>} */
  const knownTopics = new Set();
  /** @type {Map<string | null, number>} */
  const topicToPriority = new Map([[null, 0]]);
  /** @type {Map<string, Set<SortableEntry>>} */
  const topicToEntries = new Map();
  /** @type {Map<SortableEntry, Set<string>>} */
  const entryToRelatives = new Map();

  // Gather some information about our entries.  In particular:
  // - All the known topics.
  // - A complete list of topics an entry is related to.
  // - A map of topics to priorities.
  // The map will contain the lowest priority from the prioritized entries that all
  // share a topic.
  for (const entry of theEntries) {
    if (!entry.topics || entry.topics.size === 0) continue;

    /** @type {Set<string>} */
    const relatives = new Set();

    for (const topic of entry.topics) {
      const setOfEntries = topicToEntries.get(topic) ?? new Set();
      
      setOfEntries.add(entry);
      relatives.add(topic);
      knownTopics.add(topic);

      if (entry.priority != null) {
        const curPriority = topicToPriority.get(topic);
        if (curPriority == null || entry.priority > curPriority)
          topicToPriority.set(topic, entry.priority);
      }

      if (entry.relations != null)
        for (const rel of entry.relations)
          if (rel.type !== "negated")
            relatives.add(rel.topic);

      entryToRelatives.set(entry, relatives);
      topicToEntries.set(topic, setOfEntries);
    }
  }

  /**
   * Determines if two entries share at least one topic.
   * 
   * @param {SortableEntry} a 
   * @param {SortableEntry} b 
   */
  const haveSharedTopics = (a, b) => {
    if (!a.topics || !b.topics) return false;
    return setsIntersect(a.topics, b.topics);
  };

  /**
   * Obtains the inclusive relations for an entry.
   */
   const getInclusiveRelations = dew(() => {
    /**
     * @param {SortableEntry} entry
     * @returns {string[]}
     */
    const getInclusiveRelations = (entry) => {
      if (!entry.relations) return [];
      return entry.relations
        .filter((v) => v.type !== "negated")
        .map((v) => v.topic);
    };

    return memoize(getInclusiveRelations);
  });

  /**
   * Obtains the relations that have matches to other entries in this group.
   */
  const getMatchedRelations = dew(() => {
    /**
     * @param {SortableEntry} entry
     * @returns {string[]}
     */
    const getMatchedRelations = (entry) =>
      getInclusiveRelations(entry).filter((k) => knownTopics.has(k));

    return memoize(getMatchedRelations);
  });

  /**
   * Traverses the entries that belong to an entry's family.  This includes the
   * entry itself.
   * 
   * @param {SortableEntry} entry
   * @param {Set<SortableEntry>} [visited]
   * @returns {Iterable<SortableEntry>}
   */
  const traverseRelatives = function* (entry, visited = new Set()) {
    if (visited.has(entry)) return;

    visited.add(entry);
    yield entry;

    const relatedTopics = entryToRelatives.get(entry);
    if (!relatedTopics) return;

    for (const rel of relatedTopics) {
      const setOfEntries = topicToEntries.get(rel);
      if (!setOfEntries) continue;
      for (const relEntry of setOfEntries)
        yield* traverseRelatives(relEntry, visited);
    }
  };

  /**
   * Gets a set of topics that each represent a terminal topic in a relation chain.
   * The entry itself may be its own terminal.
   * 
   * @type {(entry: SortableEntry) => Set<string>}
   */
  const getRootTopics = dew(() => {
    /**
     * @param {SortableEntry} entry
     * @returns {Iterable<string>}
     */
    const getRootTopics = function* (entry) {
      // It's possible that the relatives may have been culled during the selection
      // process, so if we hit an entry that has relations, but some of them are not
      // in the list of known topics, we will count this as terminal.
      for (const relEntry of traverseRelatives(entry)) {
        // This should never happen, but it makes TS happy.
        if (!relEntry.topics) continue;

        // Using a rarely used JS feature to keep this simpler: a labeled block.
        theChecks: {
          const inclusiveRelations = getInclusiveRelations(relEntry);
          // If this is not related at all, its terminal.
          if (!inclusiveRelations.length) break theChecks;
          // If some relation is an unknown topic, it's terminal.
          const matchedRelations = getMatchedRelations(relEntry);
          if (matchedRelations.length < inclusiveRelations.length) break theChecks;
          // If no other relation exists that has no tie to `entry` or `relEntry`, it's terminal.
          const culledRelations = matchedRelations.filter((k) => {
            const selfHas = Boolean(entry.topics?.has(k));
            if (entry === relEntry) return selfHas;
            return selfHas && Boolean(relEntry.topics?.has(k));
          });
          if (culledRelations.length === 0) break theChecks;
          // Otherwise, it is not terminal.
          continue;
        }

        // If we break out of `theChecks`, we have a terminal entry.
        yield* relEntry.topics;
      }
    };

    return memoize((entry) => new Set(getRootTopics(entry)));
  });

  /**
   * Obtains the priority for a given entry.  Entries that are unprioritized but share
   * a topic or have a sole relation with some prioritized entry will have the lowest
   * priority of the entries with that topic.
   * 
   * @param {SortableEntry} entry
   * @returns {string | null}
   */
  const getPriorityTopic = (entry) => {
    if (entry.topics)
      for (const topic of entry.topics)
        if (topicToPriority.has(topic)) return topic;

    // If this entry is normally associated with multiple relations, but only one
    // of those relations was actually selected, we'll group them up.
    const matchedRelations = getMatchedRelations(entry);
    if (matchedRelations.length === 1) {
      const [theTopic] = matchedRelations;
      if (topicToPriority.has(theTopic)) return theTopic;
    }
    return null;
  };

  /**
   * Obtains the priority for a given entry.  Entries that are unprioritized but share
   * a topic or have a sole relation with some prioritized entry will have the lowest
   * priority of the entries with that topic.
   * 
   * @param {SortableEntry} entry
   * @param {string | null} topicAs
   * @returns {number}
   */
  const getPriorityFor = (entry, topicAs) => {
    if (entry.priority != null) return entry.priority;
    return topicToPriority.get(topicAs) ?? 0;
  };

  /**
   * A memoized function that determines if `entry` is directly related to `maybeRelated`.
   * 
   * @type {(entry: SortableEntry, maybeRelated: SortableEntry) => boolean}
   */
  const isDirectlyRelated = dew(() => {
    // @ts-ignore - Going without types here.
    const _impl = memoize((a) => memoize((b) => {
      return Boolean(b.topic && getMatchedRelations(a).includes(b.topic));
    }));
    return (a, b) => _impl(a)(b);
  });

  /**
   * A memoized function that determines if two entries are part of a single family.
   * 
   * @type {(entry: SortableEntry, maybeRelated: SortableEntry) => boolean}
   */
  const isIndirectlyRelated = dew(() => {
    // @ts-ignore - Going without types here.
    const _impl = memoize((a) => memoize((b) => {
      for (const relEntry of traverseRelatives(a))
        if (relEntry === b) return true;
      return false;
    }));
    return (a, b) => _impl(a)(b);
  });

  /**
   * Determines if an entry is a descendent of another entry's family.
   * 
   * @param {SortableEntry} entry 
   * @param {SortableEntry} maybeRelated 
   * @returns {boolean}
   */
  const isDescendent = (entry, maybeRelated) => {
    // If two entries share a topic, they can't be descendants.
    if (haveSharedTopics(entry, maybeRelated)) return false;
    return isIndirectlyRelated(entry, maybeRelated);
  };

  /**
   * Determines if an entry is a member of another's family.  In other words,
   * they either share a topic or are related by a topic.
   * 
   * This is a fast-path for `isIndirectlyRelated`.
   * 
   * @param {SortableEntry} entry 
   * @param {SortableEntry} maybeFamily 
   * @returns {boolean}
   */
  const isFamily = (entry, maybeFamily) => {
    if (haveSharedTopics(entry, maybeFamily)) return true;
    return isIndirectlyRelated(entry, maybeFamily);
  };

  return {
    haveSharedTopics,
    getMatchedRelations,
    traverseRelatives,
    getRootTopics,
    getPriorityTopic,
    getPriorityFor,
    isDirectlyRelated,
    isIndirectlyRelated,
    isDescendent,
    isFamily
  };
};

/**
 * @param {ReturnType<exports["sortingHelpers"]>} helpers
 * @returns {SortingFn}
 */
exports.buildSorter = (helpers) => {
  /**
   * Sorts:
   * - Entries that share topics or are solely related are positioned:
   *   - With unprioritized entries after prioritized entries.
   *   - In descending priority order, otherwise.
   * - Otherwise, by the priority from `getPriorityFor`, descending.
   * 
   * @type {SortingFn}
   */
   const sortPriority = (a, b) => {
    const aTopic = helpers.getPriorityTopic(a);
    const bTopic = helpers.getPriorityTopic(b);

    // If the two entries have a commonality and one has a priority while the other doesn't,
    // we always sort the one that doesn't afterwards.
    if (aTopic != null && aTopic === bTopic) {
      if (a.priority != null && b.priority == null) return -1;
      if (b.priority != null && a.priority == null) return 1;
    }

    // Otherwise, sort according to the obtained priorities.
    const aPriority = helpers.getPriorityFor(a, aTopic);
    const bPriority = helpers.getPriorityFor(b, bTopic);
    return bPriority - aPriority;
  };

  /**
   * Sorts:
   * - Related entries after their dependencies.
   * - Related entries after entries that are related to its dependencies.
   * - More-related entries after less-related entries.
   * 
   * This set of constraints helps families of entries find each other and
   * cluster together better.
   * 
   * @type {SortingFn}
   */
  const sortRelations = (a, b) => {
    // These are our priority to sort by.
    if (helpers.isDescendent(a, b)) return 1;
    if (helpers.isDescendent(b, a)) return -1;
    // And these push entries with more constrained relations down.
    if (a.relations?.length && b.relations?.length) {
      return a.relations.length - b.relations.length;
    }
    return 0;
  };

  /**
   * Sorts:
   * - Scores of entries that share topics in ascending order.
   * - In descending order, otherwise.
   * 
   * @type {SortingFn}
   */
  const sortScore = (a, b) => {
    const [lScore = 0, rScore = 0]
      = helpers.haveSharedTopics(a, b) ? [a.score, b.score]
      : [b.score, a.score];
    return lScore > rScore ? 1 : 0;
  };

  /**
   * Applies the sorting rules listed above to a pair of entries.
   * 
   * @param {SortableEntry} a 
   * @param {SortableEntry} b
   * @returns {number}
   */
  const sorter = (a, b) => {
    const mem = { result: 0 };
    const tester = checkSorting(mem, a, b);
    if (tester(sortPriority)) return mem.result;
    if (tester(sortRelations)) return mem.result;
    if (tester(sortScore)) return mem.result;
    return 0;
  };

  return sorter;
};

/**
 * Builds a function that takes an array of ordered entries and applies some
 * finishing touches, namely clustering entries so they're closer to other,
 * related entries.
 * 
 * @param {SortableEntry[]} orderedEntries
 * @param {ReturnType<exports["sortingHelpers"]>} helpers
 * @returns {SortingFn}
 */
exports.buildGrouper = (orderedEntries, helpers) => {
  /** @type {Map<string, number>} */
  const firstTopics = new Map();
  /** @type {Map<SortableEntry, number>} */
  const entryToPosition = new Map();

  for (let i = 0, lim = orderedEntries.length; i < lim; i++) {
    const entry = orderedEntries[i];
    entryToPosition.set(entry, i);
    if (!entry.topics) continue;
    for (const topic of entry.topics) {
      if (firstTopics.has(topic)) continue;
      firstTopics.set(topic, i);
    }
  }

  /**
   * Gets the position that an entry should cluster toward.  If no entry could
   * be found, it just uses its current position in the array.
   * 
   * @param {SortableEntry} entry 
   * @returns {number}
   */
  const getSorting = (entry) => {
    const positions = chain(helpers.getRootTopics(entry))
      .map((rootTopic) => firstTopics.get(rootTopic))
      .filter(isInstance)
      .toArray();
    if (positions.length > 0) return Math.max(...positions);
    // @ts-ignore - This cannot be `undefined`.
    return entryToPosition.get(entry);
  }

  return (a, b) => {
    // Entries with a priority are breakpoints.  No crossing this boundary.
    if (a.priority != null || b.priority != null) return 0;
    // Otherwise, locate the the position of the earliest root topic for each.
    const aPos = getSorting(a);
    const bPos = getSorting(b);
    // And shuffle them closer to their roots, as needed.
    return aPos - bPos;
  };
};

/**
 * Yields the entries, sorted more naturally, with their ordering stashed in an
 * `order` property, in case the entry needs to be sorted back into place after
 * further processing.
 * 
 * @template {SortableEntry} TEntry
 * @param {Iterable<TEntry>} theEntries 
 * @returns {Iterable<TEntry & WithOrdering>}
 */
exports.entrySorter = function* (theEntries) {
  // Clone the entries or resolve the iterable.
  const arrEntries = [...theEntries];
  const helpers = exports.sortingHelpers(arrEntries);
  const orderedEntries = arrEntries.sort(exports.buildSorter(helpers));
  const groupedEntries = orderedEntries.sort(exports.buildGrouper(orderedEntries, helpers));

  for (let i = 0, lim = groupedEntries.length; i < lim; i++)
    yield { ...groupedEntries[i], order: i };
};