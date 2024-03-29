interface ContextModeModule {
  name: string;
  input?: BundledModifierFn;
  context?: BundledModifierFn;
  output?: BundledModifierFn;
}

namespace ContextData {
  interface GeneralData extends StateEngineData, CacheData.GeneralCacheData {
    /** The entry's text. */
    text: string;
    /** The entry's topics. */
    topics: Set<string>;
  }

  interface HistoryData extends StateEngineData, CacheData.HistoryCacheData {
    /** The entry's text. */
    text: string;
    /** The entry's topics. */
    topics: Set<string>;
  }
}

type ContextData = ContextData.HistoryData | ContextData.GeneralData;

interface HistoryData {
  /**
   * A map from an entry's original offset to its original entry.
   * Will contain more than one entry when multiple entries were combined.
   */
  sources: Map<number, HistoryEntry>;
  /** The emitted offset for this entry.  Use this for sorting purposes. */
  offset: number;
  /**
   * How many characters make up this entry and all entries that came later than it.
   * Since we're having to do space management, I figured I'd just precalculate this.
   */
  lengthToHere: number;
  /**
   * The type of history entry; if two different types were merged,
   * it will be `"combined"`.
   */
  type: HistoryEntry["type"] | "combined";
  /** The text for this entry. */
  text: string;
}

declare interface GameState {
  /** The currently set context-mode, which affects how the context is constructed. */
  $$contextMode?: string;
}