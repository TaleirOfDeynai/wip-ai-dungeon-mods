const { getText } = require("../utils");
const { isParamsFor, isParamsTextable, stateDataString } = require("./utils");
const { isInclusiveKeyword, isInclusiveRelation } = require("./parsers/checks");

/**
 * Error for general errors involving `StateEngineEntry`.
 */
class BadStateEntryError extends Error {
  /**
   * @param {string} message
   */
  constructor(message) {
    super(message);

    // @ts-ignore - That's why we're checking, TS.
    Error.captureStackTrace?.(this, this.constructor);
    this.name = this.constructor.name;
  }
}

/**
 * More specific error involving type mismatches while generating
 * `StateEngineEntry` instances.
 */
class InvalidTypeError extends BadStateEntryError {}

// A symbol for a private backing field.
const $$relations = Symbol("StateEngineEntry.relations");

class StateEngineEntry {

  /**
   * @param {Context["config"]} config
   */
  constructor(config) {
    /** The entry's ID. */
    this.entryId = "";
    /** @type {Set<string>} All topics assigned to the entry. */
    this.topics = new Set();
    /** @type {AnyKeywordDef[]} The entry's keywords, for text matching. */
    this.keywords = [];
    /** A helper for checking relations against topics in the `UsedTopicsMap`. */
    this.relator = require("./RelatableEntry").nilRelatableEntry;
    /** @type {Map<AssociationSources, number>} Storage for relations found per source. */
    this.relationCounts = new Map();

    /** @type {import("./config").StateEngineConfig} The State-Engine configuration instance. */
    this.config = config;

    /** @type {ReadonlyArray<AnyRelationDef>} Private backing field for `relations`. */
    this[$$relations] = [];
  }

  /**
   * The type for this kind of entry.
   * 
   * Must be overridden by child classes.
   * 
   * @type {string}
   */
  static get forType() {
    throw new TypeError([
      "Override me with a type string.",
      "IE: if I'm for `$Lore`, make me return `\"Lore\"`."
    ].join("  "));
  }

  /**
   * Given the `AIDData` object, returns an iterable of `StateEngineEntry`
   * instances that could be built for this class.
   * 
   * Must be overridden by child classes.
   * 
   * @param {AIDData} data
   * @param {Context} ctx
   * @returns {Iterable<StateEngineEntry>}
   */
  static produceEntries(data, ctx) {
    throw new TypeError("Override me so I produce entries of this type.");
  }

  /**
   * The type of this instance.
   * 
   * @type {string}
   */
  get type() {
    // @ts-ignore
    return this.constructor.forType;
  }

  /**
   * The associated text of this entry.  Defaults to an empty-string.
   * 
   * @type {string}
   */
  get text() {
    return "";
  }

  /**
   * The specific association sources that this entry can match.
   * - Return `null` to match all sources with text, which is `implicitRef`,
   *   `playerMemory`, and `history`.  This is the default behavior.
   * - Returning `[]` will match no sources, making the entry useless.
   * 
   * Specifying this can speed up processing by skipping entries that have
   * no interest in certain sources.
   * 
   * @type {AssociationTargets[] | null}
   */
  get targetSources() {
    return null;
  }

  /**
   * The priority of this entry.  Priority affects how entries will be sorted
   * in the final text delivered to the AI.  Higher priority means it will
   * tend to appear earlier in the output.
   * 
   * @type {number | undefined}
   */
  get priority() {
    return undefined;
  }

  /**
   * The entry's relations to other topics.
   * 
   * Setting this value will automatically update `relator`.
   * 
   * @type {readonly AnyRelationDef[]}
   */
  get relations() {
    return this[$$relations];
  }
  set relations(value) {
    this[$$relations] = Object.isFrozen(value) ? value : Object.freeze([...value]);
    // Update the relator with the new relations.
    const relatable = require("./RelatableEntry");
    this.relator
      = value.length === 0 ? relatable.nilRelatableEntry
      : new relatable.RelatableEntry(this.relations, this.config.get("integer", "entryCount"));
  }

  /**
   * Whether this entry has inclusive keywords.
   */
  get hasInclusiveKeywords() {
    return this.keywords.some(isInclusiveKeyword);
  }

  /**
   * Whether this entry has inclusive relations.
   */
  get hasInclusiveRelations() {
    return this.relations.some(isInclusiveRelation);
  }

  /**
   * Whether this entry has inclusive matchers of any sort.
   */
  get hasInclusiveMatchers() {
    return this.hasInclusiveKeywords || this.hasInclusiveRelations;
  }

