const EventEmitter = require("events");

/**
 * A global event emitter for AI Dungeon's scripting sandbox.
 * 
 * Please namespace events, like: `state-engine.worldInfoUpdated`
 * 
 * This emitter does not include `AIData` or information on the current
 * lifecycle of the script by default; anything relevant must be passed
 * in to `emit`.
 */
module.exports = new EventEmitter();