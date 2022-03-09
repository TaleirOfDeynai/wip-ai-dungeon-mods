const { shutUpTS, tuple, memoize } = require(".");

const $$executor = Symbol("Deferred.executor");
const $$result = Symbol("Deferred.result");
const $$error = Symbol("Deferred.error");
const WAITING = Symbol("Deferred:WAITING");

/**
 * Represents a value that will be calculated in the future when it is called upon using
 * {@link Deferred.result}.
 * 
 * AI Dungeon does not really support any kind of `async` or `await`, as all modifiers
 * are called synchronously.  However, it is often a good idea to be lazy, especially
 * when the work could be costly.  If the work isn't actually needed, don't bother!
 * 
 * Fortunately, deferring work can still be done and executed within a single Node event
 * loop; no `async` or `await` needed.
 * 
 * @template T
 */
class Deferred {
  /**
   * @param {(() => T) | null} executorFn
   * The function that encapsulates the work to be performed at some later time.
   * Pass `null` when passing `resolvedValue`.
   * @param {typeof WAITING | T} [resolvedValue]
   * When simply wrapping a value in the deferred interface, this is the value.
   */
  constructor(executorFn, resolvedValue) {
    this[$$executor] = executorFn;

    // This is a bit tricky; `undefined` is valid for `resolvedValue`.
    // If we declared the parameter as `resolvedValue = WAITING` with a default,
    // it would apply that to both arity 1 and 2 of the constructor.  We only
    // want to use the default of `WAITING` for arity 1, so we check.  If we have
    // arity 2, then any `undefined` would have been passed explicitly and is
    // the intended resolved value.
    /** @type {typeof WAITING | T} */
    this[$$result] = shutUpTS(arguments.length === 1 ? WAITING : resolvedValue);

    /** @type {unknown} If `executorFn` throws an error, this is the error. */
    this[$$error] = undefined;
  }

  /**
   * A builder function, creating a new instance of {@link Deferred}.
   * 
   * @template TResult
   * @param {() => TResult} executorFn
   * The function that encapsulates the work to be performed at some later time.
   * @returns {Deferred<TResult>}
   */
  static defer(executorFn) {
    return new Deferred(executorFn);
  }

  /**
   * A builder function, creating a pre-resolved instance of {@link Deferred}.
   * 
   * @template TResult
   * @param {TResult} value 
   * @returns {Deferred<TResult>}
   */
  static wrap(value) {
    return new Deferred(null, value);
  }

  /**
   * Memoizes a pure function that takes a single argument, deferring the application
   * of the wrapped function until the result is needed.
   * 
   * @template {(arg: any) => any} TFn
   * @param {TFn} fn
   * @returns {(...arg: Parameters<TFn>) => Deferred<Executed<ReturnType<TFn>>>}
   */
  static memoizeLazily(fn) {
    // Pass it through `resolve` just in case `fn` spits out a `Deferred`.
    return memoize((arg) => Deferred.defer(() => Deferred.resolve(fn(arg))));
  }

  /**
   * If you have a value that may or may not be deferred, this function will sort it out
   * and return a concrete value.
   * 
   * @template {MaybeDeferred<any>} T
   * @param {T} maybeDeferred 
   * @returns {Executed<T>}
   */
  static resolve(maybeDeferred) {
    if (maybeDeferred instanceof Deferred) return maybeDeferred.result;
    // @ts-ignore - Stupid TS.
    return maybeDeferred;
  }

  /**
   * Applies a joined transformation with multiple {@link Deferred}, deferring the work
   * until the {@link Deferred.result result} is called upon.  The given instances will
   * not be resolved until then.
   * 
   * @template {ReadonlyArray<any>} TIn
   * @template TOut
   * @param {JoinMapArgs<TIn, TOut>} args
   * @returns {Deferred<TOut>}
   */
  static joinMap(...args) {
    /** @type {any[]} */
    const deferredInputs = shutUpTS(args.slice(0, -1));
    /** @type {(...args: any) => any} */
    const xformFn = shutUpTS(args[args.length - 1]);
    return new Deferred(() => xformFn(...deferredInputs.map(Deferred.resolve)));
  }

  /**
   * Combines multiple {@link Deferred} into a single instance that will result in a tuple
   * of the given instances.
   * 
   * @template {ReadonlyArray<any>} TIn
   * @param {TIn} deferredInputs
   * The instances to resolve together.
   * @returns {Deferred<JoinExecuted<TIn>>}
   */
  static join(...deferredInputs) {
    // @ts-ignore - A little too hard for TypeScript.
    return Deferred.joinMap(...deferredInputs, tuple);
  }

  /**
   * Gets the result, executing the deferred work if needed.
   * 
   * @type {T}
   */
  get result() {
    return this.exec();
  }

  /**
   * Executes the deferred executor, if needed, and returns the result.
   * 
   * The executor is only invoked once and multiple calls to this method will return
   * the same value/reference.
   * 
   * @returns {T}
   */
  exec() {
    const result = this[$$result];
    if (result !== WAITING) return result;

    // If an earlier `exec` threw, let's rethrow it.
    const error = this[$$error];
    if (error) throw error;

    const executorFn = this[$$executor];
    if (executorFn) {
      try {
        // Clear this so it can be GC'd.  It is also our marker for an execution in progress.
        this[$$executor] = null;
        return this[$$result] = executorFn();
      }
      catch (error) {
        // In case `exec` is called a second time, store the error so we can rethrow it.
        // The only down-side is the stack might be a bit ...odd.
        this[$$error] = error;
        throw error;
      }
    }

    throw new Error([
      "Circular deferred execution detected",
      "this instance is already executing but has not yet produced a value."
    ].join("; "));
  }

  /**
   * Applies a transformation on this deferred value, returning a new {@link Deferred} instance
   * that will defer the work until its {@link Deferred.result result} is called upon.
   * This instance will not be resolved until then.
   * 
   * @template U
   * @param {(value: T) => U} xformFn
   * The transformation function to eventually apply to the resolved value.
   * @returns {Deferred<U>}
   */
  map(xformFn) {
    return new Deferred(() => xformFn(this.exec()));
  }
}

module.exports = Deferred;

/**
 * @template T
 * @typedef {Deferred<T> | T} MaybeDeferred
 */

/**
 * @template T
 * @typedef {T extends Deferred<infer U> ? U : T} Executed
 */

/**
 * @template {ReadonlyArray<any>} T
 * @typedef {{
 *   [K in keyof T]: Executed<T[K]>;
 * }} JoinExecuted
 */

/**
 * The signature of {@link Deferred.joinMap joinMap} is possible in JavaScript,
 * but only vaguely representable by TypeScript because of short-sighted language
 * design.
 * 
 * Both TypeScript and JavaScript carry blame here, as rest parameter should be
 * possible anywhere in the arguments list, as long as there is only one.
 * 
 * @template {ReadonlyArray<any>} TIn
 * @template TOut
 * @typedef {[
 *   ...deferredInputs: TIn,
 *   xformFn: (...args: JoinExecuted<TIn>) => TOut
 * ]} JoinMapArgs
 */