const p = require("parsimmon");
const { tuple } = require("../../../utils");
const takeUntil = require("./takeUntil");

/**
 * Creates a parser that parses everything after `startParser` and before `endParser`
 * with the given `innerParser`, yielding the result from `innerParser`.  This will
 * consume everything up-to and including `endParser` when successful.
 * 
 * Use this to parse a string between two delimiters in isolation.
 * 
 * @param {p.Parser<string>} startParser
 * The parser that starts the isolated block.
 * @param {p.Parser<string>} [endParser]
 * The parser that ends the isolated block.  If `undefined`, it will use `startParser`.
 * @returns {<T>(innerParser: p.Parser<T>) => p.Parser<T>}
 * A function that can be passed to `Parser.thru` or called with the parser that will
 * parse the isolated string.
 */
module.exports = (startParser, endParser = startParser) => (innerParser) => p
  .seqMap(
    startParser, p.index, takeUntil(endParser), endParser,
    (_s, start, innerText, _e) => tuple(start, innerText)
  )
  .chain(([start, innerText]) => {
    const result = innerParser.parse(innerText);
    return p((_input, i) => {
      if (result.status) return p.makeSuccess(i, result.value);
      return p.makeFailure(start.offset + result.index.offset, result.expected);
    });
  });