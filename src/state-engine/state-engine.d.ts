type MatchableEntry = import("./MatchableEntry").MatchableEntry;
type StateEngineEntry = import("./StateEngineEntry").StateEngineEntry;

interface StateModule {
  pre?: BundledModifierFn[];
  exec?: BundledModifierFn[];
  post?: BundledModifierFn[];
}

interface StateEngineEntryClass {
  new (...args: any[]): StateEngineEntry;
  forType: (typeof import("./StateEngineEntry").StateEngineEntry)["forType"];
  produceEntries: (typeof import("./StateEngineEntry").StateEngineEntry)["produceEntries"];
}

interface PatternExtractor<T> {
  (entry: Maybe<WorldInfoEntry>): T | undefined;
}

interface PatternMatcher<T> {
  (text: Maybe<string>): T | undefined;
}

/**
 * Indicates how an entry type was extracted.
 * - `"vanilla"` - One of the built-in AI Dungeon entry types, IE: `"worldDescription"` or `"race"`.
 * - `"state-engine"` - A type that was parsed in a State-Engine format or from the `$type` attribute.
 * - `"unknown"` - An unknown type in an unknown format.
 */
type EntryTypes = "vanilla" | "state-engine" | "unknown";
interface EntryTypeDef<TType extends EntryTypes> {
  type: TType;
  value: string;
}

type KeywordTypes = "include" | "exclude";
interface KeywordDef<TType extends KeywordTypes> {
  type: TType;
  exactMatch: boolean;
  value: string;
}

type RelationTypes = "allOf" | "atLeastOne" | "immediate" | "negated";
interface RelationDef<TType extends RelationTypes> {
  type: TType;
  topic: string;
}

type AnyEntryTypeDef = EntryTypeDef<EntryTypes>;
type AnyKeywordDef = KeywordDef<KeywordTypes>;
type AnyRelationDef = RelationDef<RelationTypes>;
type AnyMatcherDef = AnyKeywordDef | AnyRelationDef;

/**
 * An object that provides `WorldInfoEntry` extraction services.
 */
interface EntryExtractor {
  type: PatternExtractor<AnyEntryTypeDef>;
  topics: PatternExtractor<string[]>;
  keywords: PatternExtractor<AnyKeywordDef[]>;
  relations: PatternExtractor<AnyRelationDef[]>;
}

interface StateEngineData {
  /**
   * The type of this entry.  Common types:
   * - `Player` - For a player's information; high-priority.
   * - `NPC` - For an NPC's information.
   * - `Scene` - For important scene information; high-priority.
   * - `Lore` - For general knowledge of the world.
   * - `State` - For present knowledge of the world and its characters; high-priority.
   */
  type: string;
  /**
   * The ID given to this entry.
   */
  entryId: string;
  /**
   * Optional; provide to store the entry's text.  Especially useful if the entry is
   * dynamic and needs to be recalled across multiple executions or phases.
   */
  text?: string;
  /**
   * A list of user-given identifiers.  Will be empty if it was not given one or is
   * otherwise not applicable to the `type`.  The first element is typically treated
   * like a name for the instance.
   */
  topics: string[];
  /**
   * An array of relation configuration objects.
   */
  relations: AnyRelationDef[];
  /**
   * An array of keyword configuration objects.
   */
  keywords: AnyKeywordDef[];
}

interface WorldInfoHash {
  /** The hash for the full entry, to detect any changes. */
  full: string;
  /** The hash for only the entry's text.  Will be `""` if it had no text. */
  text: string;
}

interface EngineDataForWorldInfo extends StateEngineData {
  /**
   * Indicates that this entry is associated with a world-info entry.
   */
  forWorldInfo: boolean;
  /**
   * The type given to the entry by the scenario designer.
   */
  infoType?: WorldInfoEntry["type"];
  /**
   * The name given to the entry by the scenario designer.
   */
  infoName?: string;
  /**
   * The original `keys` of the `WorldInfoEntry` this data was created from.
   * Can be used to check to see if it requires recalculation.
   */
  infoKey: WorldInfoEntry["keys"];
  /**
   * The hash of the `WorldInfoEntry` used to generate this data.  This allows
   * us to discover changes to entries.
   */
  infoHash?: WorldInfoHash;
}

interface StateDataForModifier extends StateEngineData {
  topics: Set<string>;
}

type StateAssociations = Map<AssociationSources, Set<StateEngineEntry["entryId"]>>;

interface GetAssociationSetFn {
  (source: AssociationSources, create: true): Set<StateEngineEntry["entryId"]>;
  (source: AssociationSources, create?: false): Maybe<Set<StateEngineEntry["entryId"]>>;
}

interface StateValidatorFn {
  (stateData: StateEngineData): string[];
}

interface StateModifierFn {
  (stateData: StateEngineData, allStates: StateEngineData[]): StateEngineData;
}

type UsedTopicsMap = Map<number, Set<string>>;

interface AssociationParamTypes {
  "implicit": { source: "implicit" };
  "implicitRef": { source: "implicitRef", entry: StateEngineEntry };
  "playerMemory": { source: "playerMemory", entry: string };
  "authorsNote": { source: "authorsNote" };
  "frontMemory": { source: "frontMemory" };
  "history": { source: number, entry: HistoryIteratorResult, usedTopics: UsedTopicsMap };
}

type AssociationTargets = keyof AssociationParamTypes;
type AssociationParams = AssociationParamTypes[AssociationTargets];
type AssociationSources = AssociationParams["source"];
// There's no reliable way to make TS generate this automatically.
type FlatAssociationParams = { source: any, entry?: any, usedTopics?: any };

