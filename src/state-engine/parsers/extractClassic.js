const Deferred = require("../../utils/Deferred");
const { dew, memoize, tuple } = require("../../utils");
const { chain, partition, fromPairs } = require("../../utils");
const { entryTypeWrapper } = require("./parts/entryTypes");
const pClassicKey = require("./parts/classicKey");
const { ENTRY_TYPES: { STATE_ENGINE }, UNDEF_DEFERRED, isRelation } = require("./checks");
const { ParsingError } = require("./errors");

/** @typedef {import("./parts/restFragment").RestFragment} RestFragment */

// This is the extractor for entries using the original `WorldInfoEntry.keys` syntax,
// IE: $Type[Topic](keyword; :Relation)

const splitType = dew(() => {
  /**
   * @param {WorldInfoEntry} entry
   * @returns {[string, RestFragment]}
   */
  const impl = (entry) => {
    const result = pClassicKey.patterns.type.parse(entry.keys);
    if (result.status) return result.value;
    throw new ParsingError(entry, "Classic State-Engine Syntax", ["keys"], entry.keys, result);
  };

  return Deferred.memoizeLazily(impl);
})

const splitTopics = dew(() => {
  /**
   * @param {WorldInfoEntry} entry
   * @returns {Deferred<[string[], RestFragment]>}
   */
  const impl = (entry) => splitType(entry).map(([, topicPart]) => {
    const result = topicPart.then(pClassicKey.patterns.context);
    if (result.status) {
      const [topics, matchersPart] = result.value;
      return tuple(topics, topicPart.adjustCursor(matchersPart));
    }
    throw new ParsingError(entry, "Classic State-Engine Syntax", ["keys"], entry.keys, result);
  });

  return memoize(impl);
});

const splitMatchers = dew(() => {
  /**
   * @param {WorldInfoEntry} entry
   * @returns {Deferred<{ keywords: AnyKeywordDef[], relations: AnyRelationDef[] }>}
   */
  const impl = (entry) => splitTopics(entry).map(([, matchersPart]) => {
    const result = matchersPart.then(pClassicKey.patterns.matchers);
    if (result.status) {
      // @ts-ignore - TS is stupid with defaults in destructuring.
      // It's still typing correctly, though.
      const { relations = [], keywords = [] } = chain(result.value)
        .map((matcher) => isRelation(matcher) ? tuple("relations", matcher) : tuple("keywords", matcher))
        .thru((kvps) => partition(kvps))
        .value((kvps) => fromPairs(kvps));
      
      return { relations, keywords };
    }
    throw new ParsingError(entry, "Classic State-Engine Syntax", ["keys"], entry.keys, result);
  });

  return memoize(impl);
});

/** @type {DeferredExtractor<AnyEntryTypeDef>} */
exports.type = (entry) => {
  if (!entry || !entry.keys?.trim().startsWith("$")) return UNDEF_DEFERRED;
  return splitType(entry).map(([type]) => entryTypeWrapper(type, STATE_ENGINE));
};

/** @type {DeferredExtractor<string[]>} */
exports.topics = (entry) => {
  if (!entry || !entry.keys?.trim().startsWith("$")) return UNDEF_DEFERRED;
  return splitTopics(entry).map(([topics]) => topics);
};

/** @type {DeferredExtractor<AnyKeywordDef[]>} */
exports.keywords = (entry) => {
  if (!entry || !entry.keys?.trim().startsWith("$")) return UNDEF_DEFERRED;
  return splitMatchers(entry).map(({ keywords }) => keywords);
};

/** @type {DeferredExtractor<AnyRelationDef[]>} */
exports.relations = (entry) => {
  if (!entry || !entry.keys?.trim().startsWith("$")) return UNDEF_DEFERRED;
  return splitMatchers(entry).map(({ relations }) => relations);
};