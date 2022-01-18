const { chain } = require("../../utils");
const { worldInfoString } = require("../utils");

/**
 * @param {string[]} sourceKey
 * @param {string} sourceStr 
 * @param {import("parsimmon").Failure} errorResult
 * @returns {Iterable<string>}
 */
function* getLocationDetails(sourceKey, sourceStr, { index, expected }) {
  // `index.line` and `index.column` are one-indexed.
  const lines = sourceStr.split("\n");
  const theLine = lines[index.line - 1];
  const theType = lines.length > 1 ? "line" : "string";

  yield `Source property: \`${sourceKey.join(".")}\``;
  if (lines.length > 1) yield `Source line: ${index.line}| ${theLine}`;

  if (index.column <= 1) yield `After: <start of ${theType}>`;
  else {
    // Check to see if it's just all whitespace.
    const initial = theLine.substring(0, index.column - 1);
    if (!initial.trim()) yield `After: <start of ${theType}>`;
    else yield `After: ${initial}`;
  }

  if (!expected.length) return;
  if (expected.length === 1) {
    yield `Expected to match: ${expected[0]}`;
  }
  else {
    yield "Expected to match one of:";
    for (const item of expected) yield `- ${item}`;
  }
};

/**
 * @param {any} err 
 * @returns {err is import("parsimmon").Failure}
 */
exports.isParsimmonFailure = (err) => {
  if (!("status" in err)) return false;
  if (!("index" in err)) return false;
  if (!("expected" in err)) return false;
  return err.status === false;
};

/**
 * Error for general issues involving parsing.
 * 
 * Thrown when it appears that the entry has a string in a property at a location
 * that State-Engine expects it to be, but the expected data could not be extracted
 * properly.
 * 
 * Do not throw this when:
 * - The property is not in `WorldInfoEntry.attributes`.
 * - The value of the property is not a string.
 */
class ParsingError extends Error {
  /**
   * @param {WorldInfoEntry} entry
   * The entry involved in the failure.
   * @param {string} type
   * The name of the type-of-thing the parser was treating `sourceStr` as.
   * @param {string[]} sourceKey
   * The property path to the string that was parsed.
   * @param {string} sourceStr
   * The string that was parsed.
   * @param {import("parsimmon").Failure} parseResult
   * The failure result from the parser.
   */
  constructor(entry, type, sourceKey, sourceStr, parseResult) {
    const message = [
      `Failed to parse ${worldInfoString(entry)}:`,
      `\tTreated as: ${type}`,
      ...chain(getLocationDetails(sourceKey, sourceStr, parseResult))
        .map((v) => `\t${v}`)
        .value()
    ];
    super(message.join("\n"));

    // @ts-ignore - That's why we're checking, TS.
    Error.captureStackTrace?.(this, this.constructor);
    this.name = this.constructor.name;
    this.entry = entry;
    this.sourceKey = sourceKey;
    this.sourceStr = sourceStr;
    this.parsedType = type;
    this.parseResult = parseResult;
  }

  /**
   * Provides the error's details in a way that is better for error grouping.
   * 
   * @type {string}
   */
  get details() {
    return [
      `Failed to parse as: ${this.parsedType}`,
      ...getLocationDetails(this.sourceKey, this.sourceStr, this.parseResult)
    ].join("\n");
  }
}

exports.ParsingError = ParsingError;