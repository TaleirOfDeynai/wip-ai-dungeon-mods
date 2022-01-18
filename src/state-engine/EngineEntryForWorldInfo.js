const { getEntryText, shutUpTS } = require("../utils");
const { worldInfoString } = require("./utils");
const { StateEngineEntry, BadStateEntryError, InvalidTypeError } = require("./StateEngineEntry");
const extractor = require("./parsers/extract");
const { ParsingError } = require("./parsers/errors");

class EngineEntryForWorldInfo extends StateEngineEntry {
  /**
   * @param {WorldInfoEntry} worldInfo
   * @param {Context["config"]} config
   */
  constructor(worldInfo, config) {
    super(config);
    const parsedResult = this.parse(worldInfo);
    this.init(worldInfo.id, parsedResult.topics, parsedResult);
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
   * @param {AIDData} data
   * @param {Context} ctx
   * @returns {Iterable<StateEngineEntry>}
   */
  static *produceEntries(data, { config, validationIssues }) {
    for (const info of data.worldEntries) {
      try {
        const theType = extractor.type(info);
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
   * Transforms a `WorldInfoEntry` into a `WorldStateData` object by parsing its
   * `keys` property.  If it fails, it will return `null`.
   * 
   * @param {WorldInfoEntry} worldInfo 
   * @throws If parsing failed.
   * @throws If parsing succeeded, but the extracted type did not match.
   * @returns {Omit<StateEngineData, "entryId">}
   */
  parse(worldInfo) {
    /** @type {typeof EngineEntryForWorldInfo} */
    const ctor = shutUpTS(this.constructor);
    const parsedType = extractor.type(worldInfo);
    const topics = extractor.topics(worldInfo) ?? [];
    const keywords = extractor.keywords(worldInfo) ?? [];
    const relations = extractor.relations(worldInfo) ?? [];

    if (!parsedType)
      throw new BadStateEntryError(
        `Failed to parse World Info entry as a \`${this.type}\`.`
      );

    // It is possible that some entries may wish to map vanilla entry types
    // to State-Engine types, like AID's "character" to Deep-State's "NPC",
    // for instance.  If `checkType` says it's the right type, we'll assume
    // it knows what it is doing.
    if (!ctor.checkType(parsedType))
      throw new InvalidTypeError([
        `Expected World Info entry to parse as a \`${this.type}\``,
        `but it parsed as a \`${parsedType.value}\` instead.`
      ].join(", "));

    return {
      type: ctor.forType,
      topics, keywords, relations
    };
  }

  /**
   * Serializes an `EngineEntryForWorldInfo` into an `EngineDataForWorldInfo`.
   * 
   * @returns {EngineDataForWorldInfo}
   */
  toJSON() {
    const { infoType, infoKey, infoName } = this;
    return { ...super.toJSON(), infoType, infoKey, infoName, forWorldInfo: true };
  }
}

exports.EngineEntryForWorldInfo = EngineEntryForWorldInfo;