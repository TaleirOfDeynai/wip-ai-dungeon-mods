declare interface GameState {
  /**
   * If the `set-authors-note` command was used to set a note, this will be `true`.
   * 
   * Since AI Dungeon's script API currently does not provide access to the note
   * that can be set in the "Pin" menu, this command is the next best thing, but
   * certain scripts may not want to overwrite the player's manual settings.
   */
  $$setAuthorsNote?: boolean;
}