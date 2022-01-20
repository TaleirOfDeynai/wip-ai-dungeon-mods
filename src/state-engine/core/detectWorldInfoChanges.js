const eventEmitter = require("../../events");
const { worldInfoHash } = require("../utils");

/**
 * @param {any} entry 
 * @returns {entry is EngineDataForWorldInfo}
 */
const isForWorldInfo = (entry) => entry && "forWorldInfo" in entry && entry.forWorldInfo;

/**
 * Checks the cache to see if any world-info entries have changed or been removed
 * between runs.
 * 
 * - Emits `state-engine.entryChanged` when contents change.
 * - Emits `state-engine.entryRemoved` when deleted or deactivated.
 * 
 * @type {BundledModifierFn}
 */
module.exports = (data) => {
  const { state, worldEntries } = data;
  const { $$stateDataCache } = state;

  if (!$$stateDataCache) return;

  /** @type {Set<string>} */
  const existingSet = new Set();

  // Checking for changes.
  for (const wi of worldEntries) {
    existingSet.add(wi.id);

    const existingEntry = $$stateDataCache[wi.id];
    if (!isForWorldInfo(existingEntry)) continue;
    // In case this is an older entry, without a hash, we cannot do anything.
    if (!existingEntry.infoHash) continue;
    // Check for difference in hash value.
    const currentHash = worldInfoHash(wi);
    if (currentHash === existingEntry.infoHash) continue;

    // We likely have a change.  Let's share the current `WorldInfoEntry` and
    // previous `EngineDataForWorldInfo` with an event.
    eventEmitter.emit("state-engine.entryChanged", data, wi, existingEntry);
  }

  // Checking for removals.
  for (const entryId of Object.keys($$stateDataCache)) {
    if (existingSet.has(entryId)) continue;

    // Can't find the ID from the previous loop.  Emit the removal.
    eventEmitter.emit("state-engine.entryRemoved", data, entryId);
  }
};