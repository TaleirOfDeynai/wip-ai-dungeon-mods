const { callOnce, chain, iterReverse, iterPosition } = require("../../utils");

const $$entry = Symbol("ActionIteratorResult.entry");
const $$sources = Symbol("ActionIteratorResult.sources");

/**
 * @implements {HistoryIteratorResult}
 */
class ActionIteratorResult {
  /**
   * @param {number} offset
   * @param {HistoryEntry} entry 
   */
  constructor(offset, entry) {
    this[$$entry] = entry;
    this[$$sources] = callOnce(() => ({
      entries: new Map([[offset, entry]]),
      types: new Set([entry.type])
    }));

    this.offset = offset;
    this.origin = offset;
  }

  get sources() {
    return this[$$sources]();
  }

  get type() {
    return this[$$entry].type;
  }

  get text() {
    return this[$$entry].text;
  }
}

/**
 * The basic history iterator; just iterates the actions from latest to earliest.
 * It does nothing fancy with the text.
 * 
 * @param {Iterable<HistoryEntry>} history
 * The array of historical actions.
 * @returns {Iterable<ActionIteratorResult>}
 */
const actionIterator = (history) => chain(iterReverse(history))
  .thru(iterPosition)
  .map(([offset, history]) => new ActionIteratorResult(offset, history))
  .value();

module.exports = actionIterator;