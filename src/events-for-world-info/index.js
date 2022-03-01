/// <reference path="./events-for-world-info.d.ts" />
const { Plugin } = require("aid-bundler");
const objectHash = require("object-hash");
const actionIdent = require("../action-ident");
const eventEmitter = require("../events");
const { is } = require("../utils");

exports.PLUGIN_NAME = "Events for World-Info";

/**
 * Creates and persists the plugin's cache (if needed) and returns its reference.
 * 
 * @param {AIDData} data
 * @returns {Record<string, string | undefined>}
 */
const fetchCache = (data) => {
  const theCache = data.state.$$eventsForWorldInfo ?? {};
  return data.state.$$eventsForWorldInfo = theCache;
};

/**
 * @param {AIDData} data
 * @param {EventsForWorldInfo.AddedEventArg["entry"]} entry
 * @param {EventsForWorldInfo.AddedEventArg["currentHash"]} currentHash
 * @returns {boolean}
 */
const emitAdded = (data, entry, currentHash) => eventEmitter.emit(
  "events-for-world-info.added",
  data, { entry, currentHash }
);

/**
 * @param {AIDData} data
 * @param {EventsForWorldInfo.UpdatedEventArg["entry"]} entry
 * @param {EventsForWorldInfo.UpdatedEventArg["currentHash"]} currentHash
 * @param {EventsForWorldInfo.UpdatedEventArg["previousHash"]} previousHash
 * @returns {boolean}
 */
const emitUpdated = (data, entry, currentHash, previousHash) => eventEmitter.emit(
  "events-for-world-info.updated",
  data, { entry, currentHash, previousHash }
);

/**
 * @param {AIDData} data
 * @param {EventsForWorldInfo.RemovedEventArg["id"]} id
 * @param {EventsForWorldInfo.RemovedEventArg["previousHash"]} previousHash
 * @returns {boolean}
 */
 const emitRemoved = (data, id, previousHash) => eventEmitter.emit(
  "events-for-world-info.removed",
  data, { id, previousHash }
);

/**
 * Performs all the checks for changes to entries in the {@link AIDData.worldEntries}
 * array, emitting events when alterations are detected.
 * 
 * @type {BundledModifierFn}
 */
exports.inputModifier = (data) => {
  const { worldEntries } = data;
  const theCache = fetchCache(data);

  /** @type {Set<string>} */
  const existingSet = new Set();

  // Checking for changes.
  for (const entry of worldEntries) {
    existingSet.add(entry.id);

    const prevHash = theCache[entry.id];
    const curHash = objectHash.sha1(entry);

    if (!prevHash)
      emitAdded(data, entry, curHash);
    else if (prevHash !== curHash)
      emitUpdated(data, entry, curHash, prevHash);

    theCache[entry.id] = curHash;
  }

  // Checking for removals.
  for (const entryId of Object.keys(theCache)) {
    if (existingSet.has(entryId)) continue;

    // Can't find the ID from the previous loop.  Emit the removal.
    const prevHash = theCache[entryId];
    if (!is.string(prevHash)) continue;
    emitRemoved(data, entryId, prevHash);
    delete theCache[entryId];
  }
};

/**
 * Does the same thing as {@link exports.inputModifier}, but only when no input
 * phase has occurred this turn.
 * 
 * @type {BundledModifierFn}
 */
exports.contextModifier = (data) => {
  // If the input phase happened, we've already done the checks for the current turn.
  if (actionIdent.turnHadInputPhase(data)) return;
  exports.inputModifier(data);
};

/**
 * Creates and adds this plugin to an AID-Bundler `Pipeline`.
 * 
 * @param {import("aid-bundler").Pipeline} pipeline
 */
exports.addPlugin = (pipeline) => {
  // This plugin requires Action-Ident.
  if (!pipeline.plugins.some((p) => p.name !== actionIdent.PLUGIN_NAME)) {
    actionIdent.addPlugin(pipeline);
  }

  pipeline.addPlugin(new Plugin(
    exports.PLUGIN_NAME,
    exports.inputModifier,
    exports.contextModifier
  ));
};