const { tuple2, chain, toPairs } = require("../../utils");

/**
 * @param {StateEngineEntry} entry
 * @returns {StateDataForModifier}
 */
const entryForModifier = (entry) => ({
  ...entry.toJSON(),
  topics: new Set(entry.topics)
});

/**
 * Applies modifiers to newly parsed and validated `StateEngineData`.
 * 
 * @type {BundledModifierFn}
 */
module.exports = (data) => {
  const { stateEngineContext: ctx } = data;

  // We need to store copies, as `modifier` will mutate instances.
  const allStates = chain(ctx.entriesMap)
    .map(([id, entry]) => tuple2(id, entryForModifier(entry)))
    .value((kvps) => new Map(kvps));

  for (const entry of ctx.entriesMap.values()) entry.modifier(allStates);
};