const p = require("parsimmon");
const { ENTRY_TYPES: { VANILLA, STATE_ENGINE, UNKNOWN } } = require("../checks");

/**
 * @param {string} value
 * @param {EntryTypes} [type]
 * @return {AnyEntryTypeDef}
 */
exports.entryTypeWrapper = (value, type = UNKNOWN) => ({ type, value });

exports.knownVanilla = p
  .alt(
    p.string("worldDescription"),
    p.string("race"),
    p.string("class"),
    p.string("faction"),
    p.string("location"),
    p.string("character")
  )
  .map((value) => exports.entryTypeWrapper(value, VANILLA));

exports.sePrefixes = p
  .alt(
    p.string("se"),
    p.string("SE"),
    p.string("$")
  )
  .desc("a state-engine type prefix (se, SE, or $)");

exports.seBareType = p.regex(/\w+/).desc("a state-engine compatible type (letters only)");

exports.sePrefixedType = exports.sePrefixes
  .then(exports.seBareType)
  .map((value) => exports.entryTypeWrapper(value, STATE_ENGINE));

/** Matcher for `WorldInfoEntry.type`. */
exports.typeField = p
  .alt(
    exports.knownVanilla,
    exports.sePrefixedType,
    p.all
      .map((value) => value.trim())
      .assert(Boolean, "a string with content")
      .map((value) => exports.entryTypeWrapper(value, UNKNOWN))
  )
  .trim(p.optWhitespace);

/** Matcher for `WorldInfoEntry.attributes["@type"]`. */
exports.typeAttr = p
  .alt(
    // Can be a prefixed-type.
    exports.sePrefixedType,
    // Or a bare type.
    exports.seBareType.map((value) => exports.entryTypeWrapper(value, STATE_ENGINE))
  )
  .trim(p.optWhitespace);