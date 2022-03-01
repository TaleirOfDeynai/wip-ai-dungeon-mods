const { shutUpTS, dew, is, assertExists, tuple2, tuple3 } = require("../../utils");
const { mapIter, toPairs, fromPairs, chain } = require("../../utils");

const MISSING_ENTRY = "Missing entry in \`entriesMap\`!";

/** @type {TypePredicate<AssociationParamTypes["history"]>} */
const isForHistory = (params) => is.number(params.source);

/**
 * Helper to create the association data that tracks things.
 * 
 * @param {MatchableEntry} matcher
 * @param {FlatAssociationParams} params
 * @returns {AssociationData}
 */
exports.createAssocData = (matcher, params) => {
  if (isForHistory(params)) {
    const { source, entry } = params;
    const { desc, sources } = entry;
    const { start, end } = sources;
    return {
      entry: matcher.stateEntry,
      source, desc, start, end
    };
  }
  else {
    const { source } = params;
    return { entry: matcher.stateEntry, source };
  }
};

/** @type {import("./types").GetAssociationsForFn} */
exports.getAssociationsFor = dew(() => {
  /**
   * @param {Context} ctx
   * @param {AssociationSources} source
   * @param {boolean} [create]
   * @returns {Maybe<EntryToAssociationMap>}
   */
  const impl = (ctx, source, create = false) => {
    let innerMap = ctx.stateAssociations.get(source);
    if (innerMap || !create) return innerMap;
    innerMap = new Map();
    ctx.stateAssociations.set(source, innerMap);
    return innerMap;
  };

  return shutUpTS(impl);
});

/**
 * @param {import("aid-bundler/src/aidData").AIDData} data
 * @param {UsedTopicsMap} [usedTopics]
 * @returns {Iterable<[MatchableEntry, FlatAssociationParams]>}
 */
exports.associationsHelper = function* (data, usedTopics) {
  const ctx = data.stateEngineContext;
  const { playerMemory, state } = data;
  const { memory: { frontMemory }, $$setAuthorsNote } = state;
  // Let's get the easy stuff out of the way first.
  for (const matcher of ctx.sortedStateMatchers) {
    if (matcher.targetSources.has("implicit"))
      yield [matcher, { source: "implicit" }];
    if (playerMemory && matcher.targetSources.has("playerMemory"))
      yield [matcher, { source: "playerMemory", entry: playerMemory }];
    if (!$$setAuthorsNote && matcher.targetSources.has("authorsNote"))
      yield [matcher, { source: "authorsNote" }];
    if (!frontMemory && matcher.targetSources.has("frontMemory"))
      yield [matcher, { source: "frontMemory" }];
  }

  // Next, we'll run through the implicit inclusions and give a chance for entries
  // to add themselves in by being referenced within them.
  for (const matcher of ctx.sortedStateMatchers) {
    if (!matcher.targetSources.has("implicitRef")) continue;

    for (const includedId of exports.getAssociationsFor(ctx, "implicit", true).keys()) {
      if (matcher.entryId === includedId) continue;
      const otherEntry = assertExists(MISSING_ENTRY, ctx.entriesMap.get(includedId));
      yield [matcher, { source: "implicitRef", entry: otherEntry }];
    }
  }

  // Now we'll do the actual history texts.
  for (const [offset, historyEntry] of ctx.workingHistory)
    for (const matcher of ctx.sortedStateMatchers)
      if (matcher.targetSources.has("history"))
        yield [matcher, { source: offset, entry: historyEntry, usedTopics }];
};

exports.makePreRuleIterators = dew(() => {
  const nilIter = () => [];

  /**
   * @param {Context} ctx
   * @returns {(source: AssociationSources) => Iterable<PreRuleIteratorResult>}
   */
  const makeRuleIterator = (ctx) => function* (source) {
    const associations = exports.getAssociationsFor(ctx, source);
    if (!associations) return;
    for (const id of associations.keys()) {
      const entry = assertExists(MISSING_ENTRY, ctx.entriesMap.get(id));
      yield tuple2(entry, source);
    }
  };

  /**
   * @param {Context} ctx
   * @param {StateEngineEntry} stateEntry
   * @param {AssociationSources} source
   * @returns {PreRuleIterators}
   */
  const impl = (ctx, stateEntry, source) => {
    const entryCount = ctx.config.get("integer", "entryCount");
    const getFor = makeRuleIterator(ctx);

    const before = dew(() => {
      if (typeof source === "string") return nilIter;
      return function* () {
        for (let i = source + 1; i <= entryCount; i++)
          yield* getFor(i);
      };
    });
  
    const current = function* () {
      for (const otherEntry of getFor(source))
        if (otherEntry[0].entryId !== stateEntry.entryId)
          yield otherEntry;
    };
  
    const after = dew(() => {
      if (typeof source === "string") return nilIter;
      return function* () {
        for (let i = source - 1; i >= 0; i--)
          yield* getFor(i);
      };
    });

    return { getFor, before, current, after };
  };

  return impl;
});

/**
 * @param {PreRuleIterators} preRuleIter
 * @param {ScoresMap} scoresMap
 * @param {Array<[StateEngineEntry, AssociationSources]>} usedEntries
 * @returns {PostRuleIterators}
 */
exports.toPostRuleIterators = (preRuleIter, scoresMap, usedEntries) => {
  /** @type {any} */
  const postRuleIter = chain(toPairs(preRuleIter))
    .concat([tuple2("selected", () => usedEntries)])
    .map(([key, iteratorFn]) => {
      /**
       * @param  {[] | [AssociationSources]} args 
       * @returns {Iterable<PostRuleIteratorResult>}
       */
      const adapted = (...args) => {
        // @ts-ignore - More argument shenanigans that TS don't understand.
        const iterable = iteratorFn(...args);
        return mapIter(iterable, ([otherEntry, source]) => {
          const score = scoresMap.get(source)?.get(otherEntry.entryId) ?? 0;
          return tuple3(otherEntry, source, score);
        });
      };

      return tuple2(key, adapted);
    })
    .value((kvps) => fromPairs(kvps));

  return postRuleIter;
};