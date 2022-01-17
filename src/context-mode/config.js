const { dew } = require("../utils");
const { ConfigNamespace } = require("../config-commander/ConfigNamespace");
const getStateEngineConfig = require("../state-engine/config");

const defaultConfiguration = {
  /**
   * How much of `info.maxChars` should be devoted to world-info.
   * This will be `maxChars` after these config values have been factored in:
   * - `state-engine.maxCharsOverride`
   * - `state-engine.maxCharsMultiplier`
   */
  customContextMultiplier: 0.33,
};

/** @typedef {ConfigNamespace<typeof defaultConfiguration>} ContextModeConfig */

/**
 * @typedef ContextModeConfigWrapper
 * @prop {ContextModeConfig} configNamespace
 * @prop {number} maxChars
 * @prop {number} maxMemory
 */

/**
 * Gets the configuration namespace for this module.
 * 
 * @param {import("aid-bundler/src/aidData").AIDData} aidData 
 * @returns {Readonly<ContextModeConfigWrapper>}
 */
module.exports = (aidData) => {
  const configNamespace = ConfigNamespace.fetch(aidData, "context-mode", defaultConfiguration);

  // Determine how to treat `maxChars`, which State-Engine sets up for us.
  const maxChars = dew(() => {
    const seConfig = getStateEngineConfig(aidData);
    const override = seConfig.get("integer", "maxCharsOverride");
    if (override > 0) return override;

    const multiplier = seConfig.get("number", "maxCharsMultiplier");
    return (aidData.info.maxChars * multiplier) | 0;
  });

  // Determine how much of the context we're going to commit to extra stuff.
  const maxMemory = dew(() => {
    const multiplier = configNamespace.get("number", "customContextMultiplier");
    return (maxChars * multiplier) | 0;
  });

  return Object.freeze({ configNamespace, maxChars, maxMemory });
};