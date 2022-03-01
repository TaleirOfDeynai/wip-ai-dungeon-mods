const { Pipeline } = require("aid-bundler");
const { SimpleCommand } = require("./commands");
const { shutUpTS } = require("./utils");
const actionIdent = require("./action-ident");
const eventsForActions = require("./events-for-actions");
const eventsForWorldInfo = require("./events-for-world-info");
const authorsManual = require("./authors-manual");
const configCommander = require("./config-commander");
const stateEngine = require("./state-engine");
const contextMode = require("./context-mode");
const perLineIterator = require("./state-engine/iterators/perLine");

const pipeline = new Pipeline();

// Reports the serialized structure and own-property keys of a value of the global
// object.  Used in API discovery.
pipeline.commandHandler.addCommand(new SimpleCommand(
  "report-global",
  (data, [name]) => {
    if (name in globalThis) {
      // @ts-ignore - We checked, dammit!
      const target = globalThis[name];
      
      // Dump the structure.
      console.log(target);
      // And the names of any own-properties it may have.
      // I wanna make sure they're not just attaching new methods to existing objects.
      console.log(Object.keys(target));
      return `Global variable \`${name}\` dumped to logs.`;
    }
    return `The global variable \`${name}\` did not exist.`
  })
);

// Reports a list of all own-properties of the global object.  Used in API discovery.
pipeline.commandHandler.addCommand(new SimpleCommand(
  "report-global-vars",
  (data, [arg]) => {
    if (arg !== "deep") {
      console.log(Object.keys(globalThis));
      return "Own-properties of the global object dumped to logs.";
    }
    
    let curRef = globalThis;
    const allProps = [];
    while(curRef != null) {
      allProps.push(...Object.keys(curRef));
      curRef = Object.getPrototypeOf(curRef);
    }

    console.log([...new Set(allProps)]);
    return "All properties of the global object dumped to logs.";
  })
);

// Reports the identity of a value of a global property.
// Provide a property path to inspect, separating the property keys with spaces.
// To get: `history[20].entry`
// Use the command: `/report-prop history 20 entry`.
pipeline.commandHandler.addCommand(new SimpleCommand(
  "report-prop",
  (data, args) => {
    if (args.length === 0) return "No property path provided.";
    /** @type {string[]} */
    const traveledPath = [];
    /** @type {unknown} */
    let currentRef = globalThis;
    for (const key of args) {
      // @ts-ignore - We're doing checked object exploration.
      currentRef = currentRef[key];
      const typeOfRef = typeof currentRef;
      // Decorate the key based on certain object types.
      const descriptiveKey
        = typeOfRef === "function" ? `${key}(?)`
        : Array.isArray(currentRef) ? `${key}[?]`
        : key;
      traveledPath.push(descriptiveKey);

      if (typeOfRef === "function") {
        /** @type {Function} */
        const currentFn = shutUpTS(currentRef);
        const fnBody = currentFn.toString();
        if (!currentFn.name) return `${traveledPath.join(".")} is a function:\n\n${fnBody}`;
        return `${traveledPath.join(".")} is a function named \`${currentFn.name}\`:\n\n${fnBody}`;
      }

      if (typeOfRef === "undefined") return `${traveledPath.join(".")} is \`undefined\``;
      if (typeOfRef === "string") return `${traveledPath.join(".")} is a string:\n${String(currentRef)}`;
      if (typeOfRef !== "object") return `${traveledPath.join(".")} is \`${String(currentRef)}\``;
      if (currentRef === null) return `${traveledPath.join(".")} is \`null\``;
    }

    console.log(currentRef);
    return `${traveledPath.join(".")} was logged to console.`;
  })
);

// Dumps the available history as a message.
pipeline.commandHandler.addCommand(new SimpleCommand(
  "dump-history",
  (data) => {
    const texts = data.history.map((entry) => entry.text);
    return JSON.stringify(texts, undefined, 2);
  })
);

actionIdent.addPlugin(pipeline);

eventsForActions.addPlugin(pipeline);

eventsForWorldInfo.addPlugin(pipeline);

authorsManual.addPlugin(pipeline);

configCommander.addPlugin(pipeline);

stateEngine.addPlugin(pipeline, {
  historyIterator: perLineIterator,
  modules: [
    require("./deep-state").stateModule,
    require("./director").stateModule
  ]
});

contextMode.addPlugin(pipeline, {
  modules: [
    require("./annotated-context-mode").contextModeModule,
    require("./common-context-modes").forwardModule,
    require("./common-context-modes").narratorModule
  ]
});

pipeline.build();