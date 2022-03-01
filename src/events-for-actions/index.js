/// <reference path="./events-for-actions.d.ts" />
const { Plugin } = require("aid-bundler");
const objectHash = require("object-hash");
const actionIdent = require("../action-ident");
const eventEmitter = require("../events");
const { assertAs, is, chain } = require("../utils");
const getConfig = require("./config");

exports.PLUGIN_NAME = "Events for Actions";

/**
 * Creates and persists the plugin's cache (if needed) and returns its reference.
 * 
 * @param {AIDData} data
 * @returns {Record<number, string | undefined>}
 */
const fetchCache = (data) => {
  const theCache = data.state.$$eventsForActions ?? {};
  return data.state.$$eventsForActions = theCache;
};

/**
 * @param {AIDData} data
 * @param {EventsForActions.AddedEventArg["turn"]} turn
 * @param {EventsForActions.AddedEventArg["index"]} index
 * @param {EventsForActions.AddedEventArg["entry"]} entry
 * @param {EventsForActions.AddedEventArg["currentHash"]} currentHash
 * @returns {boolean}
 */
const emitAdded = (data, turn, index, entry, currentHash) => eventEmitter.emit(
  "events-for-actions.added",
  data, { turn, index, entry, currentHash }
);

/**
 * @param {AIDData} data
 * @param {EventsForActions.UpdatedEventArg["turn"]} turn
 * @param {EventsForActions.UpdatedEventArg["index"]} index
 * @param {EventsForActions.UpdatedEventArg["entry"]} entry
 * @param {EventsForActions.UpdatedEventArg["currentHash"]} currentHash
 * @param {EventsForActions.UpdatedEventArg["previousHash"]} previousHash
 * @returns {boolean}
 */
const emitUpdated = (data, turn, index, entry, currentHash, previousHash) => eventEmitter.emit(
  "events-for-actions.updated",
  data, { turn, index, entry, currentHash, previousHash }
);

/**
 * @param {AIDData} data
 * @param {EventsForActions.RemovedEventArg["turn"]} turn
 * @param {EventsForActions.RemovedEventArg["previousHash"]} previousHash
 * @returns {boolean}
 */
 const emitRemoved = (data, turn, previousHash) => eventEmitter.emit(
  "events-for-actions.removed",
  data, { turn, previousHash }
);

/**
 * Performs all the checks for changes to entries in the {@link AIDData.history} array,
 * emitting events when alterations are detected.
 * 
 * @type {BundledModifierFn}
 */
exports.inputModifier = (data) => {
  const { history } = data;
  const toTurn = actionIdent.historyToTurn(data);
  const theCache = fetchCache(data);

  // Determine our starting index.  Hashing is expensive, so we're only going
  // to bother checking the most recent actions, defined through a config.
  // This won't prevent updates before this point from being emitted; the event
  // just won't fire until the story has been rewound far enough for the updated
  // entry to be in the look-back region.
  const theConfig = getConfig(data);
  const lookBack = Math.min(theConfig.get("integer", "maximumLookBack"), history.length);

  // Checking for changes.
  for (let index = history.length - lookBack; index < history.length; index++) {
    const entry = history[index];
    const turn = assertAs(
      `Could not map \`${index}\` to a turn.`,
      is.number,
      toTurn(index)
    );

    const prevHash = theCache[turn];
    const curHash = objectHash.sha1(entry);

    if (!prevHash)
      emitAdded(data, turn, index, entry, curHash);
    else if (prevHash !== curHash)
      emitUpdated(data, turn, index, entry, curHash, prevHash);
  }

  // Checking for removals; any cached hash for a future turn is considered removed.
  // This generally means we rolled back more than one action since the last run.
  const currentTurn = assertAs(
    "Could not map last action to a turn.",
    is.number,
    toTurn(history.length - 1)
  );

  const removedTurns = chain(Object.keys(theCache))
    .map(Number)
    .filter((turn) => !Number.isNaN(turn) && turn > currentTurn)
    .value();
  
  for (const turn of removedTurns) {
    const prevHash = theCache[turn];
    if (!is.string(prevHash)) continue;
    emitRemoved(data, turn, prevHash);
    delete theCache[turn];
  }
};

/**
 * Does the same thing as {@link exports.inputModifier}, but only when no input
 * phase has occurred this turn.  Otherwise, it will only announce that the
 * entry created as a result of the input phase was added to the history.
 * 
 * I did do a check to make sure that if the input phase's `text` was `""`,
 * that it does not proceed into the context phase, so there should always be
 * a new entry.  We'll sanity check it though.
 * 
 * @type {BundledModifierFn}
 */
exports.contextModifier = (data) => {
  // Do a full check if the input phase was skipped.
  if (!actionIdent.turnHadInputPhase(data))
    return exports.inputModifier(data);

  // Sanity check; we should have at least one entry in here.
  if (data.history.length === 0) return;

  const toTurn = actionIdent.historyToTurn(data);
  const lastIndex = data.history.length - 1;
  const lastTurn = assertAs(
    `Could not map \`${lastIndex}\` to a turn.`,
    is.number,
    toTurn(lastIndex)
  );

  const theCache = fetchCache(data);
  const lastEntry = data.history[lastIndex];
  const currentHash = objectHash.sha1(lastEntry);

  // Sanity check; we should not have a hash here or the hash should not match.
  if (currentHash === theCache[lastTurn]) return;

  // Okay, we're ready to announce the new entry.
  emitAdded(data, lastTurn, lastIndex, lastEntry, currentHash);

  // And update the hash for it.
  theCache[lastTurn] = currentHash;
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