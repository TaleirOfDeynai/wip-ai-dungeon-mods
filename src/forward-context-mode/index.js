/// <reference path="./forward-context-mode.d.ts" />
/// <reference path="../context-mode/context-mode.d.ts" />
const { dew, getText } = require("../utils");
const { chain, iterReverse, iterPosition, limitText } = require("../utils");
const { getClosestCache, getStateEngineData } = require("../context-mode/utils");
const { cleanText, usedLength, sumOfUsed, joinedLength } = require("../context-mode/utils");

const MAX_MEMORY = 1000;
const NOTES = "Reader's Notes:";
const BREAK = "--------";

/**
 * Sorts by: `priority` descending then `score` descending.  This means things with
 * a priority will be emitted before things without a priority.
 * 
 * @param {ForwardEntry} a 
 * @param {ForwardEntry} b
 * @returns {number}
 */
const noteSorter = (a, b) => {
  if (a.priority === b.priority) return b.score - a.score;
  // At least one of these is not null, since `null === null` would have been `true`.
  if (b.priority == null) return -1;
  if (a.priority == null) return 1;
  return b.priority - a.priority;
};

/**
 * @param {Iterable<ForwardEntry>} theNotes
 * @returns {Iterable<string>}
 */
const sortPrioritized = (theNotes) => {
  const sortedNotes = [...theNotes].sort((a, b) => noteSorter(a, b));
  return sortedNotes
    .map((ad) => ad.text.trim())
    .filter((text) => Boolean(text));
};

/** @type {BundledModifierFn} */
const contextModifier = (data) => {
  // Only begin working after the second turn.
  if (data.actionCount <= 2) return;

  const { state, info, history, playerMemory, summary } = data;
  const { authorsNote, frontMemory } = state.memory;
  const { maxChars } = info;

  // Determine the maximum number of history entries we could possibly
  // fit.  This will determine how far back we can include entries for.
  const maxHistory = chain(iterReverse(history))
    .map(getText)
    .map(usedLength)
    .value((lengths) => {
      let sum = MAX_MEMORY * 0.9;
      let count = 0;
      for (const length of lengths) {
        if (length + sum > maxChars) break;
        sum += length;
        count += 1;
      }
      return count;
    });

  const styleText = dew(() => {
    if (!authorsNote) return "";
    const theStyle = cleanText(authorsNote);
    if (theStyle.length === 0) return "";
    return ["[Author's Note: ", ...theStyle.join(" "), "]"].join("");
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
      .filter((sd) => typeof sd.source !== "number" || sd.source <= maxHistory)
      .map((sd) => ({ ...sd, text: cleanText(sd.text).join("  ") }))
      .concat(dew(() => {
        if (!playerMemory) return [];
        return cleanText(playerMemory)
          .map((text, i) => ({ text, priority: (i + 1000) * -1, score: 10 }));
      }))
      .value();
  });

  // In this context mode, we group all these entries into a "Notes:"
  // section.  If we run low on space, we have to use some strategy to
  // trim things down.
  const notesText = dew(() => {
    return chain(theNotes)
      .thru(sortPrioritized)
      .map((text) => `• ${text}`)
      .thru((sortedNotes) => limitText(
        // Have to account for the new lines for `styleLines` and `NOTES`.
        // @ts-ignore - Not typing the `reduce` correctly.
        MAX_MEMORY - [styleLength, NOTES].reduce(sumOfUsed(), 0),
        sortedNotes,
        {
          // Here we account for the new line separating each note.
          lengthGetter: (text) => text.length + 1,
          permissive: true
        }
      ))
      .value((limitedNotes) => {
        const result = [...limitedNotes];
        if (result.length === 0) return [];
        return [NOTES, ...result];
      });
  });

  const notesLength = joinedLength(notesText);

  const storyText = dew(() => {
    // Swap the text if the summary is included.
    const theFrontMemory = frontMemory?.trim();
    const theSummary = cleanText(summary);
    const summaryLength = joinedLength(theSummary);
    return chain(theFrontMemory ? [theFrontMemory] : [])
      .concat(iterReverse(history))
      .map(getText)
      .thru(function* (story) {
        if (styleText) {
          for (const [pos, text] of iterPosition(story)) {
            if (pos === 3) yield styleText;
            yield text;
          }
        }
        else yield* story;
      })
      .map((s) => s.split("\n").reverse())
      .flatten()
      .map((s) => s.trim())
      .filter(Boolean)
      .thru((storyText) => limitText(
        // Have to account for the new lines...
        // @ts-ignore - Not typing the `reduce` correctly.
        maxChars - [BREAK, summaryLength, notesLength].reduce(sumOfUsed(), 0),
        storyText,
        {
          // Here we account for the new line separating each line of the story.
          lengthGetter: (text) => text ? text.length + 1 : 0
        }
      ))
      .thru((storyText) => [BREAK, ...theSummary, ...iterReverse(storyText)])
      .value();
  });

  data.text = [...notesText, ...storyText].join("\n");
};

/** @type {ContextModeModule} */
module.exports.contextModeModule = {
  name: "forward",
  context: contextModifier
};