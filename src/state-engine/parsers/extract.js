const Deferred = require("../../utils/Deferred");
const { chain } = require("../../utils");
const extractClassic = require("./extractClassic");
const extractAttr = require("./extractAttr");
const extractField = require("./extractField");

const { defer, resolve } = Deferred;

// This is the base extractor.  It will attempt to extract information in the order:
// - Classic Format
// - Attributes Format
// - Vanilla Fail-Safe

// If any of the extractors recognize something, but the syntax is wrong, it will raise
// a `ParsingError` with information about the problem.

/**
 * This helper will resolve the deferred matchers sequentially until one of them resolves
 * an instance, an error is thrown, or none of them match (resulting in `undefined`).
 * 
 * @template T
 * @param {...T} patterns
 * @returns {Deferred<Deferred.Executed<T>>}
 */
const resolveFirst = (...patterns) => {
  const iter = chain(patterns).collect(resolve).value();
  return defer(() => { const [v] = iter; return v; });
};

/** @type {DeferredExtractor<AnyEntryTypeDef>} */
exports.type = (entry) => resolveFirst(
  extractClassic.type(entry),
  extractAttr.type(entry),
  extractField.type(entry)
);

/** @type {DeferredExtractor<string[]>} */
exports.topics = (entry) => resolveFirst(
  extractClassic.topics(entry),
  extractAttr.topics(entry),
  extractField.topics(entry)
);

/** @type {DeferredExtractor<AnyKeywordDef[]>} */
exports.keywords = (entry) => resolveFirst(
  extractClassic.keywords(entry),
  extractAttr.keywords(entry),
  extractField.keywords(entry)
);

/** @type {DeferredExtractor<AnyRelationDef[]>} */
exports.relations = (entry) => resolveFirst(
  extractClassic.relations(entry),
  extractAttr.relations(entry),
  extractField.relations(entry)
);