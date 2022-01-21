const eventEmitter = require("../../events");
const { hashWorldInfo } = require("../utils");

/**
 * @param {any} entry 
 * @returns {entry is EngineDataForWorldInfo}
 */
const isForWorldInfo = (entry) => entry && "forWorldInfo" in entry && entry.forWorldInfo;

/**
 * Checks the cache to see if any world-info entries have changed or been removed
 * between runs.
 * 
 * Emits these events:
 * - `state-engine.entryChanged`
 *   - When any change is detected.
 *   - Signature: `(data: AIDData, wiEntry: WorldInfoEntry, seEntry: EngineDataForWorldInfo) => void`
 * - `state-engine.entryTextChanged`
 *   - When a text change is detected.
 *   - Signature: `(data: AIDData, wiEntry: WorldInfoEntry, seEntry: EngineDataForWorldInfo) => void`
 * - `state-engine.entryRemoved`
 *   - When an entry is deleted or deactivated.
 *   - Signature: `(data: AIDData, entryId: string, cachedEntry: EngineDataForWorldInfo) => void`
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
    const currentHash = hashWorldInfo(wi);
    if (!currentHash) continue;

    if (currentHash.full !== existingEntry.infoHash.full) {
      // We likely have some kind of change.  Let's share the current `WorldInfoEntry`
      // and previous `EngineDataForWorldInfo` with an event.
      eventEmitter.emit("state-engine.entryChanged", data, wi, existingEntry);
    }

    if (currentHash.text !== existingEntry.infoHash.text) {
      // And notify on text changes, as well.  Saves listeners from having to compare
      // `WorldInfoHash.text` themselves.
      eventEmitter.emit("state-engine.entryTextChanged", data, wi, existingEntry);
    }
  }

  // Checking for removals.
  for (const entryId of Object.keys($$stateDataCache)) {
    if (existingSet.has(entryId)) continue;

    // Can't find the ID from the previous loop.  Emit the removal.
    const cachedEntry = $$stateDataCache[entryId];
    eventEmitter.emit("state-engine.entryRemoved", data, entryId, cachedEntry);
  }
};