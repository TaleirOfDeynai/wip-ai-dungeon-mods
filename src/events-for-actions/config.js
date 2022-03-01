const { ConfigNamespace } = require("../config-commander/ConfigNamespace");

const defaultConfiguration = {
  /**
   * How many entries of `history` should be checked for changes.
   * 
   * Since hashing objects takes up time, we limit the search to the latest 30
   * actions only.  In general, players will likely only update the last few actions
   * of the story, so checking every last one we have access to is not a very good
   * use of Latitude's server resources.
   */
  maximumLookBack: 30
};

/** @typedef {ConfigNamespace<typeof defaultConfiguration>} EventsForActionsConfig */

/**
 * Gets the configuration namespace for this module.
 * 
 * @param {import("aid-bundler/src/aidData").AIDData} aidData 
 * @returns {EventsForActionsConfig}
 */
module.exports = (aidData) => 
  ConfigNamespace.fetch(aidData, "events-for-actions", defaultConfiguration);