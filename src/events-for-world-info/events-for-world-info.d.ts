/// <reference path="../global.d.ts" />
type AIDData = import("aid-bundler/src/aidData").AIDData;

declare namespace EventsForWorldInfo {
  interface AddedEventArg {
    /** The added entry. */
    entry: WorldInfoEntry;
    /** The current hash of the entry object. */
    currentHash: string;
  }

  interface UpdatedEventArg {
    /** The updated entry. */
    entry: WorldInfoEntry;
    /** The current hash of the entry object. */
    currentHash: string;
    /** The previous hash of the entry object. */
    previousHash: string;
  }

  interface RemovedEventArg {
    /** The ID of the entry that was removed. */
    id: WorldInfoEntry["id"];
    /** The last known hash of the entry object. */
    previousHash: string;
  }
}


declare interface GameState {
  /**
   * Stores state for the Events for World-Info plugin.
   * 
   * This is just a mapping from {@link WorldInfoEntry.id} to its hash.
   */
  $$eventsForWorldInfo?: Record<string, string | undefined>;
}