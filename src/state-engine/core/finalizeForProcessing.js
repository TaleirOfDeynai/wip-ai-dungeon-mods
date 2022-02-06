const { dew, escapeRegExp } = require("../../utils");

/**
 * @param {StateEngineEntry} source
 * @param {StateEngineEntry} target
 */
const countOfUniqueTopics = (source, target) => {
  if (source.topics.size === 0) return 0;

  let count = 0;
  for (const srcTopic of source.topics)
    if (!target.topics.has(srcTopic)) count += 1;
  return count;
};

/**
 * Sorts `StateEngineData`.  Data with relations to other data are sorted toward
 * the end, so they are evaluated last and will be able to look up if the related
 * data was matched.
 * 
 * @param {StateEngineEntry} a 
 * @param {StateEngineEntry} b 
 */
const stateSorter = (a, b) => {
  // When one references the other, sort the one doing the referencing later.
  // It is possible that they reference each other; this is undefined behavior.
  if (a.relator.isInterestedIn(b.topics)) return 1;
  if (b.relator.isInterestedIn(a.topics)) return -1;

  // When one has more relations, sort that one later.
  const relCount = a.relator.topicsOfInterest.size - b.relator.topicsOfInterest.size;
  if (relCount !== 0) return relCount;

  // Compare the topics, sorting the entry with more unique topics down.
  const aCount = countOfUniqueTopics(a, b);
  const bCount = countOfUniqueTopics(b, a);
  if (aCount !== bCount) return aCount - bCount;

  return 0;
};

/**
 * Matches the type of input mode the player performed to submit the input.
 * This information is not currently provided by the API, and I like normalized data.
 * 
 * @param {import("aid-bundler/src/aidData").AIDData} data
 * @returns {"do" | "say" | "story"}
 */
const parseInputMode = (data) => {
  const { info: { characters }, text } = data;
  const allCharacters = characters
    .map((pi) => pi.name?.trim())
    .filter(Boolean)
    .map((name) => escapeRegExp(name));
  const charMatch = ["you", ...allCharacters].join("|");

  // Check for `say` first, since it is more ambiguous than `do`.
  if (new RegExp(`^\\>\\s+(?:${charMatch}) says?`, "i").test(text)) return "say";
  if (new RegExp(`^\\>\\s+(?:${charMatch})`, "i").test(text)) return "do";
  return "story";
};

/**
 * Finalizes the internal state before processing.
 * 
 * @type {BundledModifierFn}
 */
module.exports = (data) => {
  const { stateEngineContext: ctx, history } = data;
  const entryCount = ctx.config.get("integer", "entryCount");

  ctx.workingHistory = dew(() => {
    const slicedHistory = history.slice(-1 * entryCount);
    switch (data.phase) {
      // We don't know what the input mode was, so we have to parse it.
      case "input":
        return [...slicedHistory, { text: data.text, type: parseInputMode(data) }];
      // Treat the AI's response as a continuation.
      case "output":
        return [...slicedHistory, { text: data.text, type: "continue" }];
      default:
        return slicedHistory;
    }
  });

  ctx.sortedStateMatchers = Object.keys(ctx.entriesMap)
    .map((id) => ctx.entriesMap[id])
    .sort(stateSorter)
    .map((sd) => sd.toMatchable(ctx.matchCounter));
};