// This should be inlined into `AssociationParamsFor`, but TypeScript's type-system is garbage.
type AssociationParamsFromTargets<TTargets extends Array<AssociationTargets> | null>
  = TTargets extends Array<infer TKey>
    ? TKey extends AssociationTargets ? AssociationParamTypes[TKey]
    : never
  : AssociationParamTypes["implicitRef" | "playerMemory" | "history"];

type AssociationParamsFor<TEntry extends StateEngineEntry>
  = AssociationParamsFromTargets<TEntry["targetSources"]>;

type AssociationSourcesFor<TEntry extends StateEngineEntry>
  = AssociationParamsFor<TEntry>["source"];

type PreRuleIteratorResult = [otherEntry: StateEngineEntry, source: AssociationSources];
type PreRuleIterator = () => Iterable<PreRuleIteratorResult>;
interface PreRuleIterators {
  /** Gets all associations for the given source. */
  getFor(source: AssociationSources): Iterable<PreRuleIteratorResult>;
  /**
   * Gets all History associations before the current source.
   * Will be empty unless the current association is a history source.
   */
  before: PreRuleIterator;
  /** Gets all associations for the current source. */
  current: PreRuleIterator;
  /**
   * Gets all History associations after the current source.
   * Will be empty unless the current association is a history source.
   */
  after: PreRuleIterator;
}

type ScoresMap = Map<AssociationSources, Map<StateEngineEntry["entryId"], number>>;
type PostRuleIteratorResult = [...PreRuleIteratorResult, score: number];
type PostRuleIterator = () => Iterable<PostRuleIteratorResult>;
interface PostRuleIterators {
  /** Gets all associations for the given source. */
  getFor(source: AssociationSources): Iterable<PostRuleIteratorResult>;
  /**
   * Gets all History associations before the current source.
   * Will be empty unless the current association is a history source.
   */
  before: PostRuleIterator;
  /** Gets all associations for the current source. */
  current: PostRuleIterator;
  /**
   * Gets all History associations after the current source.
   * Will be empty unless the current association is a history source.
   */
  after: PostRuleIterator;
  /**
   * Gets the associations that have won the roulette and been selected, thus far.
   * 
   * You will not get selections from sources that have not yet been evaluated, so
   * if history source `2` is being evaluated, you can get the final selections
   * for `0` and `1` only.
   */
  selected: PostRuleIterator;
}

interface StateEngineCacheData {
  entryId: StateEngineData["entryId"];
  score: number;
  priority: number | null;
  source: AssociationSources;
}

interface StateDataCache {
  /** The phase this cache was recorded for. */
  phase: AIDData["phase"];
  /** Entries for `state.memory.context` injection. */
  forContextMemory: StateEngineCacheData[];
  /** An entry for `state.memory.frontMemory` injection. */
  forFrontMemory: StateEngineCacheData | null;
  /** An entry for `state.memory.authorsNote` injection. */
  forAuthorsNote: StateEngineCacheData | null;
  /**
   * Entries associated with `history` entries.
   * - `key` - An offset from the current history entry.
   *   - A value of `0` indicates the current `text`.
   *   - A value like `1` indicates `history[history.length - 1]`.
   * - `value` - A `StateEngineEntry` ID.
   */
  forHistory: Record<number, StateEngineCacheData>;
};

type ValuationStats = { matched: number, bonus: number, scalar: number };

/** A generic interface for sortable things. */
interface SortableEntry {
  text?: string;
  topics?: Set<string>;
  relations?: StateEngineData["relations"];
  priority?: StateEngineCacheData["priority"];
  score?: StateEngineCacheData["score"];
}

/** An interface describing the sorting position of an entry. */
interface WithOrdering {
  order: number;
}

interface Context {
  config: import("./config").StateEngineConfig;
  matchCounter: (str: string, regex: RegExp) => number;
  theCache: import("../turn-cache").WriteCache<StateDataCache>;
  entriesMap: Record<string, StateEngineEntry>;
  validationIssues: Map<string, string[]>;
  sortedStateMatchers: import("./MatchableEntry").MatchableEntry[];
  workingHistory: HistoryIteratorResult[];
  stateAssociations: StateAssociations;
  scoresMap: ScoresMap;
}

interface HistorySources {
  /**
   * A map from an entry's original offset to its original entry.
   * Will contain more than one entry when multiple entries were combined.
   */
  readonly entries: Map<number, HistoryEntry>;

  /** A set of types that collectively make up the result. */
  readonly types: Set<HistoryEntry["type"]>;
}

interface HistoryIteratorResult {
  /** An object containing information on the origins of this result. */
  readonly sources: HistorySources;

  /** The emitted offset for this entry.  Use this for sorting purposes. */
  readonly offset: number;

  /**
   * One offset from the `histories` array that should be used to represent
   * the combined entry.  For instance, if joining paragraphs together,
   * this might be the offset of the original entry that started the paragraph.
   */
  readonly origin: number;

  /**
   * The type of history entry.  This could be `HistoryEntry["type"]` but is
   * left open in case things get more complicated.
   */
  readonly type: string;

  /** The text for this entry. */
  readonly text: string;
}

declare interface GameState {
  /**
   * A cache of pre-processed `StateEngineData` entries.
   */
  $$stateDataCache?: Record<StateEngineData["entryId"], StateEngineData & Record<string, unknown>>;
}

declare module "aid-bundler/src/aidData" {
  interface AIDData {
    stateEngineContext: Context;
  }
}