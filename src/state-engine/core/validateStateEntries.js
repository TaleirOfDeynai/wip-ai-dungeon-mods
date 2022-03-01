const { chain } = require("../../utils");

/**
 * Validates newly parsed `StateEngineData`.  Will remove any that fail validation.
 * 
 * @type {BundledModifierFn}
 */
module.exports = (data) => {
  const { stateEngineContext: ctx } = data;

  for (const [id, entry] of ctx.entriesMap) {
    const results = entry.validator();
    if (results.length === 0) continue;
    ctx.entriesMap.delete(id);

    const renderAs = entry.toString();
    const theIssues = ctx.validationIssues.get(renderAs) ?? [];
    theIssues.push(...results);
    ctx.validationIssues.set(renderAs, theIssues);
  }

  if (ctx.validationIssues.size === 0) return;

  data.useAI = false;
  data.message = chain(ctx.validationIssues)
    .map(([renderAs, issues]) => [
      `\t${renderAs}`,
      // Format issues so that the first line of each issue has a bullet and
      // all remaining lines are aligned.  AI Dungeon's message box will present
      // messages with whitespace preserved.
      ...chain(issues)
        .map((issue) => issue.split("\n").map(([firstLine, ...restLines]) => [
          `\t\t• ${firstLine}`,
          ...restLines.map((issueLine) => `\t\t  ${issueLine}`)
        ]))
        .flatten()
        .value()
    ])
    .flatten()
    .value((lines) => {
      return [
        "The following State Engine validation issues were discovered:",
        ...lines
      ].join("\n")
    });
};