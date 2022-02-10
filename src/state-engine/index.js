/// <reference path="./state-engine.d.ts" />
/// <reference path="../commands/commands.d.ts" />
const { Plugin } = require("aid-bundler");
const { MatchCommand } = require("../commands");
const { is, flatMap, iterReverse, chain, fromPairs, tuple2, getEntryText } = require("../utils");
const { makeExcerpt, stateDataString } = require("./utils");
const { stateModule: coreModule } = require("./core");
const { stateModule: vanillaModule } = require("./standard/vanilla");
const { stateModule: classModule } = require("./standard/class");
const turnCache = require("../turn-cache");

const STATE_ENGINE_VERSION = 5;

/**
 * Orders `CacheData.HistoryCacheData` by:
 * - Entries with fragments that end later.
 * - Entries with fragments that start later.
 * - Undefined otherwise.
 * 
 * Assumes `start.source` will always be greater than `end.source`.
 * And remember, the "later action" has a smaller `source` value, since it
 * is offset from the END of the `history` array.
 * 
 * @param {CacheData.HistoryCacheData} a 
 * @param {CacheData.HistoryCacheData} b 
 */
const historyEntrySorter = (a, b) => {
  if (a.end.source !== b.end.source) {
    // Sort the later action up.
    return a.end.source - b.end.source;
  }

  // Sort the fragment ending later up.
  const endOff = b.end.offset - a.end.offset;
  if (endOff !== 0) return endOff;

  // Endings of fragments are equal.  Try sorting off the start now.
  if (a.start.source !== b.start.source) {
    // Sort the later action up.
    return a.start.source - b.start.source;
  }

  // Sort the fragment starting later up.
  return b.start.offset - a.start.offset;
};

/** @type {BundledModifierFn} */
const versionCheck = (data) => {
  const curVer = data.state.$$stateEngineVersion;
  if (curVer === STATE_ENGINE_VERSION) return;

  // Reset State Engine on version change.
  delete data.state.$$stateDataCache;
  turnCache.clearCache(data, "StateEngine.association");
  data.state.$$stateEngineVersion = STATE_ENGINE_VERSION;

  console.log([
    `Cleared State Engine caches due to upgrade`,
    is.number(curVer) ? `from ${curVer}` : undefined,
    `to ${STATE_ENGINE_VERSION}.`
  ].filter(Boolean).join(" "));
};

/**
 * Constructs an input modifier from the given list of `StateModule` instances.
 * 
 * @param {...StateModule} stateModules
 * @returns {BundledModifierFn}
 */
exports.mainModifier = (...stateModules) => {
  // Make sure the core module comes first, even if it was already in `stateModules`.
  // We also throw in the vanilla module, for backward compatibility.
  const theModules = new Set([coreModule, vanillaModule, classModule, ...stateModules]);
  const modifierFns = [
    ...flatMap(theModules, (m) => m.pre ?? []),
    ...flatMap(theModules, (m) => m.exec ?? []),
    // The `post` functions of modules are executed in reverse order.
    ...flatMap(iterReverse(theModules), (m) => m.post ?? [])
  ];

  return (data) => {
    if (!data.useAI) return;
    versionCheck(data);

    for (const modifierFn of modifierFns) {
      modifierFn(data);
      if (!data.useAI) return;
    }
  };
};

/**
 * @param {Record<string, WorldInfoEntry>} worldInfoMap 
 * @param {Record<string, StateEngineData>} stateDataCache
 * @param {Iterable<[string, StateEngineCacheData | null]>} entries
 */
const reportOnEntry = function* (worldInfoMap, stateDataCache, entries) {
  for (const [location, entry] of entries) {
    if (!entry) continue;
    const data = stateDataCache[entry.entryId];
    if (!data) continue;
    /** @type {WorldInfoEntry | undefined} */
    const info = worldInfoMap[entry.entryId];
    const { type, entryId, topics, text } = data;
    const infoName = info?.name?.trim() || undefined;
    const textForExcerpt = text ?? (info ? getEntryText(info) : "");
    const ident = stateDataString({ type, entryId, topics, infoName });
    const score = entry.score.toFixed(2);
    yield `${ident} (${score}) @ ${location}\n\t${makeExcerpt(textForExcerpt)}`;
  }
};

/**
 * Produces a report message for the given cache.
 * 
 * @param {AIDData} aidData 
 * @param {StateDataCache & { fromTurn: number }} storage 
 * @returns {string}
 */
const reportOnCache = (aidData, storage) => {
  const { $$stateDataCache = {} } = aidData.state;
  const worldInfoMap = fromPairs(aidData.worldEntries.map((wi) => tuple2(wi.id, wi)));
  const theHeader = `From turn ${storage.fromTurn} (${storage.phase || "unknown"} phase)`;
  const theReport = chain()
    .concat(
      storage.forContextMemory
        .map((v) => tuple2("Context Memory", v))
    )
    .concat(
      storage.forHistory
        .map((entry) => tuple2(entry.desc, entry))
        .sort((a, b) => historyEntrySorter(a[1], b[1]))
    )
    .concat([tuple2("Author's Note", storage.forAuthorsNote)])
    .concat([tuple2("Front Memory", storage.forFrontMemory)])
    .thru((entries) => reportOnEntry(worldInfoMap, $$stateDataCache, entries))
    .toArray()
    .join("\n");

  return `${theHeader}\n\n${theReport}`;
};

/**
 * Emits the cache data starting from the current turn and back into the past.
 * 
 * @param {AIDData} aidData
 * @returns {Iterable<StateDataCache & { fromTurn: number }>}
 */
const emitCacheData = function* (aidData) {
  for (let ac = aidData.actionCount; ac >= 0; ac--) {
    /** @type {StateDataCache | undefined} */
    const theCache = turnCache.inspectAt(aidData, "StateEngine.association", ac);
    if (theCache == null) continue;
    yield { ...theCache, fromTurn: ac };
  }
};

/** @type {Array<[string | RegExp, SimpleCommandHandler]>} */
const commandPatterns = [
  // Reports more readable information about the latest turn.
  ["report", (data) => {
    const [latestTurn] = emitCacheData(data);
    if (!latestTurn) return "No State-Engine data is available.";
    return reportOnCache(data, latestTurn);
  }],
  // Debug command; clears the cache.
  ["reset", (data) => {
    delete data.state.$$stateDataCache;
    turnCache.clearCache(data, "StateEngine.association");
    return "Cleared State Engine caches.";
  }]
];

exports.commands = [
  new MatchCommand("state-engine", new Map(commandPatterns))
];

/**
 * Creates and adds this plugin to an AID-Bundler `Pipeline`.
 * 
 * @param {import("aid-bundler").Pipeline} pipeline 
 * @param  {...any} stateModules 
 */
exports.addPlugin = (pipeline, ...stateModules) => {
  for (const cmd of exports.commands)
    pipeline.commandHandler.addCommand(cmd);

  const contextModifier = exports.mainModifier(...stateModules);
  pipeline.addPlugin(new Plugin("State Engine", versionCheck, contextModifier, undefined));
};
