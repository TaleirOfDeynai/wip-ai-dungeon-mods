const { toPairs, fromPairs, chain } = require("../../utils");
const { entrySorter } = require("../entrySorting");

/**
 * @param {Context} ctx
 * @param {AssociationData.GeneralAssociationData} theAssociation
 * @returns {CacheData.GeneralCacheData}
 */
const buildForGeneral = (ctx, theAssociation) => {
  const entry = theAssociation.entry;
  const entryId = entry.entryId;
  const score = ctx.scoresMap.get(theAssociation.source)?.get(entryId) ?? 0;
  const priority = entry.priority ?? null;
  return { entryId, score, priority, source: theAssociation.source };
};

/**
 * @param {Context} ctx
 * @param {AssociationData.HistoryAssociationData} theAssociation
 * @returns {CacheData.HistoryCacheData}
 */
const buildForHistory = (ctx, theAssociation) => {
  const entry = theAssociation.entry;
  const entryId = entry.entryId;
  const score = ctx.scoresMap.get(theAssociation.source)?.get(entryId) ?? 0;
  const priority = entry.priority ?? null;
  const { desc, start, end } = theAssociation;
  return {
    entryId, score, priority, desc, start, end,
    source: "history"
  };
};

/**
 * Dumps everything into the game-state caches.
 * 
 * @type {BundledModifierFn}
 */
module.exports = (data) => {
  const { state, stateEngineContext: ctx } = data;

  // And now, we construct the object for the turn cache.
  /** @type {StateDataCache} */
  const newCacheData = {
    phase: data.phase,
    forContextMemory: [],
    forFrontMemory: null,
    forAuthorsNote: null,
    forHistory: []
  };
  for (const theMap of ctx.stateAssociations.values()) {
    for (const theAssociation of theMap.values()) {
      switch (theAssociation.source) {
        case "implicit":
        case "implicitRef":
        case "playerMemory":
          newCacheData.forContextMemory.push(buildForGeneral(ctx, theAssociation));
          break;
        case "frontMemory":
          newCacheData.forFrontMemory = buildForGeneral(ctx, theAssociation);
          break;
        case "authorsNote":
          newCacheData.forAuthorsNote = buildForGeneral(ctx, theAssociation);
          break;
        default:
          newCacheData.forHistory.push(buildForHistory(ctx, theAssociation));
          break;
      }
    }
  }

  // Sort the context memory entries.
  newCacheData.forContextMemory = chain(newCacheData.forContextMemory)
    .thru(entrySorter)
    .map(({ order, ...data }) => data)
    .toArray();

  // Put it where it belongs.
  ctx.theCache.storage = newCacheData;
  ctx.theCache.commit();

  // Finally, update the parsed entry cache and we're done!
  // @ts-ignore - Why are you bothering with this, TS?  Stupid!
  state.$$stateDataCache = chain(ctx.entriesMap)
    .map(([k, entry]) => [k, entry.toJSON()])
    .value((kvps) => fromPairs(kvps));
};