  /**
   * Whether this entry has matchers of any sort.
   */
  get hasMatchers() {
    if (this.keywords.length > 0) return true;
    if (this.relations.length > 0) return true;
    return false;
  }

  /**
   * Handles deferred initialization of the class.
   * 
   * @param {string} entryId
   * @param {string[]} [topics]
   * @param {Object} [matchingOpts]
   * @param {AnyRelationDef[]} [matchingOpts.relations]
   * @param {AnyKeywordDef[]} [matchingOpts.keywords]
   * @returns {this}
   */
  init(entryId, topics, matchingOpts) {
    this.entryId = entryId;
    this.topics = new Set(topics ?? []);
    this.relations = matchingOpts?.relations ?? [];
    this.keywords = matchingOpts?.keywords ?? [];
    return this;
  }

  /**
   * Validation function for the entry.  Allows you to report issues with the data
   * that was parsed.  If a non-empty array is returned, State Engine will block
   * the current turn from continuing until the issue is resolved.
   * 
   * If your state entry doesn't support keywords, you can provide this issue as
   * a string in the returned array and it will be reported to the player.
   * 
   * By default, no validation issues are provided.
   * 
   * @returns {string[]}
   */
  validator() {
    return [];
  }

  /**
   * After all entries have been built and validated, this method allows you to
   * tweak the information of this entry based on how other entries are configured.
   * 
   * The map received as `allStates` contains POJO copies of other states immediately
   * after validation.  Altering them does not affect the actual `StateEngineEntry`
   * instance they came from.
   * 
   * @param {Map<string, StateDataForModifier>} allStates
   * @returns {void}
   */
  modifier(allStates) {
    return;
  }

  /**
   * Checks if a state entry should be associated with a source of information.
   * 
   * Use `params.source` to determine the information being matched:
   * - `"implicit"` - No text to match on, but if associated, the entry will just be
   *   included.  Only one entry of each time will ultimately be selected.
   * - `"implicitRef"` - Allows entries to match other entries that were associated
   *   implicitly.  This allows you to have recursive matches, where entries can
   *   elaborate on other entries.
   * - `"playerMemory"` - Provides the current player memory for matching.
   * - `"authorsNote"` - No text to match on, but if associated and selected, this
   *   entry will be placed into `state.memory.authorsNote`.
   * - `"frontMemory"` - No text to match on, but if associated and selected, this
   *   entry will be placed into `state.memory.frontMemory`.
   * - `"number"` - Provides a history entry for matching.  The value is the offset
   *   from the latest history entry, so `0` is the text just provided by the player,
   *   `1` is the last element of the `history` array, etc.
   * 
   * The `matcher` instance provides helpers to efficiently match keywords to text.
   * 
   * @param {MatchableEntry} matcher
   * @param {AssociationParamsFor<this>} params
   * @returns {boolean}
   * Whether this entry should be associated with this source.
   */
  associator(matcher, params) {
    // The default associator requires text to do any form of matching.
    if (!isParamsTextable(params)) return false;
    // Player memory sources require inclusive keywords.
    if (isParamsFor("playerMemory", params) && !this.hasInclusiveKeywords) return false;
    // Implicit references require inclusive matchers of some form.
    if (isParamsFor("implicitRef", params) && !this.hasInclusiveMatchers) return false;

    if (!this.checkKeywords(matcher, params)) return false;
    if (!this.checkRelations(matcher, params)) return false;

    this.recordTopicUsage(params);
    return true;
  }

  /**
   * A helper method that checks if the entry's keywords are matched in the text.
   * 
   * Returns `true` when:
   * - This entry has no keywords that could or could not be matched.
   * - The source has text and at least one inclusive and zero exclusive keywords
   *   were matched.
   * 
   * @param {MatchableEntry} matcher
   * @param {AssociationParamsFor<this>} params
   * @returns {boolean}
   * Whether this entry's relations were satisfied for this source.
   */
  checkKeywords(matcher, params) {
    const hasKeywords = (matcher.include.length + matcher.exclude.length) > 0;
    // Pass it by default if it has no keywords to match.
    if (!hasKeywords) return true;
    // If this source has no text, we fail the match.
    if (!isParamsTextable(params)) return false;
    
    // @ts-ignore - Not sure why this isn't being narrowed.  TS dumb as shit.
    const text = getText(params.entry).trim();
    if (!text) return false;
    if (matcher.hasExcludedWords(text)) return false;
    if (!matcher.hasIncludedWords(text)) return false;
    return true;
  }

