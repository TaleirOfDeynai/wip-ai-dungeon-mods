const { is } = require("../../utils");
const { makeHistoryIterator, extractTextFragment } = require("./_helpers");

const $$sources = Symbol("ActionIteratorResult.sources");

/**
 * Matches a string containing at least two lines.
 * 
 * Capture group `1` contains all content up to the last line.
 * - This group may start with a continuation and/or contain multiple other lines.
 * 
 * Capture group `2` contains a newline character followed by the contents
 * of the last line.
 * - It can potentially contain ONLY a newline character.  This usually means a
 *   double line-break was used, perhaps for a dramatic time skip or a perspective
 *   shift.
 * 
 * If this matcher fails, the string may still contain something, but it does
 * not contain a newline character.
 */
const reLineSplitter = /([\s\S]*)(\n[\s\S]*)/;

/**
 * @implements {HistoryIteratorResult}
 */
class ByLineIteratorResult {
  /**
   * @param {number} offset
   * @param {Iterable<[number, HistoryEntry]>} entries
   * @param {number} startOffset
   * @param {number} endOffset
   */
  constructor(offset, entries, startOffset, endOffset) {
    const theEntries = [...entries];
    if (theEntries.length <= 0) {
      throw new Error("Cannot build a `ByLineIteratorResult` without any entries.");
    }

    const theTypes = theEntries.map(([, { type }]) => type);
    const theOrigins = theEntries.map(([source]) => source);
    const startSource = Math.max(...theOrigins);
    const endSource = Math.min(...theOrigins);
    const baseType = theTypes[0];

    const theSources = {
      entries: new Map(theEntries),
      types: new Set(theTypes),
      start: { source: startSource, offset: startOffset },
      end: { source: endSource, offset: endOffset }
    };

    const theText = extractTextFragment(theSources);
    if (!is.string(theText)) {
      console.log("Failed to extract text fragment.");
      console.log(theSources);
      throw new Error("Failed to extract text fragment.");
    }

    this[$$sources] = theSources;
    this.type = theTypes.every((t) => t === baseType) ? baseType : "combined";
    this.offset = offset;
    this.text = theText;
  }

  get sources() {
    return this[$$sources];
  }

  get desc() {
    return `Line ${this.offset}`;
  }
}

/**
 * Breaks up `HistoryEntry` into its per-line parts.
 * - Elements yielded may be either new-lines or continuations.
 * - This iterates from the end of the string to the start, so the text may
 *   need to be inverted if you're joining them.
 * - `offset` is relative to the start of the string, so needs to be inverted when
 *   determining `end.offset`.
 * 
 * @param {HistoryEntry} entry
 * @returns {Iterable<{ type: "line" | "continuation", text: string, offset: number }>}
 */
function* breakApart(entry) {
  let remainder = entry.text;
  while (remainder) {
    const match = reLineSplitter.exec(remainder);
    if (match) {
      const [, head, nextLine] = match;
      yield { type: "line", text: nextLine, offset: head.length };
      remainder = head;
    }
    else {
      yield { type: "continuation", text: remainder, offset: 0 };
      remainder = "";
    }
  }
}

/**
 * A per-line iterator.
 * 
 * Bear in mind the following:
 * - Actions that contain more than one complete line will be split apart.
 * - Actions that contain a line continuation will be merged with prior actions
 *   until a complete line is formed.
 * - All resulting entries except maybe the last will start with a newline
 *   character.  The last entry will be the scenario's prompt, and that action
 *   usually does not start with an empty line.
 * 
 * Some terms that you'll probably see around this iterator:
 * - "line" - Any string starting with `\n`, followed by a single line's content.
 * - "continuation" - Any string that does not start with `\n`.
 * 
 * @param {Iterable<HistoryEntry>} history
 * The array of historical actions.
 * @returns {Iterable<ByLineIteratorResult>}
 */
function* perLineIterator(history) {
  let nextYield = 0;
  /** @type {HistoryData["sources"]} */
  let sources = new Map();
  let endOffset = 0;

  for (const [offset, entry] of makeHistoryIterator(history)) {
    // Record the next source encountered if we've started an entry.
    if (sources.size > 0) sources.set(offset, entry);

    for (const nextFragment of breakApart(entry)) {
      if (sources.size === 0) {
        // Record this as `endOffset`.
        sources.set(offset, entry);
        endOffset = entry.text.length - (nextFragment.offset + nextFragment.text.length);
      }
      // We keep going until we hit a new-line.
      if (nextFragment.type !== "line") continue;

      // We need to yield the next batch, if there's something to yield.
      yield new ByLineIteratorResult(nextYield, sources, nextFragment.offset, endOffset);
      nextYield += 1;
      sources = new Map();
      endOffset = 0;
    }
  }

  // Before we leave, make sure we yield the last entry.
  if (sources.size) {
    yield new ByLineIteratorResult(nextYield, sources, 0, endOffset);
  }
}

module.exports = perLineIterator;