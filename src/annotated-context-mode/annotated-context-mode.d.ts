interface AnnotatedEntry {
  text: string;
  priority: number | null;
  score: number;
  keys?: Set<string>;
  relations?: AnyRelationDef[];
}