  /**
   * A helper method that checks if this entry's relations are referenced in other
   * entries.
   * 
   * Returns `true` when:
   * - This source is not `"history"`.
   * - It doesn't have any relations to check for.
   * - The entry's relations are satisfied.
   * 
   * @param {MatchableEntry} matcher
   * @param {AssociationParamsFor<this>} params
   * @returns {boolean}
   * Whether this entry's relations were satisfied for this source.
   */
  checkRelations(matcher, params) {
    if (isParamsFor("playerMemory", params)) {
      // Entries with relations can never match the player memory, as it cannot have topics.
      return !this.hasInclusiveRelations;
    }

    if (isParamsFor("implicitRef", params)) {
      // If we have no inclusive matchers, we won't associate at all.
      if (!this.hasInclusiveMatchers) return false;
      // If we matched keywords, but have no relations to test, go ahead and associate.
      if (this.hasInclusiveKeywords && this.relations.length === 0) return true;

      // For implicit references, we'll check the entry's topics to see if the
      // entry can satisfy the needed relations.
      const { entry } = params;
      const result = this.relator.checkTopics(entry.topics);
      // Triggered a negation; no match.
      if (result === false) return false;
      // Avoided a negation, but no inclusive match; no match.
      if (result === 0 && !this.hasInclusiveKeywords) return false;
      // We don't track relation counts for implicit refs.
      return true;
    }

    if (isParamsFor("history", params)) {
      // No relations to match; default is success.
      if (this.relations.length === 0) return true;

      // For history sources, we'll use the `usedTopics` map to see if other entries
      // have brought the needed topics into context.
      const { source, usedTopics } = params;
      const result = this.relator.check(usedTopics, source);
      if (result === false) return false;
      this.relationCounts.set(source, result);
      return true;
    }

    return true;
  }

  /**
   * Handles the recording of the entry's topics in `usedTopics` for history sources.
   * This is safe to call, even if the source is not for the history.
   * 
   * @param {AssociationParamsFor<this>} params 
   * @returns {void}
   */
  recordTopicUsage(params) {
    if (this.topics.size === 0) return;
    if (!isParamsFor("history", params)) return;

    const { source, usedTopics } = params;
    const theTopics = usedTopics.get(source) ?? new Set();
    for (const topic of this.topics) theTopics.add(topic);
    usedTopics.set(source, theTopics);
  }

  /**
   * Allows an entry to check the state of the associations after they have been
   * completed, but before scoring them.  This provides an opportunity to discard
   * entries strategically, based on the scores and kinds of associations matched
   * to particular sources.
   * 
   * Use `neighbors` to explore the other associations.
   * 
   * Pre-rules are run in the order of:
   * - The `implicit` source.
   * - The `playerMemory` source.
   * - The `authorsNote` source.
   * - The `frontMemory` source.
   * - The `implicitRef` source.
   * - The history, in temporal order, so `20, 19, 18, ...` and so on to `0`.
   * 
   * @param {MatchableEntry} matcher
   * @param {AssociationSourcesFor<this>} source
   * @param {PreRuleIterators} neighbors
   * @returns {boolean}
   * Whether this entry's association should be retained.
   */
  preRules(matcher, source, neighbors) {
    return true;
  }

  /**
   * Allows an entry to calculate its score.
   * 
   * The score is calculated based on:
   * - A base scalar (`1` by default).
   * - The total inclusive keywords matched versus unique inclusive keywords matched.
   *   Assumes a 1-to-2 ratio if the entry has no keywords or was associated without
   *   them, effectively penalizing the entry for not being matched through text.
   * - The number of exclusive keywords dodged.
   * - The number of related topics that had to match for this to match.
   * - The number of negated relations dodged.
   * 
   * When overriding, if you only want to provide a boost to the base scalar, simply
   * call `super.valuator` and pass an argument for `baseScalar`.
   * 
   * @param {MatchableEntry} matcher
   * @param {AssociationSourcesFor<this>} source
   * @param {StateEngineEntry | HistoryEntry | string} entry
   * @param {number} [baseScalar]
   * @returns {number}
   */
  valuator(matcher, source, entry, baseScalar = 1) {
    if (baseScalar === 0) return 0;

    const keywordStats = this.getKeywordStats(matcher, source, entry);
    const keywordPart = (keywordStats.matched + keywordStats.bonus) * keywordStats.scalar;

    const relationStats = this.getRelationStats(matcher, source, entry);
    const relationsPart = (relationStats.matched + relationStats.bonus) * relationStats.scalar;

    return 10 * baseScalar * keywordPart * relationsPart;
  }

