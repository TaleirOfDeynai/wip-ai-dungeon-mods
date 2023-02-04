/// <reference path="./state-engine.d.ts" />
const { dew, is, escapeRegExp, chain, take, tuple } = require("../utils");
const turnCache = require("../turn-cache");
const { memoizedCounter } = require("./MatchableEntry");
const { allStateEntries } = require("./registry");
const getConfig = require("./config");

const $$data = Symbol("StateEngineApi.data");
const $$history = Symbol("StateEngineApi.history");
const $$discoveryByClass = Symbol("StateEngineApi.discoveryByClass");
const $$fullDiscovery = Symbol("StateEngineApi.fullDiscovery");

/**
 * Matches the type of input mode the player performed to submit the input.
 * This information is not currently provided by the API, and I like normalized data.
 * 
 * @param {import("aid-bundler/src/aidData").AIDData} data
 * @returns {"do" | "say" | "story"}
 */
const parseInputMode = (data) => {
  const { info: { characters }, text } = data;
  const allCharacters = characters
    .map((pi) => pi.name?.trim())
    .filter(Boolean)
    .map((name) => escapeRegExp(name));
  const charMatch = ["you", ...allCharacters].join("|");

  // Check for `say` first, since it is more ambiguous than `do`.
  if (new RegExp(`^\\>\\s+(?:${charMatch}) says?`, "i").test(text)) return "say";
  if (new RegExp(`^\\>\\s+(?:${charMatch})`, "i").test(text)) return "do";
  return "story";
};

class StateEngineApi {

  /**
   * @param {AIDData} data 
   */
  constructor(data) {
    this.config = getConfig(data);
    this.matchCounter = memoizedCounter();
    this.associationCache = turnCache.forWrite(data, "StateEngine.association");

    /** A convenient map from a world-info ID to its instance. */
    this.worldEntries = new Map(chain(data.worldEntries).map((wi) => tuple(wi.id, wi)).value());

    /** @type {Map<string, StateEngineEntry>} */
    this.entriesMap = new Map();

    /** @type {Map<string, string[]>} */
    this.validationIssues = new Map();

    /** @type {import("./MatchableEntry").MatchableEntry[]} */
    this.sortedStateMatchers = [];

    /** @type {StateAssociations} */
    this.stateAssociations = new Map();

    /** @type {ScoresMap} */
    this.scoresMap = new Map();

    this[$$data] = data;
    
    /** @type {Map<number, HistoryIteratorResult> | null} */
    this[$$history] = null;

    /** @type {Map<StateEngineEntryClass, Map<string, StateEnginePotential>>} */
    this[$$discoveryByClass] = new Map();

    /** @type {Map<string, StateEnginePotential> | null} */
    this[$$fullDiscovery] = null;
  }

  /**
   * A {@link Map} containing all the {@link AIDData.history} entries that will be
   * involved in the standard entry association process.  The entries emitted may
   * not map directly to the `history` array.  The function assigned to
   * {@link AIDData.historyIterator} is ultimately responsible for determining
   * how the history is viewed.
   * 
   * The indexing is reversed in comparison to {@link AIDData.history} such that
   * index `0` is the latest entry.  Higher indices go further into the past.
   * 
   * The number of entries provided is influenced by the `entryCount` configuration.
   * 
   * @type {Map<number, HistoryIteratorResult>}
   */
  get workingHistory() {
    // Check for the cached value first.
    const { [$$history]: workingHistory } = this;
    if (workingHistory) return workingHistory;

    // Not cached; build the object.
    const { [$$data]: data, config } = this;
    const { history } = data;
    const entryCount = config.get("integer", "entryCount");

    /**
     * All this is a bit of an artifact from when this ran only during both the
     * input and output phases (but not the context phase).  Keeping it around in
     * case it is ever relevant again.
     * 
     * @type {HistoryEntry | undefined}
     */
    const extraEntry = dew(() => {
      switch (data.phase) {
        // We don't know what the input mode was, so we have to parse it.
        case "input":
          return { text: data.text, type: parseInputMode(data) };
        // Treat the AI's response as a continuation.
        case "output":
          return { text: data.text, type: "continue" };
      }
      return undefined;
    });
  
    return this[$$history] = chain(extraEntry ? [...history, extraEntry] : history)
      .thru(data.historyIterator)
      .thru((entries) => take(entries, entryCount))
      .map((entry) => tuple(entry.offset, entry))
      .value((entries) => new Map([...entries].reverse()));
  }

  /**
   * Given a constructor for some {@link StateEngineEntry}, this will produce
   * a {@link Map} of entries it provides, the entry's ID to its instance, given
   * the current state of the scenario.
   * 
   * This may be a loaded call outside of the context phase.  If you only need a
   * limited number of entries, consider {@link StateEngineApi.getEntryById getEntryById}
   * instead.
   * 
   * @param {StateEngineEntryClass} entryClass
   * @returns {Map<string, StateEnginePotential>}
   */
  discoverEntriesForType(entryClass) {
    const theMap = this[$$discoveryByClass].get(entryClass);
    if (theMap) return theMap;

    const newMap = new Map(entryClass.discoverEntries(this[$$data], this));
    this[$$discoveryByClass].set(entryClass, newMap);
    return newMap;
  }

  /**
   * Produces a listing of potential entries that may be available.
   * 
   * These entries are deferred and not yet materialized, allowing you to examine
   * other entries without fully parsing them.  While most properties of
   * {@link StateEnginePotential} are made safe to access, resolving the
   * {@link StateEnginePotential.entry entry} property may fail due to parsing errors
   * or other issues.
   * 
   * Prefer {@link StateEngineApi.discoverEntriesForType} if you only need potential
   * entries for a single kind of State-Engine entry.
   * 
   * Prefer {@link StateEngineApi.getEntryById getEntryById} if you want a single, full
   * entry.
   * 
   * @returns {Map<string, StateEnginePotential>}
   */
  discoverEntries() {
    const theMap = this[$$fullDiscovery];
    if (theMap) return theMap;

    return this[$$fullDiscovery] = chain(allStateEntries())
      .map((ec) => this.discoverEntriesForType(ec))
      .flatten()
      .value((kvps) => new Map(kvps));
  }

  /**
   * Attempts to locate and materialize an entry with the given ID.
   * 
   * If an error occurs while resolving the entry, the error will be thrown.
   * 
   * @param {string} entryId
   * The ID of the query.
   * @returns {StateEngineEntry | undefined}
   */
  getEntryById(entryId) {
    const theEntry = this.discoverEntries().get(entryId)?.entry.result;
    if (!is.error(theEntry)) return theEntry;
    throw theEntry;
  }

  /**
   * Given a constructor for some {@link StateEngineEntry}, this will produce
   * a {@link Map} of entries it provides, the entry's ID to its instance, given
   * the current state of the scenario.
   * 
   * This may be a loaded call outside of the context phase.  If you only need a
   * limited number of entries, consider {@link StateEngineApi.getEntryById getEntryById}
   * instead.
   * 
   * @param {StateEngineEntryClass} entryClass
   * @returns {Map<string, StateEngineEntry>}
   */
  getEntriesForType(entryClass) {
    this.discoverEntriesForType(entryClass)
  }

}

module.exports = StateEngineApi;