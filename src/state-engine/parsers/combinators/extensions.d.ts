import Parsimmon from "parsimmon";

declare module "parsimmon" {
  interface Parser<T> {
    _: Parsimmon.ParseFunctionType<T>;
  }
}