const { memoizedCounter } = require("../MatchableEntry");
const turnCache = require("../../turn-cache");
const getConfig = require("../config");

/**
 * Sets up shared context object.
 * 
 * @type {BundledModifierFn}
 */
 module.exports = (data) => {
  data.stateEngineContext = {
    config: getConfig(data),
    matchCounter: memoizedCounter(),
    theCache: turnCache.forWrite(data, "StateEngine.association"),
    entriesMap: {},
    validationIssues: new Map(),
    sortedStateMatchers: [],
    workingHistory: new Map(),
    stateAssociations: new Map(),
    scoresMap: new Map()
  };
};