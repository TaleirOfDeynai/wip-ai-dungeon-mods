const p = require("parsimmon");
const { dew } = require("../../../utils");
const { KEYWORD_MODIFIERS: { INCLUDE, EXCLUDE } } = require("../checks");
const sep = require("./separators");

/**
 * @param {string} value
 * @param {boolean} [exactMatch]
 * @param {KeywordTypes} [type]
 * @return {AnyKeywordDef}
 */
exports.keywordWrapper = (value, exactMatch = false, type = INCLUDE) =>
  ({ type, exactMatch, value });

exports.doubleQuoteKeyword = p.regex(/"([^"]*?)"/, 1)
  .map((text) => exports.keywordWrapper(text, true))
  .desc(`a keyword in double-quotes (")`);
exports.backtickKeyword = p.regex(/`([^`]*?)`/, 1)
  .map((text) => exports.keywordWrapper(text, true))
  .desc("a keyword in back-ticks (`)");
exports.bareSemiKeyword = p.regex(/[\w\d][^;]*/)
  .map((s) => s.trim())
  .map(exports.keywordWrapper)
  .desc("a bare keyword");
exports.bareCommaKeyword = p.regex(/[\w\d][^,]*/)
  .map((s) => s.trim())
  .map(exports.keywordWrapper)
  .desc("a bare keyword");

/** @type {p.Parser<KeywordTypes>} */
const keywordType = p.alt(
  p.string("-").result(EXCLUDE),
  p.string("+").result(INCLUDE)
);

exports.keywordType = keywordType.desc("an inclusion modifier (+-)");

/** @type {p.Parser<KeywordTypes>} */
exports.optKeywordType = keywordType.fallback(INCLUDE);

exports.semi = dew(() => {
  /** @type {p.Parser<AnyKeywordDef>} */
  const keyword = p.seqMap(
    exports.optKeywordType,
    p.alt(
      exports.doubleQuoteKeyword,
      exports.backtickKeyword,
      exports.bareSemiKeyword
    ),
    (type, keywordDef) => {
      keywordDef.type = type;
      return keywordDef;
    }
  );

  return {
    separator: sep.semi,
    keyword,
    sequence: p.sepBy(keyword.trim(sep.ws), sep.semi.or(sep.newline))
  };
});

exports.comma = dew(() => {
  /** @type {p.Parser<AnyKeywordDef>} */
  const keyword = p.seqMap(
    exports.optKeywordType,
    p.alt(
      exports.doubleQuoteKeyword,
      exports.backtickKeyword,
      exports.bareCommaKeyword
    ),
    (type, keyword) => ({ ...keyword, type })
  );

  return {
    separator: sep.comma,
    keyword,
    sequence: p.sepBy(keyword.trim(sep.ws), sep.comma.or(sep.newline))
  };
});