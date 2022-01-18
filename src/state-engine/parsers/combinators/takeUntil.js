/// <reference path="./extensions.d.ts" />
const p = require("parsimmon");

/**
 * Creates a parser that takes characters until `parser` is encountered.  It will
 * stop at, but not consume, the text that `parser` matches.
 * 
 * The match fails if `parser` is never encountered.
 * 
 * @param {p.Parser<string>} parser
 * @returns {p.Parser<string>}
 */
module.exports = (parser) => p((input, iStart) => {
  let iEnd = iStart, len = input.length;
  for (;; iEnd++) {
    const result = parser._(input, iEnd);
    if (result.status) break;
    if (iEnd < len) continue;
    return p.makeFailure(iEnd, result.expected.map((e) => `a sub-string ended by ${e}`));
  }

  return p.makeSuccess(iEnd, input.substring(iStart, iEnd));
});