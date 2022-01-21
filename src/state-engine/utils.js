const objectHash = require("object-hash");
const { dew, memoize, getEntryText } = require("../utils");

/**
 * Due to retarded limits in TypeScript, you can't use obvious type-guards
 * to differentiate `AssociationParams` from each other.  Apparently, `"implicit"`
 * and `1` are impossible to disambiguate using `typeof params.source === "number"`.
 * 
 * Ryan Cavanaugh should be fired.
 * 
 * @template {AssociationTargets} TType
 * @param {TType} type
 * @param {AssociationParams} params 
 * @returns {params is AssociationParamTypes[TType]}
 */
exports.isParamsFor = (type, params) => {
  if (typeof params.source === "number") return type === "history";
  return type === params.source;
};

/**
 * Tells you if an `AssociationParams` has searchable text.
 * 
 * @param {AssociationParams} params 
 * @returns {params is AssociationParamTypes["implicitRef" | "playerMemory" | "history"]}
 */
exports.isParamsTextable = (params) =>
  "entry" in params;

/**
 * Creates a ten word excerpt from a string.
 * 
 * @param {string} str
 * @returns {string}
 */
exports.makeExcerpt = (str) => {
  const splitUp = str.trim().split(" ").filter(Boolean);
  if (splitUp.length === 0) return "(No excerpt available.)";
  const shortened = splitUp.slice(0, 10);
  if (splitUp.length === shortened.length) return str;
  return `${shortened.join(" ").replace(/[.!?,;:~]+$/, "")}...`;
};

/**
 * Converts a world info entry into a standardized string.
 * 
 * You can optionally include an excerpt, which will be on a new line with
 * a prefixed tab.
 * 
 * @param {WorldInfoEntry} worldInfo
 * @param {boolean} [withExcerpt]
 * @returns {string}
 */
exports.worldInfoString = (worldInfo, withExcerpt = false) => {
  const identifier = dew(() => {
    const name = worldInfo.name?.trim();
    if (name) return `<${name}>`;
    const keys = worldInfo.keys.trim();
    if (keys) return `[${keys}]`;
    return "";
  });
  const result = `WorldInfo#${worldInfo.id}${identifier}`;
  if (!withExcerpt) return result;

  return `${result}\n\t${exports.makeExcerpt(getEntryText(worldInfo))}`;
}

/**
 * Converts a `StateEngineData` or `StateEngineEntry` into a standardized string.
 * 
 * @param {Object} parts
 * @param {string} parts.type
 * @param {string} parts.entryId
 * @param {string} [parts.infoName]
 * @param {string[]} [parts.topics]
 * @param {string} [parts.entryText]
 * @returns {string}
 */
exports.stateDataString = (parts) => {
  const { type, topics, entryId, infoName, entryText } = parts;
  const topicsPart = topics?.filter(Boolean).join(" & ");
  const typePart
    = infoName ? infoName
    : topicsPart ? `$${type}[${topicsPart}]`
    : `$${type}`;

  const result = `StateEntry#${entryId}<${typePart}>`;
  if (!entryText) return result;

  return `${result}\n\t${exports.makeExcerpt(entryText)}`;
};

exports.hashText = memoize(
  /**
   * @param {Maybe<string>} text
   * @returns {string}
   */
  (text) => {
    // Fast path - If the text is empty, just use empty-string.
    if (!text) return "";
    // Fast path - These hashes are 40 characters long.  If the text's length
    // is less than that, just use the text itself.
    if (text.length <= 40) return text;
    // Generate a hash for the text.
    return objectHash.sha1({ text });
  }
);

/**
 * Creates a hash of a `WorldInfoEntry` object using only the properties important
 * to State-Engine.
 * 
 * This can be used to determine if an entry has changed in a meaningful way
 * between executions of the script.
 * 
 * This function uses memoization, which lasts for the life-time of this module,
 * which is a single `input`, `context`, or `output` phase.
 */
exports.hashWorldInfo = memoize(
  /**
   * @param {WorldInfoEntry} wiEntry
   * @returns {WorldInfoHash | undefined}
   */
  (wiEntry) => {
    if (!wiEntry) return undefined;
    const { id, name, type, keys, attributes, entry } = wiEntry;
    return {
      full: objectHash.sha1({ id, name, type, keys, attributes, entry }),
      text: exports.hashText(entry)
    }
  }
);