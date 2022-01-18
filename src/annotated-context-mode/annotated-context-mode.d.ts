interface AnnotatedEntry {
  text: string;
  priority: number | null;
  score: number;
  topics?: Set<string>;
  relations?: AnyRelationDef[];
}