  /**
   * Calculates information about the performance of keyword matching.
   * 
   * @param {MatchableEntry} matcher
   * @param {AssociationSourcesFor<this>} source
   * @param {StateEngineEntry | HistoryEntry | string} entry
   * @returns {ValuationStats}
   */
  getKeywordStats(matcher, source, entry) {
    const text = getText(entry);
    const incKeywordCount = matcher.include.length;
    const excKeywordCount = matcher.exclude.length;

    checkPenalty: {
      if (!text) break checkPenalty;
      if (excKeywordCount === 0 && incKeywordCount === 0) break checkPenalty;

      const scalar = Math.pow(1.1, excKeywordCount);
      if (incKeywordCount === 0) return { matched: 0, bonus: 1, scalar };

      const totalMatched = matcher.occurrencesIn(text);
      if (totalMatched === 0) break checkPenalty;

      const uniqueMatched = matcher.uniqueOccurrencesIn(text);
      const bonus = Math.max(0, (totalMatched / uniqueMatched) - 1);
      return { matched: uniqueMatched, bonus, scalar };
    }

    // Only penalize if its for a text entry where keyword matching is possible.
    return { matched: 0, bonus: 1, scalar: entry != null ? 0.5 : 1 };
  }

  /**
   * Calculates information about the performance of relation matching.
   * 
   * @param {MatchableEntry} matcher
   * @param {AssociationSourcesFor<this>} source
   * @param {StateEngineEntry | HistoryEntry | string} entry
   * @returns {ValuationStats}
   */
  getRelationStats(matcher, source, entry) {
    const scalar = Math.pow(1.1, this.relator.negated.size);
    const matched = this.relationCounts.get(source) ?? 0;
    return { matched, bonus: 1, scalar };
  }

  /**
   * Allows an entry to check the state of the associations after all entries
   * have been given a score.  This provides an opportunity to discard entries
   * strategically, based on the scores and kinds of associations matched to
   * particular sources.
   * 
   * Use `neighbors` to explore the other associations.
   * 
   * Post-rules are run in the order of:
   * - The history, temporally reversed order, so `0, 1, 2, ...` and so on.
   * - The `implicitRef` source.
   * - The `frontMemory` source.
   * - The `authorsNote` source.
   * - The `playerMemory` source.
   * - The `implicit` source.
   * 
   * These are the final output buckets:
   * - `forContextMemory` can have multiple entries, but only one of each type.
   *   Selected associations from the `implicit`, `implicitRef`, and `playerMemory`
   *   sources end up here.
   * - `forHistory` can have only one entry per history source.
   * - `forFrontMemory` can only have one entry from the `frontMemory` source.
   * - `forAuthorsNote` can only have one entry from the `authorsNote` source.
   * 
   * If this returns `true`, and the target can only have one entry, this entry
   * will be the ultimate selection for that target.
   * 
   * @param {MatchableEntry} matcher
   * @param {AssociationSourcesFor<this>} source
   * @param {number} score
   * @param {PostRuleIterators} neighbors
   * @returns {boolean}
   * Whether this entry's association should be retained.
   */
  postRules(matcher, source, score, neighbors) {
    return true;
  }

  /**
   * Builds a `MatchableEntry` from this instance.
   * 
   * @param {ReturnType<import("./MatchableEntry").memoizedCounter>} [matchCounter]
   * @returns {MatchableEntry}
   */
  toMatchable(matchCounter) {
    const { MatchableEntry } = require("./MatchableEntry");
    return new MatchableEntry(this, matchCounter);
  }

  /**
   * Converts this instance into a string.
   * 
   * @param {boolean} [withExcerpt]
   * @returns {string}
   */
  toString(withExcerpt) {
    const { type, entryId, text: entryText } = this;
    const topics = [...this.topics];
    if (!withExcerpt) return stateDataString({ type, entryId, topics });
    return stateDataString({ type, entryId, topics, entryText });
  }

  /**
   * Serializes a `StateEngineEntry` into a `StateEngineData`.
   * 
   * @returns {StateEngineData}
   */
  toJSON() {
    const { type, entryId } = this;
    const topics = [...this.topics];
    const relations = [...this.relations];
    const keywords = [...this.keywords];
    return { type, entryId, topics, relations, keywords };
  }
}

exports.StateEngineEntry = StateEngineEntry;
exports.BadStateEntryError = BadStateEntryError;
exports.InvalidTypeError = InvalidTypeError;