const Deferred = require("../../utils/Deferred");
const { asConstant } = require("../../utils");

exports.UNDEF_DEFERRED = Deferred.wrap(undefined);

exports.ATTRS = Object.freeze({
  TYPE: asConstant("@type"),
  TOPICS: asConstant("@topics"),
  KEYWORDS: asConstant("@keywords"),
  RELATIONS: asConstant("@relations")
});

exports.ENTRY_TYPES = Object.freeze({
  VANILLA: asConstant("vanilla"),
  STATE_ENGINE: asConstant("state-engine"),
  UNKNOWN: asConstant("unknown")
});

exports.KEYWORD_MODIFIERS = Object.freeze({
  INCLUDE: asConstant("include"),
  EXCLUDE: asConstant("exclude")
});

exports.RELATION_MODIFIERS = Object.freeze({
  ALL_OF: asConstant("allOf"),
  AT_LEAST_ONE: asConstant("atLeastOne"),
  IMMEDIATE: asConstant("immediate"),
  NEGATED: asConstant("negated")
});

/**
 * @param {any} value
 * @param {string} type
 * @returns {boolean}
 */
const hasTypeOf = (value, type) => "type" in value && value.type === type;
/** @type {Set<string>} */
const relationTypes = new Set(Object.values(exports.RELATION_MODIFIERS));
/** @type {Set<string>} */
const attrKeys = new Set(Object.values(exports.ATTRS));

/** @type {(value: AnyMatcherDef) => value is KeywordDef<"include">} */
exports.isInclusiveKeyword = (value) => hasTypeOf(value, exports.KEYWORD_MODIFIERS.INCLUDE);
/** @type {(value: AnyMatcherDef) => value is KeywordDef<"exclude">} */
exports.isExclusiveKeyword = (value) => hasTypeOf(value, exports.KEYWORD_MODIFIERS.EXCLUDE);
/** @type {(value: AnyMatcherDef) => value is AnyKeywordDef} */
exports.isKeyword = (value) => exports.isInclusiveKeyword(value) || exports.isExclusiveKeyword(value);
/** @type {(value: AnyMatcherDef) => value is AnyRelationDef} */
exports.isRelation = (value) => "type" in value && relationTypes.has(value.type);
/** @type {<TType extends RelationTypes>(value: AnyMatcherDef, type: TType) => value is RelationDef<TType>} */
exports.isRelationOfType = (value, type) => hasTypeOf(value, type);
/** @type {(value: AnyMatcherDef) => value is RelationDef<"negated">} */
exports.isNegatedRelation = (value) => exports.isRelationOfType(value, exports.RELATION_MODIFIERS.NEGATED);
/** @type {(value: AnyMatcherDef) => value is RelationDef<Exclude<RelationTypes, "negated">>} */
exports.isInclusiveRelation = (value) => !exports.isNegatedRelation(value);

/**
 * Determines if `WorldInfoEntry.attributes` contains recognized keys.
 * 
 * @param {Maybe<WorldInfoEntry>} entry
 * @return {boolean}
 */
exports.hasStateEngineAttrs = (entry) => {
  try {
    const attrs = entry?.attributes;
    if (!attrs) return false;

    for (const key of Object.keys(attrs))
      if (attrKeys.has(key))
        return true;
  }
  catch (_err) { /* Intentionally empty. */}
  return false;
};