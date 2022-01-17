const { ConfigNamespace } = require("../config-commander/ConfigNamespace");

const defaultConfiguration = {
  /** The number of `history` entries to match to state data. */
  entryCount: 20,
  /** Overrides `info.maxChars` with this value.  Disables `maxCharsMultiplier` when non-zero. */
  maxCharsOverride: 0,
  /** Multiplies `info.maxChars` with this value.  Disabled by non-zero `maxCharsOverride`. */
  maxCharsMultiplier: 1
};

/** @typedef {ConfigNamespace<typeof defaultConfiguration>} StateEngineConfig */

/**
 * Gets the configuration namespace for this module.
 * 
 * @param {import("aid-bundler/src/aidData").AIDData} aidData 
 * @returns {StateEngineConfig}
 */
module.exports = (aidData) =>
  ConfigNamespace.fetch(aidData, "state-engine", defaultConfiguration);