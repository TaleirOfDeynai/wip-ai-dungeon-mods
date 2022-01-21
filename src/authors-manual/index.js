/// <reference path="./authors-manual.d.ts" />
const { SimpleCommand } = require("../commands");

/**
 * Authors-Manual
 * 
 * A work-around for a problem AI Dungeon had, where the "Pin" menu's
 * Author's Note field would not actually do anything.
 * 
 * Provides a backup command for setting the author's note, instead.
 * This can also be used to manipulate a programmatically set note,
 * such as one set by the `$Direction` entry of State-Engine.
 */

exports.commands = [
  new SimpleCommand("set-authors-note", (data, args) => {
    const newNote = args.join(" ");
    if (!newNote) {
      delete data.state.memory.authorsNote;
      data.state.$$setAuthorsNote = false;
      return "Removed the author's note.";
    }
    else {
      data.state.memory.authorsNote = newNote;
      data.state.$$setAuthorsNote = true;
      return `Author's note set to: ${newNote}`;
    }
  })
];

/**
 * Creates and adds this plugin to an AID-Bundler `Pipeline`.
 * 
 * @param {import("aid-bundler").Pipeline} pipeline
 */
exports.addPlugin = (pipeline) => {
  for (const cmd of exports.commands)
    pipeline.commandHandler.addCommand(cmd);
};