const { chain, partition, fromPairs, tuple } = require("../utils");
const { setsIntersect, setIsSubsetOf } = require("../utils");

/**
 * Iterates a `usedTopics` map across a range of entries.
 * Bear in mind that the `start` and `end` are offsets from the latest
 * `history` entry into the past.
 * 
 * So, `0` is the just-now inputted text from the player, and `1` is
 * the last entry in `history`, and `2` is the the next oldest `history`
 * entry, and so on.
 * 
 * @param {UsedTopicsMap} usedTopics
 * @param {number} start
 * @param {number} end
 * @returns {Iterable<string>}
 */
exports.iterUsedTopics = function*(usedTopics, start, end) {
  // Make sure we don't go before the available history.
  let index = Math.max(start, 0);
  while(index <= end) {
    const theTopics = usedTopics.get(index);
    if (theTopics) yield* theTopics;
    index += 1;
  }
}

class RelatableEntry {
  /**
   * @param {readonly AnyRelationDef[]} relations
   * @param {number} entryCount
   */
  constructor(relations, entryCount) {
    const { isRelationOfType } = require("./parsers/checks");

    const relsByType = chain(relations)
      .map((relDef) => {
        if (isRelationOfType(relDef, "allOf"))
          return tuple("allOf", relDef.topic);
        if (isRelationOfType(relDef, "atLeastOne"))
          return tuple("atLeastOne", relDef.topic);
        if (isRelationOfType(relDef, "immediate"))
          return tuple("immediate", relDef.topic);
        if (isRelationOfType(relDef, "negated"))
          return tuple("negated", relDef.topic);
        throw new Error(`Unknown relation type: ${relDef.type}`);
      })
      .thru((kvps) => partition(kvps))
      .value((kvps) => fromPairs(kvps));

    this.entryCount = entryCount;

    this.allOf = new Set(relsByType.allOf ?? []);
    this.atLeastOne = new Set(relsByType.atLeastOne ?? []);
    this.immediate = new Set(relsByType.immediate ?? []);
    this.negated = new Set(relsByType.negated ?? []);

    this.topicsOfInterest = new Set(relations.map((relDef) => relDef.topic));
    this.topicsForMatch = new Set([...this.allOf, ...this.atLeastOne, ...this.immediate]);
  }

  /**
   * Checks if this relator is interested in any of the topics in the given `topicSet`.
   * 
   * Unlike `isMemberOf`, this checks to see if the relator recognizes any topic for
   * any of its relations, including negated relations.  It is mostly useful for determining
   * if a `check` would be worth running in the first place.
   * 
   * @param {Set<string>} topicSet
   * @returns {boolean}
   */
  isInterestedIn(topicSet) {
    return setsIntersect(topicSet, this.topicsOfInterest);
  }

  /**
   * Checks if this relator has relations that could match a topic in the given `topicSet`.
   * 
   * Unlike `isInterestedIn`, this skips negated topics that could cause a `check` to fail.
   * Its most useful after a successful `check` for quickly determining membership between
   * different entries, IE: whether one entry recognizes another.
   * 
   * @param {Set<string>} topicSet
   * @returns {boolean}
   */
  isMemberOf(topicSet) {
    return setsIntersect(topicSet, this.topicsForMatch);
  }

