const { memoize } = require("../../utils");
const { entryTypeWrapper } = require("./parts/entryTypes");
const pClassicKey = require("./parts/classicKey");
const { ENTRY_TYPES: { STATE_ENGINE } } = require("./checks");
const { ParsingError } = require("./errors");

// This is the extractor for entries using the original `WorldInfoEntry.keys` syntax,
// IE: $Type[Topic](keyword; :Relation)

const matchClassicKey = memoize((wiKeys) => {
  return pClassicKey.infoEntry.parse(wiKeys);
});

/** @type {PatternExtractor<AnyEntryTypeDef>} */
exports.type = (entry) => {
  const wiKeys = entry?.keys;
  if (!wiKeys) return undefined;
  if (!wiKeys.trim().startsWith("$")) return undefined;

  const result = matchClassicKey(wiKeys);
  if (result.status) return entryTypeWrapper(result.value.type, STATE_ENGINE);
  throw new ParsingError(entry, "Classic State-Engine Syntax", ["keys"], wiKeys, result);
};

/** @type {PatternExtractor<string[]>} */
exports.topics = (entry) => {
  const wiKeys = entry?.keys;
  if (!wiKeys) return undefined;
  if (!wiKeys.trim().startsWith("$")) return undefined;

  const result = matchClassicKey(wiKeys);
  if (result.status) return result.value.topics;
  throw new ParsingError(entry, "Classic State-Engine Syntax", ["keys"], wiKeys, result);
};

/** @type {PatternExtractor<AnyKeywordDef[]>} */
exports.keywords = (entry) => {
  const wiKeys = entry?.keys;
  if (!wiKeys) return undefined;
  if (!wiKeys.trim().startsWith("$")) return undefined;

  const result = matchClassicKey(wiKeys);
  if (result.status) return result.value.keywords;
  throw new ParsingError(entry, "Classic State-Engine Syntax", ["keys"], wiKeys, result);
};

/** @type {PatternExtractor<AnyRelationDef[]>} */
exports.relations = (entry) => {
  const wiKeys = entry?.keys;
  if (!wiKeys) return undefined;
  if (!wiKeys.trim().startsWith("$")) return undefined;

  const result = matchClassicKey(wiKeys);
  if (result.status) return result.value.relations;
  throw new ParsingError(entry, "Classic State-Engine Syntax", ["keys"], wiKeys, result);
};