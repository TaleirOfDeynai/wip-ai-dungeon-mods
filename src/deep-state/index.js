/// <reference path="../state-engine/state-engine.d.ts" />
const { tuple, chain, rollDice, setsEqual } = require("../utils");
const { addStateEntry } = require("../state-engine/registry");
const { isParamsFor } = require("../state-engine/utils");

// Configuration.
/** NPC may be implicitly included based on chance. */
const implicitInclusionDiceSides = 20;

/**
 * Deep State Module
 * 
 * Provides specialized entries that can relate to each other, in an effort
 * to provide more contextual information to the AI.
 * 
 * The following entry types are supported:
 * - `$Player` - A player information entry.
 * - `$NPC` - One of these entries may be selected to appear based on
 *   usages of their name in the history and other resources.  Even if there
 *   is no mention, it may appear just to remind the AI of their existence.
 * - `$Scene` - A special entry that will always be included.
 * - `$Lore` - A low priority entry...
 * - `$State` - A high priority entry that may be included based
 *   on the results of a keyword search.
 * 
 * Keywords in entries that support them must be separated by semi-colons; this
 * is to prevent their selection by the usual world info matching rules.
 */

/**
 * Does some global setup for this module.
 * 
 * @type {BundledModifierFn}
 */
const init = (data) => {
  const { EngineEntryForWorldInfo } = require("../state-engine/EngineEntryForWorldInfo");
  const { makeComparable } = require("../stemming/ComparableEntryMixin");
  const { isExclusiveKeyword, isNegatedRelation } = require("../state-engine/parsers/checks");

  const { info } = data;

  /**
   * We implicitly include the first string in `topics` for `Player` and `NPC` as a keyword.
   * 
   * @param {StateEngineEntry} entry 
   * @returns {void}
   */
  const addTopicAsKeyword = (entry) => {
    const [mainTopic] = entry.topics;
    if (!mainTopic) return;
    const hasMainTopic = entry.keywords.some((kw) => kw.type === "include" && kw.value === mainTopic);
    if (hasMainTopic) return;
    entry.keywords.push({ type: "include", exactMatch: true, value: mainTopic });
  };

  class PlayerEntry extends EngineEntryForWorldInfo {
    static get forType() { return "Player"; }
    get targetSources() { return tuple("implicit", "history"); }
    get priority() { return 100; }

    /** A value determining if there are multiple named players. */
    get inMultiplayerMode() {
      // Let's only count named characters.
      return info.characters.filter((char) => Boolean(char.name)).length > 1;
    }

    validator() {
      const issues = super.validator();
      if (!this.topics.size)
        issues.push(`${this.bestName} must have at least one topic.`);
      if (this.relations.length)
        issues.push(`${this.bestName} cannot have relation matchers.`);
      return issues;
    }

    modifier() {
      // Add the character's name as a keyword.
      addTopicAsKeyword(this);
    }

    /**
     * If this is a single-player session, the player entry is always included as an
     * implicit reference.  In multi-player sessions, it works like a very powerful
     * `State` entry instead.
     * 
     * @param {MatchableEntry} matcher 
     * @param {AssociationParamsFor<this>} params 
     * @returns {boolean}
     */
    associator(matcher, params) {
      // Always include it implicitly when there's only a single player.
      if (isParamsFor("implicit", params) && !this.inMultiplayerMode) return true;
      // Use the default associator, otherwise.
      return super.associator(matcher, params);
    }

    /**
     * @param {MatchableEntry} matcher
     * @param {AssociationSourcesFor<this>} source
     * @param {StateEngineEntry | HistoryEntry | string} entry
     * @returns {number}
     */
    valuator(matcher, source, entry) {
      // Give a flat score, if it's an implicit match.
      if (source === "implicit") return 50;
      // Otherwise, boost them up to the level of `$State` entries.
      return super.valuator(matcher, source, entry, 5);
    }

    /**
     * @param {MatchableEntry} matcher 
     * @param {AssociationSourcesFor<this>} source 
     * @param {number} score 
     * @param {PostRuleIterators} neighbors 
     * @returns {boolean}
     */
    postRules(matcher, source, score, neighbors) {
      // Always retain when implicit.
      if (source === "implicit") return true;
      // Always drop for any other source, except for the history.
      if (typeof source !== "number") return false;
      // If this entry is already included implicitly, drop this association.
      for (const [otherEntry] of neighbors.getFor("implicit"))
        if (otherEntry.entryId === this.entryId) return false;
      return true;
    }
  }

  class NpcEntry extends EngineEntryForWorldInfo {
    static get forType() { return "NPC"; }
    get targetSources() { return tuple("implicit", "history"); }
    get priority() { return 90; }

    validator() {
      const issues = super.validator();
      if (!this.topics.size)
        issues.push(`${this.bestName} must have at least one topic.`);
      if (this.relations.length)
        issues.push(`${this.bestName} cannot have relation matchers.`);
      return issues;
    }

    modifier() {
      // Add the character's name as a keyword.
      addTopicAsKeyword(this);
    }

    /**
     * Has a chance to implicitly include an NPC, as a means to "remind" the AI of
     * their existence.
     * 
     * @param {MatchableEntry} matcher 
     * @param {AssociationParamsFor<this>} params 
     * @returns {boolean}
     */
    associator(matcher, params) {
      const diceSize = implicitInclusionDiceSides;
      // Has a chance of being implicitly included.
      if (isParamsFor("implicit", params)) return rollDice(1, diceSize) === diceSize;
      // Otherwise, use the default associator from here on.
      return super.associator(matcher, params);
    }

    /**
     * @param {MatchableEntry} matcher
     * @param {AssociationSourcesFor<this>} source
     * @param {StateEngineEntry | HistoryEntry | string} entry
     * @returns {number}
     */
    valuator(matcher, source, entry) {
      // Give a flat score if it only won the dice roll.
      if (source === "implicit") return 25;
      // Give these entries a boost if they're referenced in the text.
      return super.valuator(matcher, source, entry, 4);
    }
  }

  class LocationEntry extends EngineEntryForWorldInfo {
    static get forType() { return "Location"; }
    get targetSources() { return tuple("implicit", "history"); }
    get priority() { return 80; }

    validator() {
      const issues = super.validator();
      if (!this.topics.size)
        issues.push(`${this.bestName} must have at least one topic.`);
      return issues;
    }

    modifier() {
      // Add the location's name as a keyword.
      addTopicAsKeyword(this);
    }

    /**
     * Has a chance to implicitly include a location, as a means to "remind" the AI of
     * its existence.
     * 
     * @param {MatchableEntry} matcher 
     * @param {AssociationParamsFor<this>} params 
     * @returns {boolean}
     */
    associator(matcher, params) {
      const diceSize = implicitInclusionDiceSides;
      // Has a chance of being implicitly included.
      if (isParamsFor("implicit", params)) return rollDice(1, diceSize) === diceSize;
      // Otherwise, use the default associator from here on.
      return super.associator(matcher, params);
    }

    /**
     * @param {MatchableEntry} matcher
     * @param {AssociationSourcesFor<this>} source
     * @param {StateEngineEntry | HistoryEntry | string} entry
     * @returns {number}
     */
    valuator(matcher, source, entry) {
      // Give a flat score if it only won the dice roll.
      if (source === "implicit") return 25;
      // Give these entries a boost if they're referenced in the text.
      return super.valuator(matcher, source, entry, 4);
    }
  }

  class SceneEntry extends EngineEntryForWorldInfo {
    static get forType() { return "Scene"; }
    get targetSources() { return tuple("implicit"); }
    get priority() { return 50; }

    validator() {
      const issues = super.validator();
      if (this.topics.size)
        issues.push(`${this.bestName} cannot be given a topic.`);
      if (this.relations.length || this.keywords.length)
        issues.push(`${this.bestName} cannot have any matchers.`);
      return issues;
    }

    associator() {
      // Only associates implicitly.
      return true;
    }

    valuator() {
      // Give these entries a flat score.
      return 40;
    }
  }

  class LoreEntry extends makeComparable(data, EngineEntryForWorldInfo) {
    /**
     * @param {WorldInfoEntry} worldInfo
     * @param {Context["config"]} config
     */
    constructor(worldInfo, config) {
      super(worldInfo, config);

      /** @type {Map<AssociationSources, boolean>} */
      this.hasMatchedStateMap = new Map();
    }

    static get forType() { return "Lore"; }
    get targetSources() { return tuple("playerMemory", "implicitRef", "history"); }

    /**
     * Copies the matchers from another `Lore` entry when this entry lacks positive
     * matchers and it shares all the same topics with exactly one other lore entry that
     * only has positive matchers.
     * 
     * Negative matchers are not considered for this entry, allowing you to exclude
     * it when certain keywords appear.
     * 
     * This makes it a little less irritating to create multiple lore entries for
     * the same concept or thing.
     * 
     * @param {Map<string, StateDataForModifier>} allStates
     * @returns {void}
     */
    modifier(allStates) {
      if (this.topics.size === 0) return;
      if (this.hasInclusiveMatchers) return;

      // If a `Lore` has the same `topics` as another entry of the same type,
      // and this entry lacks inclusive matchers, but the other does not, we'll
      // copy those matchers to this entry.
      const duplicateEntries = chain(allStates.values())
        .filter((sd) => {
          // Must be the same type.
          if (sd.type !== this.type) return false;
          // Must also have topics defined.
          if (sd.topics.size === 0) return false;
          // Must have the same topics.
          if (!setsEqual(sd.topics, this.topics)) return false;
          // Cannot have any negative matchers of any kind.
          if (sd.keywords.some(isExclusiveKeyword)) return false;
          if (sd.relations.some(isNegatedRelation)) return false;
          // But it does need to have at least one positive matcher.
          const matcherCount = sd.keywords.length + sd.relations.length;
          if (matcherCount === 0) return false;
          return true;
        })
        .toArray();

      // Must be exactly one match for this to apply.
      if (duplicateEntries.length !== 1) return;

      const [chosenEntry] = duplicateEntries;
      this.keywords = [...chosenEntry.keywords];
      this.relations = [...chosenEntry.relations];
    }

    /**
     * If a `Lore` entry lacks keywords, we limit the range the relations can match
     * to only the current history entry and the one immediately before it.
     * 
     * This keeps `Lore` entries that have no connection to the text from getting
     * thrown on to any entry, willy-nilly, while still giving it the chance to
     * provide a little more context to a previous entry.
     * 
     * @param {MatchableEntry} matcher
     * @param {AssociationParamsFor<this>} params
     * @returns {boolean}
     * Whether this entry's relations were satisfied for this source.
     */
     checkRelations(matcher, params) {
      if (this.hasInclusiveKeywords) return super.checkRelations(matcher, params);
      if (!isParamsFor("history", params)) return false;
      const { source, usedTopics } = params;

      // For naked `$Lore` entries, totally lacking matchers, we'll just throw them in.
      if (this.relations.length === 0) return true;

      // Otherwise, limit the search for relations.
      const result = this.relator.check(usedTopics, source, source + 1);
      if (result === false) return false;
      this.relationCounts.set(source, result);
      return true;
    }

    /**
     * Does some pre-processing on the matches, looking for a later `State`
     * entry that references this `Lore` entry.
     * 
     * @param {MatchableEntry} matcher
     * @param {AssociationSourcesFor<this>} source
     * @param {PreRuleIterators} neighbors
     * @returns {boolean}
     */
    preRules(matcher, source, neighbors) {
      const { topics } = this;
      if (topics.size === 0) return true;

      // Later states only, because we don't want this lore entry over
      // shadowing the more important state entry.
      for (const [otherEntry] of neighbors.after()) {
        if (otherEntry.type !== "State") continue;
        if (!otherEntry.relator.isMemberOf(topics)) continue;
        this.hasMatchedStateMap.set(source, true);
        break;
      }

      return true;
    }

    /**
     * Give a boost if this `Lore` was referenced by a later `State`.
     * 
     * @param {MatchableEntry} matcher
     * @param {AssociationSourcesFor<this>} source
     * @param {StateEngineEntry | HistoryEntry | string} entry
     * @returns {number}
     */
    valuator(matcher, source, entry) {
      const scalar = this.hasMatchedStateMap.get(source) ? 2 : 1;
      return super.valuator(matcher, source, entry, scalar);
    }
  }

  class StateEntry extends makeComparable(data, EngineEntryForWorldInfo) {
    static get forType() { return "State"; }
    get targetSources() { return tuple("history"); }

    validator() {
      const issues = super.validator();
      if (this.topics.size > 1)
        issues.push(`${this.bestName} cannot have more than one topic.`);
      if (this.keywords.length === 0 && this.relations.length === 0)
        issues.push(`${this.bestName} must have at least one matcher.`);
      return issues;
    }

    /**
     * The `State` type is a little bit different.  It's for immediately relevant
     * information.  When it has relations, we want to only associate this with
     * entries that are nearby to the related matches.  We define this as being
     * the current history entry and the two immediately before it.
     * 
     * @param {MatchableEntry} matcher
     * @param {AssociationParamsFor<this>} params
     * @returns {boolean}
     * Whether this entry's relations were satisfied for this source.
     */
    checkRelations(matcher, params) {
      if (!isParamsFor("history", params)) return false;
      const { source, usedTopics } = params;

      if (this.relations.length === 0) return true;
      const result = this.relator.check(usedTopics, source, source + 2);
      if (result === false) return false;
      this.relationCounts.set(source, result);
      return true;
    }

    /**
     * Because `State` scores can be so high and dominating over other entries,
     * only two are allowed to ultimately be emitted.
     * 
     * @param {MatchableEntry} matcher
     * @param {AssociationSourcesFor<this>} source
     * @param {number} score
     * @param {PostRuleIterators} neighbors
     * @returns {boolean}
     */
    postRules(matcher, source, score, neighbors) {
      let curCount = 0;
      for (const [otherEntry] of neighbors.selected()) {
        if (curCount >= 2) return false;
        if (otherEntry.type !== "State") continue;
        curCount += 1;
      }
      return curCount < 2;
    }
  }

  addStateEntry(PlayerEntry);
  addStateEntry(NpcEntry);
  addStateEntry(LocationEntry);
  addStateEntry(SceneEntry);
  addStateEntry(LoreEntry);
  addStateEntry(StateEntry);
};

exports.stateModule = {
  pre: [init]
};