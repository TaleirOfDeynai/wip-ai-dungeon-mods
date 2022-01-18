/// <reference path="../state-engine.d.ts" />
const { chain, partition, fromPairs, tuple, is } = require("../../utils");
const { addStateEntry } = require("../registry");
const { isRelation } = require("../parsers/checks");
const { EngineEntryForWorldInfo } = require("../EngineEntryForWorldInfo");

/**
 * Does some global setup for this module.
 * 
 * @type {BundledModifierFn}
 */
 const init = () => {
  /**
   * A simple state entry type for the vanilla world info, for backward compatibility
   * with the standard system.
   */
  class VanillaEntry extends EngineEntryForWorldInfo {
    static get forType() { return "VanillaEntry"; }
    get targetSources() { return tuple("history"); }

    /**
     * A special type checker for this entry; an `undefined` type will be treated as
     * a vanilla entry, as well as any entry that did not get parsed from a State-Engine
     * format.
     * 
     * @param {AnyEntryTypeDef | undefined} typeDef 
     * @returns {boolean}
     */
    static checkType(typeDef) {
      if (!is.object(typeDef)) return true;
      if (typeDef.type !== "state-engine") return true;
      return super.checkType(typeDef);
    }

    /**
     * @param {WorldInfoEntry} worldInfo
     * @returns {Omit<StateEngineData, "entryId">}
     */
    parse(worldInfo) {
      const { topics, relations, keywords } = super.parse(worldInfo);
      return { type: "VanillaEntry", topics, relations, keywords };
    }
  }

  addStateEntry(VanillaEntry);
};

/** @type {StateModule} */
exports.stateModule = {
  pre: [init]
};