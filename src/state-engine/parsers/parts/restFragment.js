const p = require("parsimmon");

class _RestFragment {
  /**
   * @param {p.Index} index
   * @param {string} rest
   */
  constructor(index, rest) {
    this.offset = index.offset;
    this.line = index.line;
    this.column = index.column;
    this.text = rest;
  }

  /**
   * Attempts to parse the fragment with the given `parser`.
   * 
   * @template T
   * @param {p.Parser<T>} parser
   * @returns {p.Result<T>}
   */
  then(parser) {
    const result = parser.parse(this.text);
    if (result.status) return result;
    result.index.offset += this.offset;
    result.index.line += this.line - 1;
    result.index.column += this.column - 1;
    return result;
  }

  /**
   * Adjusts the cursor of `nextFragment`, which was parsed from this fragment
   * using the {@link _RestFragment.then} method.
   * 
   * @param {_RestFragment} nextFragment 
   * @returns {_RestFragment}
   */
  adjustCursor(nextFragment) {
    const newIndex = {
      offset: this.offset + nextFragment.offset,
      line: this.line + nextFragment.line - 1,
      column: this.column + nextFragment.column - 1
    };
    return new _RestFragment(newIndex, nextFragment.text);
  }
}

/**
 * A parser that extracts the remainder of a string so that it may be parsed
 * separately without loosing track of the "cursor" for errors.
 */
module.exports = p.seqMap(p.index, p.all, (index, rest) => new _RestFragment(index, rest));

/** @typedef {_RestFragment} RestFragment */