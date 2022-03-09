const Deferred = require("../../utils/Deferred");
const { dew, is } = require("../../utils");
const pSeparators = require("./parts/separators");
const pEntryTypes = require("./parts/entryTypes");
const pKeywords = require("./parts/keywords");
const pTopic = require("./parts/topics");
const { ATTRS } = require("./checks");
const { ParsingError } = require("./errors");

// This is the extractor for entries using `WorldInfoEntry.attributes`.

const topicList = pTopic.topic.sepBy(pSeparators.comma);

exports.type = dew(() => {
  /** @type {PatternExtractor<AnyEntryTypeDef>} */
  const impl = (entry) => {
    const seType = entry?.attributes?.[ATTRS.TYPE];
    if (!is.string(seType) || !seType) return undefined;
    if (!seType.trim()) return undefined;
  
    const result = pEntryTypes.typeAttr.parse(seType);
    if (result.status) return result.value;
    throw new ParsingError(entry, "Entry Type", ["attributes", ATTRS.TYPE], seType, result);
  };

  return Deferred.memoizeLazily(impl);
});

exports.topics = dew(() => {
  /** @type {PatternExtractor<string[]>} */
  const impl = (entry) => {
    const seTopics = entry?.attributes?.[ATTRS.TOPICS];
    if (!is.string(seTopics) || !seTopics) return undefined;
    if (!seTopics.trim()) return [];

    const result = topicList.parse(seTopics);
    if (result.status) return result.value;
    throw new ParsingError(entry, "List of Topics", ["attributes", ATTRS.TOPICS], seTopics, result);
  };

  return Deferred.memoizeLazily(impl);
});

exports.keywords = dew(() => {
  /** @type {PatternExtractor<AnyKeywordDef[]>} */
  const impl = (entry) => {
    const seKeywords = entry?.attributes?.[ATTRS.KEYWORDS];
    if (!is.string(seKeywords) || !seKeywords) return undefined;
    if (!seKeywords.trim()) return [];
  
    const result = pKeywords.comma.sequence.parse(seKeywords);
    if (result.status) return result.value;
    throw new ParsingError(entry, "List of Keywords", ["attributes", ATTRS.KEYWORDS], seKeywords, result);
  };

  return Deferred.memoizeLazily(impl);
})

exports.relations = dew(() => {
  /** @type {PatternExtractor<AnyRelationDef[]>} */
  const impl = (entry) => {
    const seRelations = entry?.attributes?.[ATTRS.RELATIONS];
    if (!is.string(seRelations) || !seRelations) return undefined;
    if (!seRelations.trim()) return [];

    const result = pTopic.commaRelations.parse(seRelations);
    if (result.status) return result.value;
    throw new ParsingError(entry, "List of Relations", ["attributes", ATTRS.RELATIONS], seRelations, result);
  };

  return Deferred.memoizeLazily(impl);
});