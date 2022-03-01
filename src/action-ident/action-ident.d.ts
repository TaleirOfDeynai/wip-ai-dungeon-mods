/// <reference path="../global.d.ts" />
type AIDData = import("aid-bundler/src/aidData").AIDData;

declare namespace ActionIdent {
  /**
   * Converts an index of {@link AIDData.history} into an absolute turn number.
   * 
   * Returns `undefined` if `index` is outside of the possible range, based on
   * the current state of the story.
   */
  interface HistoryToTurnMapper {
    (
      /** The {@link AIDData.history} index to convert.  May be a negative index. */
      index: number
    ): number | undefined;
  }

  /**
   * Converts an absolute turn number into a value that addresses an element
   * of {@link AIDData.history}.
   * 
   * Returns `undefined` if `turn` cannot be mapped to an existing element of
   * {@link AIDData.history}.  This would indicate that the entry is not currently
   * accessible.
   */
  interface TurnToHistoryMapper {
    (
      /** The absolute turn number to convert. */
      turn: number
    ): number | undefined;
  }

  interface PluginState {
    /**
     * Records {@link GameInfo.actionCount} whenever an input phase begins.  This is
     * used to determine if an offset needs to be applied in that turn's context and
     * output phases to account for the new entry added to {@link AIDData.history}
     * from the input phase.
     */
    turnOfLastInputPhase?: number;
  }
}

declare interface GameState {
  /**
   * Stores state for the Action-Ident plugin.
   */
  $$actionIdent?: ActionIdent.PluginState;
}