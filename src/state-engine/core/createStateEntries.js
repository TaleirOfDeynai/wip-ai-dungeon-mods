const { allStateEntries } = require("../registry");

/**
 * Parses World Info entries into State Engine entries.
 * 
 * @type {BundledModifierFn}
 */
module.exports = (data) => {
  const { stateEngineContext: ctx } = data;
  
  // Perform entry construction.
  for (const entryClass of allStateEntries())
    for (const newEntry of entryClass.produceEntries(data, ctx))
      ctx.entriesMap.set(newEntry.entryId, newEntry);
};