const p = require("parsimmon");
const Deferred = require("../../utils/Deferred");
const { dew, is, tuple } = require("../../utils");
const { chain, partition, fromPairs } = require("../../utils");
const pSeparators = require("./parts/separators");
const pEntryTypes = require("./parts/entryTypes");
const { comma: { keyword } } = require("./parts/keywords");
const { relation } = require("./parts/topics");
const { UNDEF_DEFERRED, isRelation } = require("./checks");
const { ParsingError, isParsimmonFailure } = require("./errors");

// This is the fall-back extractor for entries that do not match any of the other methods.
// It allows backward compatibility with vanilla entries.

/** @type {p.Parser<AnyMatcherDef>} */
const matcher = p.alt(relation, keyword);

const matcherList = p.sepBy(matcher.trim(pSeparators.ws), pSeparators.comma);

/**
 * @param {string} wiKeys 
 * @returns {Pick<StateEngineData, "relations" | "keywords">}
 */
const matchMatchers = (wiKeys) => {
  const result = matcherList.parse(wiKeys);
  if (!result.status) throw result;
  // @ts-ignore - TS is stupid with defaults in destructuring.
  // It's still typing correctly, though.
  const { relations = [], keywords = [] } = chain(result.value)
    .map((matcher) => isRelation(matcher) ? tuple("relations", matcher) : tuple("keywords", matcher))
    .thru((kvps) => partition(kvps))
    .value((kvps) => fromPairs(kvps));
  
  return { relations, keywords };
};

exports.type = dew(() => {
  /** @type {PatternExtractor<AnyEntryTypeDef>} */
  const impl = (entry) => {
    const wiType = entry?.type;
    if (!is.string(wiType) || !wiType) return undefined;
    if (!wiType.trim()) return undefined;

    const result = pEntryTypes.typeField.parse(wiType);
    if (result.status) return result.value;
    throw new ParsingError(entry, "Entry Type", ["type"], wiType, result);
  };

  return Deferred.memoizeLazily(impl);
});

/** @type {DeferredExtractor<string[]>} */
exports.topics = (_entry) => UNDEF_DEFERRED;

exports.keywords = dew(() => {
  /** @type {PatternExtractor<AnyKeywordDef[]>} */
  const impl = (entry) => {
    const wiKeys = entry?.keys;
    if (!is.string(wiKeys) || !wiKeys) return undefined;
    if (!wiKeys.trim()) return [];

    try {
      return matchMatchers(wiKeys).keywords;
    }
    catch (error) {
      if (!isParsimmonFailure(error)) throw error;
      throw new ParsingError(entry, "List containing Keywords", ["keys"], wiKeys, error);
    }
  };

  return Deferred.memoizeLazily(impl);
});

exports.relations = dew(() => {
  /** @type {PatternExtractor<AnyRelationDef[]>} */
  const impl = (entry) => {
    const wiKeys = entry?.keys;
    if (!is.string(wiKeys) || !wiKeys) return undefined;
    if (!wiKeys.trim()) return [];

    try {
      return matchMatchers(wiKeys).relations;
    }
    catch (error) {
      if (!isParsimmonFailure(error)) throw error;
      throw new ParsingError(entry, "List containing Relations", ["keys"], wiKeys, error);
    }
  };

  return Deferred.memoizeLazily(impl);
});