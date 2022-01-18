const { chain, partition, fromPairs, tuple, getEntryText } = require("../utils");
const { worldInfoString } = require("./utils");
const { StateEngineEntry, BadStateEntryError, InvalidTypeError } = require("./StateEngineEntry");
const { isRelation, parsers: baseParsers } = require("./StateEngineEntry");

const reInfoEntry = /^\$(\w+?)((?:\[|\().*)?$/;
const reInfoDeclaration = /^(?:\[([\w &]*?)\])?(\(.+?\))?$/;
const reInfoKeywords = /^\((.*)?\)$/;

exports.parsers = {
  ...baseParsers,
  /**
   * Parses an info entry into its type and the info declaration:
   * - "$Scene" => `["Scene", undefined]`
   * - "$Player[Ike & Hero]" => `["Player", "[Ike & Hero]"]`
   * - "$Lore[Ancient Temple]" => `["Lore", "[Ancient Temple]"]`
   * - "$Lore[Ancient Temple & Ike]" => `["Lore", "[Ancient Temple & Ike]"]`
   * - "$Lore[Ancient Temple](temple; ancient)" => `["Lore", "[Ancient Temple](temple; ancient)"]`
   * - "$State(weapon; sword)" => `["State", "(weapon; sword)"]`
   * 
   * @type {PatternMatcher<[type: string, decPart: string | undefined]>}
   */
  infoEntry: (text) => {
    if (!text) return undefined;
    const matched = reInfoEntry.exec(text);
    if (!matched) return undefined;
    const [, type, decPart] = matched;
    return [type, decPart];
  },
  /**
   * Parses an info declaration into its separated topics and matcher part:
   * - "" => `[[], undefined]`
   * - "[]" => `[[], undefined]`
   * - "[Ike]" => `[["Ike"], undefined]`
   * - "[Ike & Hero]" => `[["Ike", "Hero"], undefined]`
   * - "[Goddess Hall](:Ancient Temple; goddess)" => `[["Goddess Hall"], "(:Ancient Temple; goddess)"]`
   * - "(:Ancient Temple; goddess)" => `[[], "(:Ancient Temple; goddess)"]`
   * 
   * @type {PatternMatcher<[topics: string[], matchersPart: string | undefined]>}
   */
  infoDeclaration: (decPart) => {
    // We do allow empty/missing 
    if (!decPart) return [[], undefined];
    const matched = reInfoDeclaration.exec(decPart);
    if (!matched) return undefined;
    const [, topicsPart, matchersPart] = matched;
    const topics = !topicsPart ? [] : topicsPart.split("&").map((k) => k.trim());
    // We'll fail if any topic is empty, IE the user provided `" & Something"`.
    if (topics.some((topic) => !topic)) return undefined;
    return [topics, matchersPart];
  },
  /**
   * Parses a keyword part:
   * - undefined => `[]`
   * - "" => `[]`
   * - "()" => `[]`
   * - "(:GoddessHall; temple; -ancient)" => `[ParsedRelation, ParsedKeyword, ParsedKeyword]`
   * 
   * @type {PatternMatcher<AnyMatcherDef[]>}
   */
  infoMatchers: (matchersPart) => {
    // Allow `""` and `undefined` to count as a successful match. 
    if (!matchersPart) return [];
    // But if we must parse, and it fails, its a failure.
    const matched = reInfoKeywords.exec(matchersPart);
    if (!matched) return undefined;
    const [, matchersHunk] = matched;
    const matcherFrags = matchersHunk.split(";").map((frag) => frag.trim()).filter(Boolean);
    if (matcherFrags.length === 0) return [];

    /** @type {Array<AnyMatcherDef>} */
    const matchers = [];
    for (const matcherFrag of matcherFrags) {
      const matched = baseParsers.matcher(matcherFrag);
      if (!matched) return undefined;
      matchers.push(matched);
    }
    return matchers;
  }
};

/**
 * Extracts the type for a `StateEngineEntry` from a `WorldInfoEntry`.
 * 
 * @param {WorldInfoEntry} worldInfo
 * @returns {string | undefined}
 */
exports.extractType = (worldInfo) => {
  const [type] = exports.parsers.infoEntry(worldInfo.keys) ?? [];
  return type;
};

/**
 * The default World Info parser for a standard State Entry.
 * 
 * @param {WorldInfoEntry["keys"]} infoKey
 * @returns {Omit<StateEngineData, "entryId"> | undefined}
 */
 exports.infoKeyParserImpl = (infoKey) => {
  const {
    infoEntry, infoDeclaration, infoMatchers
  } = exports.parsers;

  const matchedEntry = infoEntry(infoKey);
  if (!matchedEntry) return undefined;
  const [type, decPart] = matchedEntry;

  const matchedDec = infoDeclaration(decPart);
  if (!matchedDec) return undefined;
  const [topics, keywordsPart] = matchedDec;
  const matchers = infoMatchers(keywordsPart);
  if (!matchers) return undefined;

  // @ts-ignore - TS is stupid with defaults in destructuring.
  // It's still typing correctly, though.
  const { relations = [], keywords = [] } = chain(matchers)
    .map((matcher) => isRelation(matcher) ? tuple("relations", matcher) : tuple("keywords", matcher))
    .thru((kvps) => partition(kvps))
    .value((kvps) => fromPairs(kvps));

  return { type, topics, relations, keywords };
};

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
   * @param {string | undefined} type
   * @returns {boolean}
   */
  static checkType(type) {
    return type === this.forType;
  }

  /**
   * @param {AIDData} data
   * @param {Context} ctx
   * @returns {Iterable<StateEngineEntry>}
   */
  static *produceEntries(data, { config, validationIssues }) {
    for (const info of data.worldEntries) {
      try {
        const type = exports.extractType(info);
        if (!this.checkType(type)) continue;
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
    const { keys } = worldInfo;
    if (keys.indexOf(",") !== -1)
      throw new BadStateEntryError([
        "The World Info entry's keys contain a comma.",
        "Keywords should be separated by a semi-colon (;), instead."
      ].join("  "));

    const parsedResult = exports.infoKeyParserImpl(keys);
    if (!parsedResult)
      throw new BadStateEntryError(
        `Failed to parse World Info entry as a \`${this.type}\`.`
      );
    if (parsedResult.type !== this.type)
      throw new InvalidTypeError([
        `Expected World Info entry to parse as a \`${this.type}\``,
        `but it parsed as a \`${parsedResult.type}\` instead.`
      ].join(", "));

    return parsedResult;
  }

  /**
   * Serializes an `EngineEntryForWorldInfo` into an `EngineDataForWorldInfo`.
   * 
   * @returns {EngineDataForWorldInfo}
   */
  toJSON() {
    const { infoKey, infoName } = this;
    return { ...super.toJSON(), infoKey, infoName, forWorldInfo: true };
  }
}

exports.EngineEntryForWorldInfo = EngineEntryForWorldInfo;