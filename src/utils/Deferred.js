/// <reference path="./utils.d.ts" />
const { AggregateError, wrapAsError } = require("./errors");
const { shutUpTS, is, tuple, memoize } = require(".");

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

    /** @type {Error | undefined} If `executorFn` throws an error, this is the error. */
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
   * If it was deferred and an error occurred while executing, that error will be thrown.
   * 
   * @template {MaybeDeferred<any>} T
   * @param {T} maybeDeferred 
   * @returns {Executed<T>}
   */
  static resolve(maybeDeferred) {
    if (maybeDeferred instanceof Deferred) {
      const result = maybeDeferred.result;
      if (is.error(result)) throw result;
      return result;
    }
    // @ts-ignore - Stupid TS.
    return maybeDeferred;
  }

  /**
   * If you have a value that may or may not be deferred, this function will sort it out
   * and return a concrete value or an error, if the value was deferred and execution
   * resulted in an error. 
   * 
   * @template {MaybeDeferred<any>} T
   * @param {T} maybeDeferred 
   * @returns {Trial<Executed<T>>}
   */
  static tryResolve(maybeDeferred) {
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
    return new Deferred(() => {
      const results = deferredInputs.map(Deferred.tryResolve);
      if (!results.some(is.error)) return xformFn(results);

      // Report the errors in aggregate.
      throw new AggregateError(
        "One or more deferred values in a joined transformation threw an error.",
        results.filter(is.error)
      );
    });
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
   * Gets the result, executing the deferred work if needed.  If an error occurs, it
   * will be returned directly as the result.
   * 
   * @type {Trial<T>}
   */
  get result() {
    return this.exec();
  }

  /**
   * Executes the deferred executor, if needed, and returns the result.  If an error
   * occurs during execution, it will be provided as the result.
   * 
   * The executor is only invoked once and multiple calls to this method will return
   * the same value/reference.
   * 
   * An error is thrown if the execution becomes circular; that is if the value is
   * currently executing and has not yet been resolved and a request is made to get
   * the value again, then calculating the value requires calculating the value, and
   * that is not resolvable.
   * 
   * @returns {Trial<T>}
   */
  exec() {
    const result = this[$$result];
    if (result !== WAITING) return result;

    // If an earlier `exec` threw, let's return it.
    const error = this[$$error];
    if (error) return error;

    const executorFn = this[$$executor];
    if (executorFn) {
      try {
        // Clear this so it can be GC'd.  It is also our marker for an execution in progress.
        this[$$executor] = null;
        return this[$$result] = executorFn();
      }
      catch (error) {
        const safeError = wrapAsError(error);
        // In case `exec` is called a second time, store the error so we can rethrow it.
        // The only down-side is the stack might be a bit ...odd.
        return this[$$error] = safeError;
      }
    }

    // This is essentially fatal, and so needs to be thrown.
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
   * Unlike {@link Deferred.tryMap tryMap}, this will unpack the {@link Trial} for `xformFn`.
   * 
   * @template U
   * @param {(value: T) => U} xformFn
   * The transformation function to eventually apply to the resolved value.
   * @returns {Deferred<U>}
   */
  map(xformFn) {
    return new Deferred(() => {
      const result = this.exec();
      if (is.error(result)) throw result;
      return xformFn(result);
    });
  }

  /**
   * Applies a transformation on this deferred value, returning a new {@link Deferred} instance
   * that will defer the work until its {@link Deferred.result result} is called upon.
   * This instance will not be resolved until then.
   * 
   * Unlike {@link Deferred.map map}, this will not unpack the {@link Trial} for `xformFn`.
   * 
   * @template U
   * @param {(result: Trial<T>) => Trial<U>} xformFn
   * @returns {Deferred<U>}
   */
  tryMap(xformFn) {
    return new Deferred(() => {
      // Execute the previous value.
      const result = this.exec();
      if (is.error(result)) throw result;
      // Execute the current value.
      const next = xformFn(result);
      if (is.error(next)) throw next;
      // Successfully executed.
      return next;
    });
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