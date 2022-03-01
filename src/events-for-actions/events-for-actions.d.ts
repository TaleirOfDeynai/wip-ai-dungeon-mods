/// <reference path="../global.d.ts" />
type AIDData = import("aid-bundler/src/aidData").AIDData;

declare namespace EventsForActions {
  interface AddedEventArg {
    /** The absolute turn number of the entry.  This won't change run-to-run. */
    turn: number;
    /** The index of the entry in the {@link AIDData.history} array. */
    index: number;
    /** The added entry. */
    entry: HistoryEntry;
    /** The current hash of the entry object. */
    currentHash: string;
  }

  interface UpdatedEventArg {
    /** The absolute turn number of the entry.  This won't change run-to-run. */
    turn: number;
    /** The index of the entry in the {@link AIDData.history} array. */
    index: number;
    /** The updated entry. */
    entry: HistoryEntry;
    /** The current hash of the entry object. */
    currentHash: string;
    /** The previous hash of the entry object. */
    previousHash: string;
  }

  interface RemovedEventArg {
    /** The absolute turn number of the entry.  This won't change run-to-run. */
    turn: number;
    /** The last known hash of the entry object. */
    previousHash: string;
  }
}


declare interface GameState {
  /**
   * Stores state for the Events for Actions plugin.
   * 
   * This is just a mapping from an action's turn to its hash.
   */
  $$eventsForActions?: Record<number, string | undefined>;
}