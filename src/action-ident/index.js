/// <reference path="./action-ident.d.ts" />
const { Plugin } = require("aid-bundler");

exports.PLUGIN_NAME = "Action-Ident";

/**
 * Tries to determine if the current turn had an input phase.
 * 
 * Returns `undefined` when {@link GameState.$$actionIdent} has not yet been setup,
 * which may indicate one of two things:
 * - This is the first turn the plugin has gotten to work and the input phase was skipped.
 * - An input phase happened, but this function was called before {@link exports.inputModifier}
 *   has been able to run.  In this case, there's a problem with how the plugin was
 *   added to the bundle.
 * 
 * @param {AIDData} data 
 * @returns {boolean | undefined}
 */
exports.turnHadInputPhase = (data) => {
  const { state: { $$actionIdent }, actionCount, phase } = data;
  if (phase === "input") return true;
  if (!$$actionIdent) return undefined;
  return $$actionIdent.turnOfLastInputPhase === actionCount;
};

/**
 * @param {AIDData} data
 * @returns {number}
 */
const getOffset = (data) => {
  if (data.phase === "input") return 0;
  if (!exports.turnHadInputPhase(data)) return 0;
  return 1;
}

/**
 * Builds a mapper from a `history` index to its turn (or what its index would
 * be if we had every single action in an array).  Turn `0` would be the first
 * turn of the story, usually the prompt.
 * 
 * A mapper should only be generated in plugins that run after this plugin.
 * Make sure you call {@link exports.addPlugin} early in the pipeline.
 * 
 * @param {AIDData} data
 * @returns {ActionIdent.HistoryToTurnMapper}
 */
exports.historyToTurn = (data) => {
  const phaseOffset = getOffset(data);
  return (index) => {
    const actionCount = phaseOffset + data.actionCount;
    const historyLength = data.history.length;
    // We'll allow negative indices, but not indices for future turns.
    if (index >= data.history.length) return undefined;
    // We always see the latest actions, but may not have older actions.
    // We'll need to add this offset to get the absolute turn.
    const viewOffset = actionCount - historyLength;
    const turnId = index + viewOffset;
    // But we won't map indices to impossible turns.
    if (turnId < 0) return undefined;
    return turnId;
  };
}

/**
 * Builds a mapper from an action's turn to the corresponding `history` index,
 * if possible.  The history array is not guaranteed to contain the action from
 * the given turn.
 * 
 * A mapper should only be generated in plugins that run after this plugin.
 * Make sure you call {@link exports.addPlugin} early in the pipeline.
 * 
 * @param {AIDData} data
 * @returns {ActionIdent.TurnToHistoryMapper}
 */
exports.turnToHistory = (data) => {
  const phaseOffset = getOffset(data);
  return (turn) => {
    const actionCount = phaseOffset + data.actionCount;
    const historyLength = data.history.length;
    // We don't allow negative turns.
    if (turn < 0) return undefined;
    // We always see the latest actions, but may not have older actions.
    // We'll need to subtract this offset to get the history index.
    const viewOffset = actionCount - historyLength;
    const index = turn - viewOffset;
    // We won't map to indices that are out of range of the `history` array.
    if (index < 0 || index >= historyLength) return undefined;
    return index;
  };
};

/**
 * Input modifier; tracks the current turn when an input phase begins, which is
 * used to correctly translate from a `history` index to a relative turn.
 * 
 * @type {BundledModifierFn}
 */
exports.inputModifier = ({state, info}) => {
  state.$$actionIdent = {
    ...state.$$actionIdent,
    turnOfLastInputPhase: info.actionCount
  };
};

/**
 * Creates and adds this plugin to an AID-Bundler `Pipeline`.
 * 
 * @param {import("aid-bundler").Pipeline} pipeline
 */
exports.addPlugin = (pipeline) => {
  pipeline.addPlugin(new Plugin(
    exports.PLUGIN_NAME,
    exports.inputModifier
  ));
};