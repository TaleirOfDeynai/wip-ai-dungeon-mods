const extractClassic = require("./extractClassic");
const extractAttr = require("./extractAttr");
const extractField = require("./extractField");

// This is the base extractor.  It will attempt to extract information in the order:
// - Classic Format
// - Attributes Format
// - Vanilla Fail-Safe

// If any of the extractors recognize something, but the syntax is wrong, it will raise
// a `ParsingError` with information about the problem.

/** @type {PatternExtractor<AnyEntryTypeDef>} */
exports.type = (entry) =>
  extractClassic.type(entry) ?? extractAttr.type(entry) ?? extractField.type(entry);

/** @type {PatternExtractor<string[]>} */
exports.topics = (entry) =>
  extractClassic.topics(entry) ?? extractAttr.topics(entry) ?? extractField.topics(entry);

/** @type {PatternExtractor<AnyKeywordDef[]>} */
exports.keywords = (entry) =>
  extractClassic.keywords(entry) ?? extractAttr.keywords(entry) ?? extractField.keywords(entry);

/** @type {PatternExtractor<AnyRelationDef[]>} */
exports.relations = (entry) =>
  extractClassic.relations(entry) ?? extractAttr.relations(entry) ?? extractField.relations(entry);