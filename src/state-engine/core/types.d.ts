/// <reference path="../state-engine.d.ts" />

export interface GetAssociationsForFn {
  (ctx: Context, source: AssociationSources, create: true): EntryToAssociationMap;
  (ctx: Context, source: AssociationSources, create?: false): Maybe<EntryToAssociationMap>;
}