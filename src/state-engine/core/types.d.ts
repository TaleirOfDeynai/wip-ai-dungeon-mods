/// <reference path="../state-engine.d.ts" />

export interface GetAssociationSet {
  (ctx: Context, source: AssociationSources, create: true): Set<StateEngineEntry["entryId"]>;
  (ctx: Context, source: AssociationSources, create?: false): Maybe<Set<StateEngineEntry["entryId"]>>;
}