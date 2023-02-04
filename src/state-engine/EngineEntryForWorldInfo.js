const Deferred = require("../utils/Deferred");
const { shutUpTS, is, getEntryText, chain, toPairs } = require("../utils");
const { worldInfoString } = require("./utils");
const { StateEngineEntry, BadStateEntryError, InvalidTypeError } = require("./StateEngineEntry");
const extractor = require("./parsers/extract");
const { ParsingError } = require("./parsers/errors");

/**
 * @typedef ParsedResult
 * @prop {string} type
 * @prop {string[]} topics
 * @prop {AnyRelationDef[]} relations
 * @prop {AnyKeywordDef[]} keywords
 * @prop {Record<string, any>} [state]
 */

class EngineEntryForWorldInfo extends StateEngineEntry {
  /**
   * @param {Context["config"]} config
   * @param {string} entryId
   * @param {WorldInfoEntry} worldInfo
   * @param {ParsedResult} parsedResult
   */
  constructor(config, entryId, worldInfo, parsedResult) {
    super(config);
    this.init(entryId, parsedResult.state, parsedResult.topics, parsedResult);
    this.worldInfo = worldInfo;
  }

  /**
   * Checks if the given `type` matches this type of entry.  It is possible
   * to receive `undefined` as `type`.
   * 
   * @param {AnyEntryTypeDef | undefined} typeDef
   * @returns {boolean}
   */
  static checkType(typeDef) {
    return typeDef?.type === "state-engine" && typeDef.value === this.forType;
  }

  /**
   * @param {import("./api")} api
   * @param {AIDData} data
   * @returns {Iterable<[string, StateEnginePotential]>}
   */
  static *discoverEntries(api, data) {
    const config = data.stateEngineContext.config;

    for (const info of data.worldEntries) {
      // We're going to try and only parse the type to begin with.
      // That's the minimum information needed to determine if this world-info
      // should be a member of this type.
      const theType = extractor.type(info).result;
      // Do our basic guards.
      if (is.undefined(theType)) continue;
      if (is.error(theType)) continue;
      if (!this.checkType(theType)) continue;

      const entryId = `${theType}:${info.id}`;

      const text = Deferred.wrap(info.entry || undefined);
      
      // All these are guarded so they cannot be `undefined`.
      // They may still resolve into an error, though.
      const topics = extractor.topics(info).map((v = []) => v);
      const relations = extractor.relations(info).map((v = []) => v);
      const keywords = extractor.keywords(info).map((v = []) => v);

      const entry = Deferred.joinMap(
        theType.value, topics, relations, keywords,
        (type, topics, relations, keywords) => new this(
          config, entryId, info, { type, topics, relations, keywords }
        )
      );

      yield [entryId, {
        entryId, text, topics, relations, keywords, entry,
        type: Deferred.wrap(theType)
      }];
    }
  }

  /**
   * @param {AIDData} data
   * @param {Context} ctx
   * @returns {Iterable<StateEngineEntry>}
   */
  static *produceEntries(data, { config, validationIssues }) {
    for (const info of data.worldEntries) {
      try {
        const theType = extractor.type(info).result;
        if (!this.checkType(theType)) continue;
        yield new this(info, config);
      }
      catch(err) {
        if (err instanceof InvalidTypeError) {
          // Technically, we checked this before hand and it shouldn't happen.
          // But just in case of shenanigans, we count this as just a mismatch
          // from a child-type and just continue.
          console.log(err.message);
          continue;
        }
        if (err instanceof ParsingError) {
          // Something happened in the parser combinators.  The user needs to
          // fix something in this entry.
          const renderAs = worldInfoString(info);
          const issues = validationIssues.get(renderAs) ?? [];
          issues.push(err.details);
          validationIssues.set(renderAs, issues);
          continue;
        }
        if (err instanceof BadStateEntryError) {
          // Log this error out to the user, associated with the world-info entry.
          const renderAs = worldInfoString(info);
          const issues = validationIssues.get(renderAs) ?? [];
          issues.push(err.message);
          validationIssues.set(renderAs, issues);
          continue;
        }
        // Not one of ours?  Throw it.
        throw err;
      }
    }
  }

  /**
   * A helper to get the best way to identify this entry.
   * 
   * @type {string}
   */
  get bestName() {
    if (this.infoName) return `World-Info \`${this.infoName}\``;
    if (this.infoKey) return `World-Info entry ${this.infoType}[${this.infoKey}]`;
    return `World-Info entry ${this.infoType}#${this.entryId}`;
  }

  /**
   * Shorthand accessor for `WorldInfoEntry.type`.
   * 
   * @type {string}
   */
  get infoType() {
    return this.worldInfo.type;
  }

  /**
   * Shorthand accessor for `WorldInfoEntry.keys`.
   * 
   * @type {string}
   */
  get infoKey() {
    return this.worldInfo.keys;
  }

  /**
   * Shorthand accessor for `WorldInfoEntry.name`, but produces `undefined` on
   * a string without useful content.
   * 
   * @type {string | undefined}
   */
  get infoName() {
    return this.worldInfo.name?.trim() || undefined;
  }

  /**
   * The associated text of this entry.
   * 
   * @type {string}
   */
   get text() {
    return getEntryText(this.worldInfo);
  }

  /**
   * Serializes an `EngineEntryForWorldInfo` into an `EngineDataForWorldInfo`.
   * 
   * @returns {EngineDataForWorldInfo}
   */
  toJSON() {
    const { infoType, infoKey, infoName } = this;

    return {
      ...super.toJSON(),
      forWorldInfo: true,
      infoType, infoKey, infoName
    };
  }
}

exports.EngineEntryForWorldInfo = EngineEntryForWorldInfo;