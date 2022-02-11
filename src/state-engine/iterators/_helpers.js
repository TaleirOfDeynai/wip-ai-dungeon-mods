const { shutUpTS, chain, iterReverse, iterPosition } = require("../../utils");

/**
 * @template {string | undefined} T
 * @param {T} text 
 * @param {number} sOffset 
 * @param {number} eOffset 
 * @returns {T}
 */
const cutBetween = (text, sOffset, eOffset) => {
  if (!text) return text;
  if (sOffset === 0 && eOffset === 0) return text;
  if (eOffset === 0) return shutUpTS(text.slice(sOffset));
  return shutUpTS(text.slice(sOffset, -eOffset));
};

/**
 * Takes a `HistorySources` and reconstructs the text fragment from it.
 * 
 * @param {HistorySources} theSources
 * @returns {string | undefined}
 */
exports.extractTextFragment = (theSources) => {
  if (theSources.entries.size === 0) return undefined;

  const { source: sSource, offset: sOffset } = theSources.start;
  const { source: eSource, offset: eOffset } = theSources.end;

  // Fast path: one entry and we're not actually trimming any text.
  if (sSource === eSource && sOffset === 0 && eOffset === 0)
    return theSources.entries.get(sSource)?.text;
  
  // Fast path: one entry, and we're grabbing a substring.
  if (sSource === eSource)
    return cutBetween(theSources.entries.get(sSource)?.text, sOffset, eOffset);

  // This is going to be somewhat naive.  Just iterate from start to end
  // and build a collection of sub-strings.  If something goes awkward,
  // just return `undefined`.  And remember, offsets are in reverse,
  // so the start is the HIGHER offset.
  const textParts = [];

  for (let i = sSource; i >= eSource; i--) {
    const entry = theSources.entries.get(i);
    // Shenanigans?  I dunno, just abort.
    if (!entry) return undefined;
    // Substring from the starting entry.
    if (i === sSource) textParts.push(cutBetween(entry.text, sOffset, 0));
    // Substring from the ending entry.
    else if (i === eSource) textParts.push(cutBetween(entry.text, 0, eOffset));
    // Use the whole thing in-between.
    else textParts.push(entry.text);
  }

  return textParts.join("");
};

/**
 * Creates the standard latest-to-oldest history iterator, including the offset
 * from the end of the `history` iterable.
 * 
 * @param {Iterable<HistoryEntry>} history 
 * @returns {Iterable<[number, HistoryEntry]>}
 */
exports.makeHistoryIterator = (history) => chain(history).thru(iterReverse).thru(iterPosition).value();

const $$toWrap = Symbol("WrappedIteratorResult.toWrap");

/**
 * A class that can act as a base for some simple transformation on an existing
 * `HistoryIteratorResult` object.
 * 
 * @implements {HistoryIteratorResult}
 */
class WrappedIteratorResult {
  /**
   * @param {HistoryIteratorResult} toWrap
   */
  constructor(toWrap) {
    this.wrappedResult = toWrap;
  }

  get offset() {
    return this.wrappedResult.offset;
  }

  get sources() {
    return this.wrappedResult.sources;
  }

  get type() {
    return this.wrappedResult.type;
  }

  get text() {
    return this.wrappedResult.text;
  }

  get desc() {
    return this.wrappedResult.desc;
  }
}

exports.WrappedIteratorResult = WrappedIteratorResult;