/// <reference path="./annotated-context-mode.d.ts" />
/// <reference path="../context-mode/context-mode.d.ts" />
const { dew, getText } = require("../utils");
const { chain, iterReverse, limitText } = require("../utils");
const { getClosestCache, getStateEngineData, buildHistoryData } = require("../context-mode/utils");
const { cleanText, usedLength, sumOfUsed, joinedLength } = require("../context-mode/utils");
const getConfig = require("../context-mode/config");
const { entrySorter } = require("../state-engine/entrySorting");
const { entrySelector } = require("../state-engine/entrySelection");

const STYLE = "Style:";
const NOTES = "Notes:";
const STORY = "Story:";

/** @type {BundledModifierFn} */
const contextModifier = (data) => {
  // Only begin working after the second turn.
  if (data.actionCount <= 2) return;

  const { state, playerMemory } = data;
  const { authorsNote, frontMemory } = state.memory;
  const { maxChars, maxMemory } = getConfig(data);

  // Materialize the history data into an array, limiting it to the entries
  // that can possibly fit into the context.  This comes out already reversed.
  const historyData = chain(buildHistoryData(data))
    .filter((entry) => entry.lengthToHere <= maxChars)
    .toArray();
  
  // Compile a set of history sources, so we know (roughly) how far back we can look.
  const historySources = new Set(chain(historyData).map((hd) => hd.sources.keys()).flatten().value());

  const styleText = dew(() => {
    if (!authorsNote) return [];
    const theStyle = cleanText(authorsNote);
    if (theStyle.length === 0) return [];
    return [STYLE, ...theStyle];
  });

  const styleLength = joinedLength(styleText);

  // We require State Engine to function, but can still style a few things.
  const cacheData = getClosestCache(data);
  
  // Convert the player memory into something resembling State Engine entries,
  // and incorporate any State Engine entries we want to use as notes.
  /** @type {Iterable<AnnotatedEntry>} */
  const theNotes = dew(() => {
    const forContext = cacheData?.forContextMemory ?? [];
    const forHistory = cacheData?.forHistory ? Object.values(cacheData.forHistory) : [];
    return chain()
      .concat(forContext, forHistory)
      .map((cached) => getStateEngineData(data, cached))
      .filter(Boolean)
      .filter((sd) => typeof sd.source !== "number" || historySources.has(sd.source))
      .map((sd) => ({ ...sd, text: cleanText(sd.text).join("  ") }))
      .concat(dew(() => {
        if (!playerMemory) return [];
        return cleanText(playerMemory)
          .map((text, i) => ({ text, priority: (i + 1000) * -1, score: 40 }));
      }))
      .value();
  });

  // In this context mode, we group all these entries into a "Notes:"
  // section.  If we run low on space, we have to use some strategy to
  // trim things down.
  const notesText = dew(() => {
    return chain(theNotes)
      .thru(entrySorter)
      .thru((notes) => entrySelector(
        notes,
        // Have to account for the new lines for `styleLines` and `NOTES`.
        // @ts-ignore - Not typing the `reduce` correctly.
        maxMemory - [styleLength, NOTES].reduce(sumOfUsed(), 0),
        { lengthGetter: ({ text }) => text.length + 1 }
      ))
      .map((note) => note.text.trim())
      .filter(Boolean)
      .map((text) => `• ${text}`)
      .value((limitedNotes) => {
        const result = [...limitedNotes];
        if (result.length === 0) return [];
        return [NOTES, ...result];
      });
  });

  const notesLength = joinedLength(notesText);

  const storyText = dew(() => {
    const theFrontMemory = cleanText(frontMemory).reverse();
    return chain(theFrontMemory)
      .concat(historyData)
      .map(getText)
      .map((s) => s.trim())
      .filter(Boolean)
      .thru((storyText) => limitText(
        storyText,
        // Have to account for the new lines...
        // @ts-ignore - Not typing the `reduce` correctly.
        maxChars - [styleLength, notesLength, STORY].reduce(sumOfUsed(), 0),
        {
          // Here we account for the new line separating each line of the story.
          lengthGetter: (text) => text ? text.length + 1 : 0
        }
      ))
      .thru((storyText) => [STORY, ...iterReverse(storyText)])
      .value();
  });

  data.text = [...styleText, ...notesText, ...storyText].join("\n");
};

/**
 * A context mode that annotates everything it inserts with a descriptive tag.
 * 
 * @type {ContextModeModule}
 */
exports.contextModeModule = {
  name: "annotated",
  context: contextModifier
};