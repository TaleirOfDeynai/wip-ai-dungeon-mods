const p = require("parsimmon");
const { chain, partition, fromPairs, tuple } = require("../../../utils");
const { isRelation } = require("../checks");
const isolatedBetween = require("../combinators/isolatedBetween");
const restFragment = require("./restFragment");
const sep = require("./separators");
const { semi: { keyword } } = require("./keywords");
const { topic, relation } = require("./topics");

/** @type {p.Parser<AnyMatcherDef>} */
exports.matcher = p.alt(relation, keyword);

exports.matchers = p.sepBy(exports.matcher.trim(sep.ws), sep.semi);

exports.infoMatchers = p.alt(
  // Use isolation, as bare keywords will try to consume the closing parenthesis.
  exports.matchers.thru(isolatedBetween(p.string("("), p.string(")").skip(p.optWhitespace).skip(p.eof))),
  // Optional matcher area.
  p.succeed([])
);

exports.contextProvides = p.sepBy(topic, sep.tag);

exports.infoContext = p.alt(
  exports.contextProvides.wrap(p.string("["), p.string("]")),
  // Optional context area.
  p.succeed([])
);

exports.markedType = p.regexp(/\$(\w+)/, 1).desc("an entry type, prefixed with the dollar-sign ($)");

exports.patterns = {
  type: p.seqMap(exports.markedType, restFragment, tuple).trim(sep.ws).lookahead(p.eof),
  context: p.seqMap(exports.infoContext, restFragment, tuple),
  matchers: exports.infoMatchers
};

/** @type {p.Parser<Omit<StateEngineData, "entryId" | "text">>} */
exports.infoEntry = p
  .seqMap(
    exports.markedType,
    exports.infoContext,
    exports.infoMatchers,
    (type, topics, matchers) => {
      // @ts-ignore - TS is stupid with defaults in destructuring.
      // It's still typing correctly, though.
      const { relations = [], keywords = [] } = chain(matchers)
        .map((matcher) => isRelation(matcher) ? tuple("relations", matcher) : tuple("keywords", matcher))
        .thru((kvps) => partition(kvps))
        .value((kvps) => fromPairs(kvps));
      
      return { type, topics, relations, keywords };
    }
  )
  .trim(sep.ws)
  .lookahead(p.eof);