/// <reference path="../state-engine/state-engine.d.ts" />
const { dew, getEntryText } = require("../utils");
const turnCache = require("../turn-cache");
const { dataFromCache } = require("../state-engine/utils");
const perLineIterator = require("../state-engine/iterators/perLine");
const { WrappedIteratorResult } = require("../state-engine/iterators/_helpers");

/**
 * Gets the nearest association cache object for the current turn.  If an exact
 * match can't be found, it will pull the one immediately before, with its `forHistory`
 * sources shifted accordingly.
 * 
 * It can return `undefined` if no suitable match could be found, such as if the
 * history was undone farther than the cache had memory for.
 * 
 * @param {import("aid-bundler/src/aidData").AIDData} aidData
 * @returns {Maybe<StateDataCache>}
 */
exports.getClosestCache = (aidData) => {
  /** @type {import("../turn-cache").ReadCache<StateDataCache>} */
  const theCache = turnCache.forRead(aidData, "StateEngine.association", { loose: true });
  const { actionCount } = aidData;
  const { storage, fromTurn } = theCache;
  if (!storage || fromTurn === actionCount) return storage;

  // We can shift this entry to make it usable.
  const theShift = actionCount - fromTurn;
  const newHistory = storage.forHistory.map((data) => {
    // Sanity check.
    if (data.source !== "history") return data;

    const newStart = data.start.source + theShift;
    const newEnd = data.end.source + theShift;
    return {
      ...data,
      start: { ...data.start, source: newStart },
      end: { ...data.end, source: newEnd }
    };
  });
  return { ...storage, forHistory: newHistory };
};

/**
 * Obtains the State Engine entry from `state.$$stateDataCache`.  Augments it
 * with information you're likely to want while processing the context.
 * 
 * @param {import("aid-bundler/src/aidData").AIDData} aidData
 * @param {Maybe<StateEngineCacheData>} assocData
 * @returns {Maybe<ContextData>}
 */
exports.getStateEngineData = (aidData, assocData) => {
  if (assocData == null) return undefined;

  // Can we find this entry's cached data?
  const stateData = dataFromCache(aidData, assocData.entryId);
  if (!stateData) return undefined;
  const { topics: topicsArr, ...restData } = stateData;
  const topics = new Set(topicsArr);

  // And locate some text for the entry?
  const text = dew(() => {
    if (stateData.text) return stateData.text;

    // Try and pull up a world-info from the ID.
    if (stateData.forWorldInfo !== true) return undefined;
    const worldInfo = aidData.worldEntries.find((wi) => wi.id === assocData.entryId);
    if (worldInfo) return getEntryText(worldInfo).trim();
    return undefined;
  })

  // Pass this up if we have no text; it's not useful for context construction.
  if (!text) return undefined;

  return { ...restData, ...assocData, topics, text };
};

/**
 * Cleans up a string for presentation in the context, removing useless
 * characters from the output.
 * 
 * @param {Maybe<string>} text 
 * @returns {string[]}
 */
exports.cleanText = (text) => {
  if (!text) return [];

  return text.split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
};

const $$text = Symbol("WrappedIteratorResult.text");

class ContextModeIteratorResult extends WrappedIteratorResult {
  /**
   * @param {HistoryIteratorResult} toWrap
   * @param {number} totalLength
   */
  constructor(toWrap, totalLength) {
    super(toWrap);
    this[$$text] = exports.cleanText(toWrap.text).join("\n");
    // Only add the extra character (for a new-line) if this isn't the latest entry.
    const declaredLength = toWrap.offset === 0 ? this[$$text].length : this[$$text].length + 1;
    this.lengthToHere = totalLength + declaredLength;
  }

  /** This wrapper yields cleaned up text. */
  get text() {
    return this[$$text];
  }
}

/**
 * Applies a view on the history that yields each line individually and adds some
 * additional information to aid context building.
 * 
 * @param {import("aid-bundler/src/aidData").AIDData} aidData
 * @returns {Iterable<ContextModeIteratorResult>}
 */
exports.buildHistoryData = function* (aidData) {
  let totalLength = 0;
  for (const line of perLineIterator(aidData.history)) {
    const result = new ContextModeIteratorResult(line, totalLength);
    if (result.text.length === 0) continue;
    totalLength = result.lengthToHere;
    yield result;
  }
};

/**
 * Gets the length of a string, as if it were contributing to an `Array.join`.
 * 
 * @param {string | number} value
 * The string or a number representing a string's length.
 * @param {string} [joiner]
 * The string that will be used to join them; defaults to `"\n"`.
 * @returns {number}
 */
exports.usedLength = (value, joiner = "\n") => {
  const length = typeof value === "string" ? value.length : value;
  return length > 0 ? length + joiner.length : 0;
};

/**
 * A function for `Array.reduce` that sums all the lengths in an array.
 * Accepts both a raw `string` to calculate the length from or a pre-calculated
 * `number` length.
 * 
 * @param {string} [joiner]
 * The string that will be used to join them; defaults to `"\n"`.
 * @returns {(acc: number, next: string | number) => number}
 */
exports.sumOfUsed = (joiner = "\n") => (acc, next) =>
  acc + exports.usedLength(next, joiner);

/**
 * Gets the length of an iterable of strings, as if joined together with `joiner`.
 * 
 * @param {string | string[] | Iterable<string>} value
 * The value to calculate the length for.
 * @param {string} [joiner]
 * The string that will be used to join them; defaults to `"\n"`.
 * @returns {number}
 */
exports.joinedLength = (value, joiner = "\n") => {
  if (typeof value === "string") return value.length;
  let count = 0;
  let totalLength = 0;
  for (const str of value) {
    totalLength += str.length;
    count += 1;
  }

  return totalLength + (count > 0 ? (count - 1) * joiner.length : 0);
};