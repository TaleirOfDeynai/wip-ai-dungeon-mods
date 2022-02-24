const { memoizeGenerator } = require("../../utils");

/**
 * The very last thing before we begin; make sure we only churn through the history
 * once.  Memoize `data.historyIterator` and make it replayable.  Anything else
 * can call it and get the replay-iterator back, with all the current work cached.
 * 
 * @type {BundledModifierFn}
 */
module.exports = (data) => {
  data.historyIterator = memoizeGenerator(data.historyIterator);
};