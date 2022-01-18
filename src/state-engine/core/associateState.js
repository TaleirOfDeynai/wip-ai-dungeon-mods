const { associationsHelper, getAssociationSet } = require("./_helpers");

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
    const result = matcher.stateEntry.associator(matcher, params);
    if (result) getAssociationSet(ctx, params.source, true).add(matcher.entryId);
  }

  //console.log([...usedTopics].map(([topic, theSet]) => `${topic} uses: ${[...theSet].join(", ")}`));
};