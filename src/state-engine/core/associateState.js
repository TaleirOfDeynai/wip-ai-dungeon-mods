const { associationsHelper, getAssociationsFor, createAssocData } = require("./_helpers");

/**
 * Goes through the available texts, determining which `StateEngineEntry` objects
 * match with what text.
 * 
 * @type {BundledModifierFn}
 */
module.exports = (data) => {
  const { stateEngineContext: ctx } = data;

  /** @type {UsedTopicsMap} */
  const usedTopics = new Map();

  for (const [matcher, params] of associationsHelper(data, usedTopics)) {
    if (!matcher.stateEntry.associator(matcher, params)) continue;
    getAssociationsFor(ctx, params.source, true).set(matcher.entryId, createAssocData(matcher, params));
  }
};