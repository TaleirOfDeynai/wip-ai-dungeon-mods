const p = require("parsimmon");
const { RELATION_MODIFIERS: { ALL_OF, AT_LEAST_ONE, IMMEDIATE, NEGATED } } = require("../checks");
const sep = require("./separators");

/** @type {p.Parser<RelationTypes>} */
const relationType = p.alt(
  p.string(":").result(ALL_OF),
  p.string("?").result(AT_LEAST_ONE),
  p.string("@").result(IMMEDIATE),
  p.string("!").result(NEGATED)
);

exports.relationType = relationType
  .desc("a relation type (:?@!)")
  .notFollowedBy(p.whitespace);

/** @type {p.Parser<RelationTypes>} */
exports.optRelationType = relationType.fallback(ALL_OF);

exports.topic = p.regex(/[\w\d ]+/)
  .map((s) => s.trim())
  .desc("a topic tag (letters, numbers, and spaces)");

/** @type {p.Parser<AnyRelationDef>} */
exports.relation = p.seqMap(
  exports.relationType,
  exports.topic,
  (type, topic) => ({ type, topic })
);

exports.semiRelations = p.sepBy(exports.relation.trim(sep.ws), sep.semi.or(sep.newline));

exports.commaRelations = p.sepBy(exports.relation.trim(sep.ws), sep.comma.or(sep.newline));