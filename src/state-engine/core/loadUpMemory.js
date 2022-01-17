const { chain, getText } = require("../../utils");
const { entrySorter } = require("../entrySorting");
const { entrySelector } = require("../entrySelection");

/**
 * We are not in a context modifier, so we will assume 1000 characters can be dedicated
 * to world-info.  Hopefully the context never gets even smaller.
 */
const MAX_MEMORY = 1000;

/** @typedef {Required<Pick<SortableEntry, "text" | "keys" | "relations">>} SortingParts */

/**
 * Yields lines from the player memory, ignoring lines starting with a `#` symbol.
 * Currently, they just jam the summary into the player-defined memory with a comment
 * warning you not to screw things up.
 * 
 * @param {string} playerMemory
 * @returns {Iterable<SortableEntry & { text: string }>}
 */
const convertPlayerMemory = function* (playerMemory) {
  const lines = getText(playerMemory).split("\n");
  for (let i = 0, lim = lines.length; i < lim; i++) {
    const text = lines[i].trim();
    if (text.startsWith("#")) continue;
    yield { text, priority: (i + 1000) * -1, score: 100 };
  }
};

/**
 * @param {string} playerMemory
 * The player memory.  May contain the summary portion if With-Memory is not running.
 * @param {string | undefined} summary
 * If With-Memory is running, the extracted summary.
 * @param {StateDataCache} cacheData
 * The current-turn State Engine cache data.
 * @param {(id: string) => SortingParts} getEntryData
 * Function that obtains an entry's text.
 * @returns {string}
 */
const produceContextMemory = (playerMemory, summary, cacheData, getEntryData) => {
  const forContext = cacheData?.forContextMemory ?? [];
  const forHistory = cacheData?.forHistory ? Object.values(cacheData.forHistory) : [];
  const resolvedSummary = summary ?? "";

  return chain()
    .concat(forContext, forHistory)
    .map((entry) => ({ ...entry, ...getEntryData(entry.entryId)}))
    .concat(convertPlayerMemory(playerMemory))
    .thru(entrySorter)
    .thru((notes) => entrySelector(notes, MAX_MEMORY + 1 - resolvedSummary.length, {
      lengthGetter: ({ text }) => text.length + 1
    }))
    .map((note) => note.text.trim())
    .concat(resolvedSummary)
    .filter(Boolean)
    .toArray()
    .join("\n");
};

/**
 * Uses the natural sorting utilities to select entries for display in the memory.
 * Also inserts the Author's Note and Front Memory.
 * 
 * All the data we selected is in the turn cache for later; this step is just to
 * help with the edit distance restrictions and make this functional without any
 * other supporting plugins.
 * 
 * @type {BundledModifierFn}
 */
module.exports = (data) => {
  const { stateEngineContext: ctx } = data;
  const { state: { memory }, playerMemory, summary } = data;

  const cacheData = ctx.theCache.storage;
  if (!cacheData) return;

  const newContextMem = produceContextMemory(
    playerMemory, summary, cacheData,
    (id) => {
      const entry = ctx.entriesMap[id];
      return {
        text: getText(entry),
        keys: entry.keys,
        relations: entry.relations.filter((relDef) => relDef.type !== "negated")
      };
    }
  );
  if (newContextMem) memory.context = newContextMem;
  
  // Only set these if it is not already set by something else.
  if (cacheData.forAuthorsNote) {
    const entry = ctx.entriesMap[cacheData.forAuthorsNote.entryId];
    const newAuthorsNote = getText(entry).trim();
    if (newAuthorsNote) memory.authorsNote = newAuthorsNote;
  }
  
  if (cacheData.forFrontMemory && !memory.frontMemory) {
    const entry = ctx.entriesMap[cacheData.forFrontMemory.entryId];
    const newFrontMemory = getText(entry).trim();
    if (newFrontMemory) memory.frontMemory = newFrontMemory;
  }
};