  /**
   * Checks for matching topics in the given `UsedTopicsMap` across the given range of history
   * sources.  Returns `false` if the match failed, but you can get a `0` if the relations
   * were all empty, which still generally counts as a successful match.
   * 
   * So, make sure you use `===` with `false` to check for complete failures.
   * 
   * @param {UsedTopicsMap} usedTopicsMap
   * A map of history sources to sets of entry topics.
   * @param {number} start
   * The history source to begin the search at.
   * @param {number} [end]
   * The history source to end the search at.
   * @returns {false | number}
   */
  check(usedTopicsMap, start, end = this.entryCount) {
    // Short circuit if we have no relations.
    if (this.topicsOfInterest.size === 0) return 0;

    const usedTopics = new Set(exports.iterUsedTopics(usedTopicsMap, start, end));
    
    // Check negated relations.
    if (!this.checkNegated(usedTopics)) return false;
    
    // Check at-least-one relations.
    const atLeastOneCount = this.checkAtLeastOne(usedTopics);
    if (atLeastOneCount === false) return false;

    // Check all-of relations.
    const allOfCount = this.checkAllOf(usedTopics);
    if (allOfCount === false) return false;

    // Check immediate relations.
    // These relations only match the current history entry, which is assumed to be `start`.
    const immediateCount = this.checkImmediate(new Set(exports.iterUsedTopics(usedTopicsMap, start, start)));
    if (immediateCount === false) return false;
    
    const matchCount = atLeastOneCount + allOfCount + immediateCount;
    return matchCount === 0 ? false : matchCount;
  }

  /**
   * Checks for matching topics in the set of `usedTopics`.  Returns `false` if the match
   * failed, but you can get a `0` if the relations were all empty, which still generally
   * counts as a successful match.
   * 
   * So, make sure you use `===` with `false` to check for complete failures.
   * 
   * @param {Set<string>} usedTopics
   * The set of strings to match.
   * @param {boolean} [includeImmediate]
   * If `true`, it will also check immediate relations, disregarding where `usedTopics` was
   * sourced from.  In this case, immediate relations are treated the same as all-of relations.
   * @returns {false | number}
   */
  checkTopics(usedTopics, includeImmediate = false) {
    if (this.topicsOfInterest.size === 0) return 0;
    if (usedTopics.size === 0) return false;

    // Check negated relations.
    if (!this.checkNegated(usedTopics)) return false;
    
    // Check at-least-one relations.
    const atLeastOneCount = this.checkAtLeastOne(usedTopics);
    if (atLeastOneCount === false) return false;

    // Check all-of relations.
    const allOfCount = this.checkAllOf(usedTopics);
    if (allOfCount === false) return false;

    // Exit early if we're not interested in immediate relations.
    if (!includeImmediate) return atLeastOneCount + allOfCount;

    // Check immediate relations.
    const immediateCount = this.checkImmediate(usedTopics);
    if (immediateCount === false) return false;

    return atLeastOneCount + allOfCount + immediateCount;
  }

  /**
   * @param {Set<string>} usedTopics
   * @returns {boolean}
   */
  checkNegated(usedTopics) {
    if (this.negated.size === 0) return true;
    return !setsIntersect(usedTopics, this.negated);
  }

  /**
   * @param {Set<string>} usedTopics
   * @returns {number | false}
   */
  checkAtLeastOne(usedTopics) {
    if (this.atLeastOne.size === 0) return 0;
    if (usedTopics.size === 0) return false;

    let matchCount = 0;
    for (const relTopic of this.atLeastOne)
      if (usedTopics.has(relTopic)) matchCount += 1;
    return matchCount === 0 ? false : matchCount;
  }

  /**
   * @param {Set<string>} usedTopics
   * @returns {number | false}
   */
  checkAllOf(usedTopics) {
    if (this.allOf.size === 0) return 0;
    if (usedTopics.size === 0) return false;
    if (!setIsSubsetOf(this.allOf, usedTopics)) return false;
    return this.allOf.size;
  }

  /**
   * @param {Set<string>} usedTopics
   * @returns {number | false}
   */
  checkImmediate(usedTopics) {
    if (this.immediate.size === 0) return 0;
    if (usedTopics.size === 0) return false;
    if (!setIsSubsetOf(this.immediate, usedTopics)) return false;
    return this.immediate.size;
  }
}

exports.RelatableEntry = RelatableEntry;

/** An empty relatable entry, for initialization. */
exports.nilRelatableEntry = new RelatableEntry([], 0);