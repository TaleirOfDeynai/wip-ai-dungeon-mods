type Deferred<T> = import("../utils/Deferred")<T>;
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
  discoverEntries: (typeof import("./StateEngineEntry").StateEngineEntry)["discoverEntries"];
  produceEntries: (typeof import("./StateEngineEntry").StateEngineEntry)["produceEntries"];
}

interface PatternExtractor<T> {
  (entry: Maybe<WorldInfoEntry>): T | undefined;
}

interface DeferredExtractor<T> {
  (entry: Maybe<WorldInfoEntry>): Deferred<T | undefined>;
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
 * Represents the potential data for a State-Engine entry.  This is all tentative
 * and deferred; the entry may not actually materialize, as parsing the entry only
 * occurs when demanded.
 */
interface StateEnginePotential {
  /**
   * The ID that will be given to this entry.
   */
  entryId: string;

  /**
   * A reference to the {@link StateEngineEntry} constructor that emitted this object.
   * Untyped as a matter of convenience for the type-system.
   */
  entryClass: unknown;

  /**
   * The deferred type of this entry.
   */
  type: Deferred<AnyEntryTypeDef>;

  /**
   * A deferred list of user-given identifiers.  Will be empty if it was not given one
   * or is otherwise not applicable to the `type`.  The first element is typically
   * treated like a name for the instance.
   */
  topics: Deferred<string[]>;

  /**
   * A deferred array of relation configuration objects.
   */
  relations: Deferred<AnyRelationDef[]>;

  /**
   * A deferred array of keyword configuration objects.
   */
  keywords: Deferred<AnyKeywordDef[]>;

  /**
   * If it's possible to predict the text of the entry, this will be that.
   */
  text: Deferred<string | undefined>;

  /**
   * The deferred {@link StateEngineEntry} instance.
   */
  entry: Deferred<StateEngineEntry>;
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
   * The per-entry state object, only persisted if it was not empty.
   */
  state?: Record<string, string | number | boolean>;
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
}

interface StateDataForModifier extends StateEngineData {
  topics: Set<string>;
}

interface HistoryFragment {
  /**
   * The offset of the source entry, from the latest entry, from which the
   * text should be drawn from.
   */
  readonly source: number;

  /**
   * The character offset from the start/end of entry's text defining a boundary
   * of the fragment.
   */
  readonly offset: number;
}

interface HistorySources {
  /**
   * A map from an entry's original offset to its original entry.
   * Will contain more than one entry when multiple entries were combined.
   */
  readonly entries: Map<number, HistoryEntry>;

  /** A set of types that collectively make up the result. */
  readonly types: Set<HistoryEntry["type"]>;

  /**
   * The location beginning the text fragment.  `offset` is relative to the
   * beginning of the `HistoryEntry["text"]` string.
   */
  readonly start: HistoryFragment;

  /**
   * The location closing the text fragment.  `offset` is relative to the
   * end of the `HistoryEntry["text"]` string.
   */
  readonly end: HistoryFragment;
}

interface HistoryIteratorResult {
  /** An object containing information on the origins of this result. */
  readonly sources: HistorySources;

  /** The emitted offset for this entry.  Use this for sorting purposes. */
  readonly offset: number;

  /**
   * The type of history entry.  This could be `HistoryEntry["type"]` but is
   * left open in case things get more complicated.
   */
  readonly type: string;

  /** The text for this entry. */
  readonly text: string;

  /** A string for user reporting to help them understand where this text came from. */
  readonly desc: string;
}

/**
 * A function that iterates on the history and provides results suited for
 * {@link Context.workingHistory}.
 */
type HistoryIteratorFn = (history: Iterable<HistoryEntry>) => Iterable<HistoryIteratorResult>;

namespace AssociationData {
  interface Base {
    /** The entry. */
    entry: StateEngineEntry;
  }

  interface HistoryAssociationData extends Base {
    /** A string indicating the source of the association's text. */
    source: number;
    /** A description of how the history entry was associated; for user reports. */
    desc: HistoryIteratorResult["desc"];
    /** The start of the text fragment. */
    start: HistorySources["start"];
    /** The end of the text fragment. */
    end: HistorySources["end"];
  }

  interface GeneralAssociationData extends Base {
    /** A string indicating the source of the association's text. */
    source: Exclude<AssociationSources, number>;
  }
}

type AssociationData = AssociationData.HistoryAssociationData | AssociationData.GeneralAssociationData;

type EntryToAssociationMap = Map<StateEngineEntry["entryId"], AssociationData>;
type StateAssociations = Map<AssociationSources, EntryToAssociationMap>;

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

namespace CacheData {
  interface Base {
    /** ID of the entry that was associated with the text. */
    entryId: StateEngineData["entryId"];
    /** The association score that won it the association. */
    score: number;
    /** The insertion priority of the associated entry; influences ordering. */
    priority: number | null;
  }

  interface HistoryCacheData extends Base {
    /** A string indicating the source of the association's text. */
    source: "history";
    /** A description of how the history entry was associated; for user reports. */
    desc: HistoryIteratorResult["desc"];
    /** The start of the text fragment. */
    start: HistorySources["start"];
    /** The end of the text fragment. */
    end: HistorySources["end"];
  }

  interface GeneralCacheData extends Base {
    /** A string indicating the source of the association's text. */
    source: Exclude<AssociationSources, "history">;
  }
}

type StateEngineCacheData = CacheData.HistoryCacheData | CacheData.GeneralCacheData;

interface StateDataCache {
  /** The phase this cache was recorded for. */
  phase: AIDData["phase"];
  /** Entries for `state.memory.context` injection. */
  forContextMemory: CacheData.GeneralCacheData[];
  /** An entry for `state.memory.frontMemory` injection. */
  forFrontMemory: CacheData.GeneralCacheData | null;
  /** An entry for `state.memory.authorsNote` injection. */
  forAuthorsNote: CacheData.GeneralCacheData | null;
  /**
   * Entries associated with `history` entries.  Check `start.source` and `end.source`
   * to determine which history entries its associated with.  These values are offsets
   * from the end of the `history` array.
   */
  forHistory: CacheData.HistoryCacheData[];
};

type ValuationStats = { matched: number, bonus: number, scalar: number };

/** A generic interface for sortable things. */
interface SortableEntry {
  text?: string;
  topics?: Set<string>;
  relations?: StateEngineData["relations"];
  priority?: CacheData.Base["priority"];
  score?: CacheData.Base["score"];
}

/** An interface describing the sorting position of an entry. */
interface WithOrdering {
  order: number;
}

interface Context {
  config: import("./config").StateEngineConfig;
  matchCounter: (str: string, regex: RegExp) => number;
  theCache: import("../turn-cache").WriteCache<StateDataCache>;
  entriesMap: Map<string, StateEngineEntry>;
  validationIssues: Map<string, string[]>;
  sortedStateMatchers: import("./MatchableEntry").MatchableEntry[];
  workingHistory: Map<number, HistoryIteratorResult>;
  stateAssociations: StateAssociations;
  scoresMap: ScoresMap;
}

declare interface GameState {
  $$stateEngineVersion?: number;
  /**
   * A cache of pre-processed `StateEngineData` entries.
   */
  $$stateDataCache?: Record<StateEngineData["entryId"], StateEngineData & Record<string, unknown>>;
}

declare module "aid-bundler/src/aidData" {
  interface AIDData {
    stateEngineApi: import("./api");
    stateEngineContext: Context;
    historyIterator: HistoryIteratorFn;
  }
}