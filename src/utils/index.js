/// <reference path="./utils.d.ts" />

/**
 * Validates a basic assertion.  If it fails, an error with `msg` is thrown.
 * 
 * @param {string} msg
 * @param {boolean} check
 * @returns {void}
 */
exports.assert = (msg, check) => {
  if (check) return;
  throw new Error(msg);
};

/**
 * Validates that `value` passes the given type predicate.  If it fails, an error
 * with `msg` is thrown.
 * 
 * @template TValue
 * @param {string} msg
 * @param {TypePredicate<TValue>} checkFn
 * @param {any} value 
 * @returns {TValue}
 */
exports.assertAs = (msg, checkFn, value) => {
  exports.assert(msg, checkFn(value));
  return value;
};

/**
 * IIFE helper.
 * 
 * @template T
 * @param {() => T} fn
 * @returns {T}
 */
exports.dew = (fn) => fn();

/**
 * @param {any} value 
 * @returns {any}
 */
exports.shutUpTS = (value) => value;

/**
 * Identity function.
 * 
 * @template T
 * @param {T} input 
 * @returns {T}
 */
exports.ident = (input) => input;

/**
 * Forces a primitive literal to be a literal value.
 * 
 * @template {readonly [Primitives]} T
 * @param {T} arg 
 * @returns {T[0]}
 */
exports.asConstant = (...arg) => arg[0];

/**
 * Creates a strongly-typed tuple of any size, but supports only simpler
 * primatives: `number`, `string`, `boolean`, functions, and plain objects.
 * 
 * @template {readonly Primitives[]} T
 * @param {T} args
 * @returns {[...T]}
 */
// @ts-ignore - The `readonly` modifier is only used to infer literal types.
exports.tuple = (...args) => args;

/**
 * Creates a strongly-typed two-element tuple.
 * 
 * @template TA, TB
 * @param {TA} a
 * @param {TB} b
 * @returns {[TA, TB]}
 */
exports.tuple2 = (a, b) => [a, b];

/**
 * Creates a strongly-typed three-element tuple.
 * 
 * @template TA, TB, TC
 * @param {TA} a
 * @param {TB} b
 * @param {TC} c
 * @returns {[TA, TB, TC]}
 */
exports.tuple3 = (a, b, c) => [a, b, c];

/** Helpers for type-guards. */
exports.is = {
  /** @type {TypePredicate<Function>} */
  function: (value) => typeof value === "function",
  /** @type {TypePredicate<Object>} */
  object: (value) => value && typeof value === "object",
  /** @type {TypePredicate<any[]>} */
  array: (value) => Array.isArray(value),
  /** @type {TypePredicate<string>} */
  string: (value) => typeof value === "string",
  /** @type {TypePredicate<number>} */
  number: (value) => typeof value === "number",
  /** A bare object that inherits from only `Object` or nothing. */
  pojo: exports.dew(() => {
    const POJO_PROTOS = [Object.prototype, null];
    /** @type {TypePredicate<Object>} */
    const innerFn = (value) => {
      if (!exports.is.object(value)) return false;
      return POJO_PROTOS.includes(Object.getPrototypeOf(value));
    };
    return innerFn;
  })
};

/**
 * Checks that a value is not `null` or `undefined`.
 * 
 * @template T
 * @param {T} value 
 * @returns {value is Exclude<T, null | undefined>}
 */
exports.isInstance = (value) => value != null;

/**
 * Tests if something is iterable.  This will include strings, which indeed,
 * are iterable.
 * 
 * @param {any} value 
 * @returns {value is Iterable<any>}
 */
exports.hasIterator = (value) =>
  value != null && typeof value === "object" && Symbol.iterator in value;

/**
 * Tests the `left` set to see if any values are shared in the `right` set.
 * 
 * Both sets must contain items to be considered "intersecting".
 * 
 * @param {Set<any>} left
 * @param {Set<any>} right
 * @returns {boolean}
 */
exports.setsIntersect = (left, right) => {
  // My gut says that since an empty-set is a sub-set of all sets, those who
  // love maths would say it intersects with every set.  But I don't find that
  // behavior extremely useful...  >.>
  if (left.size === 0 || right.size === 0) return false;
  for (const item of left) if (right.has(item)) return true;
  return false;
};

/**
 * Tests two sets contain the same items, using strict equality.
 * 
 * @param {Set<any>} left
 * @param {Set<any>} right
 * @returns {boolean}
 */
exports.setsEqual = (left, right) => {
  if (left.size !== right.size) return false;
  for (const v of left) if (!right.has(v)) return false;
  return true;
};

/**
 * Tests if `maybeSubset` is a sub-set of `otherSet`.
 * 
 * @param {Set<any>} maybeSubset
 * @param {Set<any>} otherSet
 * @returns {boolean}
 */
exports.setIsSubsetOf = (maybeSubset, otherSet) => {
  if (maybeSubset.size === 0) return true;
  if (otherSet.size === 0) return false;
  for (const item of maybeSubset)
    if (!otherSet.has(item)) return false;
  return true;
};

/**
 * Creates an object from key-value-pairs.
 * 
 * @template {[string | number, any]} KVP
 * @param {Iterable<KVP>} kvps
 * @returns {UnionToIntersection<FromPairsResult<KVP>>}
 */
exports.fromPairs = (kvps) => {
  /** @type {any} Oh, shove off TS. */
  const result = {};
  for (const [k, v] of kvps) result[k] = v;
  return result;
};

/**
 * Creates an iterable that yields the key-value pairs of an object.
 * 
 * @template {string | number} TKey
 * @template TValue
 * @param {Maybe<Record<TKey, TValue>>} obj
 * @returns {Iterable<[TKey, TValue]>} 
 */
exports.toPairs = function*(obj) {
  if (obj == null) return;
  for(const key of Object.keys(obj)) {
    // @ts-ignore - `Object.keys` is too dumb.
    yield exports.tuple2(key, obj[key]);
  }
};

/**
 * Applies a transformation function to the values of an object.
 * 
 * @template {string | number} TKey
 * @template TIn
 * @template TOut
 * @param {Maybe<Record<TKey, TIn>>} obj
 * @param {(value: TIn, key: TKey) => TOut} xformFn
 * @returns {Record<TKey, TOut>} 
 */
exports.mapValues = function(obj, xformFn) {
  /** @type {any} */
  const newObj = {};
  for (const [key, value] of exports.toPairs(obj))
    newObj[key] = xformFn(value, key);

  return newObj;
};

/**
 * Transforms an iterable with the given function, yielding each result.
 * 
 * @template T
 * @template U
 * @param {Iterable<T>} iterable
 * @param {TransformFn<T, Iterable<U>>} transformFn
 * @returns {Iterable<U>}
 */
exports.flatMap = function* (iterable, transformFn) {
  for (const value of iterable) yield* transformFn(value);
};

/**
 * Flattens the given iterable.  If the iterable contains strings, which
 * are themselves iterable, they will be yielded as-is, without flattening them.
 * 
 * @template {Flattenable<any>} T
 * @param {Iterable<T>} iterable
 * @returns {Iterable<Flattenable<T>>}
 */
exports.flatten = function* (iterable) {
  for (const value of iterable) {
    // @ts-ignore - We pass out non-iterables, as they are.
    if (!exports.hasIterator(value)) yield value;
    // @ts-ignore - We don't flatten strings.
    else if (typeof value === "string") yield value;
    // And now, do a flatten.
    else yield* value;
  }
};

/**
 * Iterates over an array, yielding the current index and item.
 * 
 * @template T
 * @param {T[]} arr
 * @returns {Iterable<[number, T]>}
 */
exports.iterArray = function* (arr) {
  for (let i = 0, lim = arr.length; i < lim; i++)
    yield [i, arr[i]];
};

/**
 * Yields iterables with a number representing their position.  For arrays,
 * this is very similar to a for loop, but you don't increment the index
 * yourself.
 * 
 * @template T
 * @param {Iterable<T>} iter
 * @returns {Iterable<[number, T]>}
 */
exports.iterPosition = function* (iter) {
  if (Array.isArray(iter)) {
    yield* exports.iterArray(iter);
  }
  else {
    let i = 0;
    for (const item of iter) yield [i++, item];
  }
};

/**
 * Yields elements of an iterable in reverse order.  You can limit the
 * number of results yielded by providing `count`.
 * 
 * @template T
 * @param {Iterable<T>} arr
 * @param {number} [count]
 * @returns {Iterable<T>}
 */
 exports.iterReverse = function* (arr, count) {
  if (Array.isArray(arr)) {
    // Ensure `count` is between 0 and the number of items in the array.
    count = Math.max(0, Math.min(arr.length, count ?? arr.length));
    const lim = arr.length - count;
    for (let i = arr.length - 1; i >= lim; i--) yield arr[i];
  }
  else {
    // Either way we gotta cache the values so we can reverse them.
    yield* exports.iterReverse([...arr], count);
  }
};

/**
 * Takes up to `count` elements from the beginning of the iterable.
 * 
 * @template T
 * @param {Iterable<T>} iterable
 * @param {number} count
 * @returns {Iterable<T>}
 */
exports.take = function* (iterable, count) {
  if (Array.isArray(iterable)) {
    // Ensure `count` is between 0 and the number of items in the array.
    count = Math.max(0, Math.min(iterable.length, count ?? iterable.length));
    for (let i = 0; i < count; i++) yield iterable[i];
  }
  else {
    const iterator = iterable[Symbol.iterator]();
    let v = iterator.next();
    for (let i = 0; i < count && !v.done; i++) {
      yield v.value;
      v = iterator.next();
    }
  }
};

/**
 * Takes up to `count` elements from the end of the iterable.  The original order
 * will be preserved, unlike in `iterReverse`.
 * 
 * @template T
 * @param {Iterable<T>} iterable
 * @param {number} count
 * @returns {Array<T>}
 */
exports.takeRight = (iterable, count) => [...exports.iterReverse(iterable, count)].reverse();

/**
 * Creates an iterable that transforms values.
 * 
 * @template TIn
 * @template TOut
 * @param {Iterable<TIn>} iterable 
 * @param {TransformFn<TIn, TOut>} transformFn
 * @returns {Iterable<TOut>}
 */
exports.mapIter = function* (iterable, transformFn) {
  for (const value of iterable)
    yield transformFn(value);
};

/**
 * Creates an iterable that transforms values, and yields the result if it is
 * not `undefined`.
 * 
 * @template TIn
 * @template TOut
 * @param {Iterable<TIn>} iterable 
 * @param {CollectFn<TIn, TOut>} collectFn
 * @returns {Iterable<TOut>}
 */
exports.collectIter = function* (iterable, collectFn) {
  for (const value of iterable) {
    const result = collectFn(value);
    if (typeof result !== "undefined") yield result;
  }
};

/**
 * Filters the given iterable to those values that pass a predicate.
 * 
 * @template T
 * @param {Iterable<T>} iterable
 * @param {PredicateFn<T>} predicateFn
 * @returns {Iterable<T>}
 */
 exports.filterIter = function* (iterable, predicateFn) {
  for (const value of iterable)
    if (predicateFn(value))
      yield value;
};

/**
 * Creates an iterable that groups values based on a transformation function.
 * 
 * @template TValue
 * @template TKey
 * @param {Iterable<TValue>} iterable
 * @param {TransformFn<TValue, TKey>} transformFn
 * @returns {Iterable<[TKey, TValue[]]>}
 */
exports.groupBy = function* (iterable, transformFn) {
  /** @type {Map<TKey, TValue[]>} */
  const groups = new Map();
  for (const value of iterable) {
    const key = transformFn(value);
    if (key == null) continue;
    const theGroup = groups.get(key) ?? [];
    theGroup.push(value);
    groups.set(key, theGroup);
  }

  for (const group of groups) yield group;
};

/** @type {<KVP extends [any, any]>(kvp: KVP) => KVP[0]} */
const partitionKeys = ([key]) => key;
/** @type {<KVP extends [any, any]>(kvp: KVP) => KVP[1]} */
const partitionValues = ([, value]) => value;

/**
 * Creates an iterable that groups key-value-pairs when they share the same key.
 * 
 * @template {[any, any]} KVP
 * @param {Iterable<KVP>} iterable
 * @returns {Iterable<PartitionResult<KVP>>}
 */
exports.partition = function* (iterable) {
  for (const [key, values] of exports.groupBy(iterable, partitionKeys)) {
    const group = values.map(partitionValues);
    // @ts-ignore - This is correct.
    yield [key, group];
  }
};

/**
 * Concatenates multiple values and/or iterables together.  Does not iterate
 * on strings, however.
 * 
 * @template T
 * @param  {...(T | Iterable<T>)} others
 * @returns {Iterable<T>}
 */
exports.concat = function* (...others) {
  for (const value of others) {
    if (typeof value === "string") yield value;
    else if (exports.hasIterator(value)) yield* value;
    else yield value;
  }
};

/**
 * Inserts `value` between every element of `iterable`.
 * 
 * @template T
 * @param {T} value 
 * @param {Iterable<T>} iterable
 * @returns {Iterable<T>}
 */
exports.interweave = function* (value, iterable) {
  const iterator = iterable[Symbol.iterator]();
  let prevEl = iterator.next();
  while (!prevEl.done) {
    yield prevEl.value;
    prevEl = iterator.next();
    if (prevEl.done) return;
    yield value;
  }
};

/**
 * Calls the given function on each element of `iterable` and yields the
 * values, unchanged.
 * 
 * @template {Iterable<any>} TIter
 * @param {TIter} iterable 
 * @param {TapFn<ElementOf<TIter>>} tapFn
 * @returns {Iterable<ElementOf<TIter>>}
 */
exports.tapEach = function* (iterable, tapFn) {
  // Clone an array in case the reference may be mutated by the `tapFn`.
  const safedIterable = Array.isArray(iterable) ? [...iterable] : iterable;
  for (const value of safedIterable) {
    tapFn(value);
    yield value;
  }
};

/**
 * Calls the given function on an array materialized from `iterable` and
 * yields the same values, unchanged.
 * 
 * @template {Iterable<any>} TIter
 * @param {TIter} iterable 
 * @param {TapFn<Array<ElementOf<TIter>>>} tapFn
 * @returns {Iterable<ElementOf<TIter>>}
 */
 exports.tapAll = function* (iterable, tapFn) {
  // Materialize the iterable; we can't provide an iterable that is
  // currently being iterated.
  const materialized = [...iterable];
  tapFn(materialized);
  yield* materialized;
};

/** @type {ChainingFn} */
exports.chain = exports.dew(() => {
  const { mapIter, filterIter, collectIter, concat, tapEach, tapAll, flatten } = exports;
  // @ts-ignore - Should be checked.
  const chain = (iterable) => {
    iterable = iterable ?? [];
    /** @type {ChainComposition<any>} */
    const result = {
      // @ts-ignore - Fitting an overloaded method; TS can't handle it.
      map: (transformFn) => chain(mapIter(iterable, transformFn)),
      flatten: () => chain(flatten(iterable)),
      // @ts-ignore - Fitting an overloaded method; TS can't handle it.
      filter: (predicateFn) => chain(filterIter(iterable, predicateFn)),
      // @ts-ignore - Fitting an overloaded method; TS can't handle it.
      collect: (collectFn) => chain(collectIter(iterable, collectFn)),
      concat: (...others) => chain(concat(iterable, ...others)),
      thru: (transformFn) => chain(transformFn(iterable)),
      tap: (tapFn) => chain(tapEach(iterable, tapFn)),
      tapAll: (tapFn) => chain(tapAll(iterable, tapFn)),
      /** @param {TransformFn<any, any>} [xformFn] */
      value: (xformFn) => xformFn ? xformFn(iterable) : iterable,
      toArray: () => [...iterable],
      exec: () => { for (const _ of iterable); }
    };
    return result;
  };
  return chain;
});

/**
 * Memoizes a pure function that takes a single argument.  If you need to memoize more,
 * use currying to break the function down into separate arguments.
 * 
 * @template {(arg: any) => any} TFunction
 * @param {TFunction} fn
 * @returns {TFunction}
 */
exports.memoize = (fn) => {
  const store = new Map();

  // @ts-ignore - Shut up TS.
  return (arg) => {
    if (store.has(arg)) return store.get(arg);
    const result = fn(arg);
    store.set(arg, result);
    return result;
  };
};

/**
 * Wraps the given zero-arity pure function so it will only be called once.
 * Any additional calls will return a cached result.
 * 
 * @template T
 * @param {() => T} fn
 * @returns {() => T}
 */
exports.callOnce = (fn) => {
  /** @type {T} */
  let result;
  let didCall = false;

  return () => {
    if (didCall) return result;
    didCall = true;
    result = fn();
    return result;
  };
};

/**
 * Wraps the given `iterable` in another iterable which will cache its yields and
 * "replay" from that cache each time a new iterator is called upon.  The wrapped
 * iterable is iterated through lazily and only once, at most.
 * 
 * Basically, this is `memoize` for generator functions.
 * 
 * @template T
 * @param {Iterable<T>} iterable
 * @return {Iterable<T>}
 */
exports.replay = (iterable) => {
  /** @type {T[]} */
  const elements = [];
  const iterator = iterable[Symbol.iterator]();
  return {
    [Symbol.iterator]: function*() {
      yield* elements;
      for (let n = iterator.next(); !n.done; n = iterator.next()) {
        elements.push(n.value);
        yield n.value;
      }
    }
  };
};

/**
 * A helper to both memoize a given arity-1 generator function AND make it replayable.
 * 
 * @template TIn
 * @template TOut
 * @param {(arg: TIn) => Iterable<TOut>} genFn
 * @returns {(arg: TIn) => Iterable<TOut>}
 */
exports.memoizeGenerator = (genFn) => exports.memoize((arg) => exports.replay(genFn(arg)));

/**
 * Default `lengthGetter` for `limitText`.
 * 
 * @param {unknown} value 
 * @returns {number}
 */
const getLength = (value) => exports.getText(value).length;

/**
 * Yields strings of things with a `text` property from the given iterable until
 * the text would exceed the given `maxLength`.
 * 
 * If `options.permissive` is:
 * - `true` - It will yield as much text as can fit.
 * - `false` - It will stop at the first text that cannot fit.
 * 
 * Does not yield empty strings and skips nullish values.
 * 
 * @template {Iterable<any>} TIter
 * @param {TIter} textIterable
 * The iterable to yield from.
 * @param {number} maxLength
 * The maximum amount of text to yield.
 * @param {Object} [options]
 * @param {(value: ElementOf<TIter>) => number} [options.lengthGetter]
 * A transformation function to obtain a length from the value.  By default, it will
 * attempt to convert it with `getText` and produce the length of the result.  Since
 * this function return `""` if it can't find any text, it will not yield those values.
 * @param {boolean} [options.permissive=false]
 * If set to `true`, text that exceeds the length will only be skipped, allowing the
 * search for a shorter string to be included instead.
 * @returns {Iterable<ElementOf<TIter>>}
 */
exports.limitText = function* (textIterable, maxLength, options) {
  const { lengthGetter = getLength, permissive = false } = options ?? {};
  const textIterator = textIterable[Symbol.iterator]();
  let lengthRemaining = maxLength;
  let next = textIterator.next();
  for (; !next.done; next = textIterator.next()) {
    const length = lengthGetter(next.value);
    if (length <= 0) continue;

    const nextLength = lengthRemaining - length;
    if (nextLength < 0) {
      if (!permissive) return;
    }
    else {
      yield next.value;
      lengthRemaining = nextLength;
    }
  }
};

/**
 * Makes a string safe to be used in a RegExp matcher.
 * 
 * @param {string} str 
 */
exports.escapeRegExp = (str) => {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

/**
 * Counts the number of `regex` matches in `str`.
 * 
 * @param {string} str
 * @param {RegExp} regex
 * @returns {number}
 */
exports.countOccurrences = (str, regex) => {
  return ((str || '').match(regex) || []).length;
};

/**
 * Returns the last `count` elements of `arr` in reverse order.
 * IE: last 2 of `[1, 2, 3, 4]` is `[4, 3]`.
 * 
 * @template T
 * @param {T[]} arr 
 * @param {number} [count]
 * @returns {T[]}
 */
exports.getFinal = (arr, count = 1) => {
  return [...exports.iterReverse(arr, count)];
};

/**
 * Function for `reduce` that sums things with a `length` property.
 * 
 * @param {number} acc
 * @param {string} str
 * @returns {number}
 */
exports.sumLength = (acc, str) => {
  return acc + str.length;
};

/**
 * Gets the text body of a World-Info entry.
 * 
 * Note: there was a period of time when Latitude had world-info assigning
 * the actual entry text to the `description` field, and this function
 * existed as a temporary fix.  It does not appear to be needed now, but
 * I'm keeping it around in case of future Latitude fuck-ups.
 * 
 * @param {WorldInfoEntry} wiEntry
 * @returns {string}
 */
exports.getEntryText = (wiEntry) => wiEntry.entry || "";

/**
 * Function that gets text from an object.
 * - If `item` has a `text` property that is a string, it returns that.
 * - If `item` is itself a string, it returns that.
 * - Otherwise, produces an empty-string.
 */
exports.getText = exports.dew(() => {
  /** @type {(item: any) => item is string} */
  const isString = (item) => typeof item === "string";

  /** @type {(item: any) => item is { text: string }} */
  const hasText = (item) => Boolean(item && "text" in item && isString(item.text));

  /**
   * @param {any} item
   * @returns {string} 
   */
  const impl = (item) => {
    const text
      = isString(item) ? item
      : hasText(item) ? item.text
      : undefined;
    return text || "";
  };

  return impl;
});

/** Matches any string that appears to start with a new line. */
const reNewLine = /^\s*?\n/;

/**
 * Given an array of things that `getText` accepts, it will locate the first
 * item that starts with a newline at or before the `index` and yield items
 * until it hits the next item that starts with a newline.
 * 
 * This is intended to group `HistoryEntry` with text where the AI (or the
 * player through an edit) continued the previous entry so you (hopefully)
 * get complete thoughts and paragraphs.
 */
exports.getContinuousText = exports.dew(() => {
  /** @type {(index: number, historyArr: readonly any[]) => number} */
  const findStart = (index, historyArr) => {
    let start = index, curText = "";
    while (start >= 0) {
      curText = exports.getText(historyArr[start]);
      if (reNewLine.test(curText)) return start;
      start -= 1;
    }
    return 0;
  };

  /**
   * @param {number} curIndex
   * @param {readonly any[]} textableArr
   * @returns {Iterable<any>}
   */
  const emitContinuousText = function*(curIndex, textableArr) {
    if (curIndex >= textableArr.length) return;

    // Just emit until we hit the next string starting with a newline.
    let curText = "";
    do {
      yield textableArr[curIndex];
      curIndex += 1;
      curText = exports.getText(textableArr[curIndex]);
    }
    while (curIndex < textableArr.length && !reNewLine.test(curText));
  };

  /**
   * @template {string | { text: string }} T
   * @param {number} index
   * @param {readonly T[]} textableArr
   * @returns {{ start: number, elements: T[] }}
   */
  const getContinuousText = (index, textableArr) => {
    // Locate the first entry at or before `index` that does not appear to be
    // a continuation.  A newline is usually appended when it is not continuing.
    const start = findStart(index, textableArr);
    // Grab the elements from this point until the next elements that starts
    // with a new line.
    const elements = [...emitContinuousText(start, textableArr)];
    // Build the output.  We'll pass `start` out so the caller can use it to
    // avoid duplicating work.
    return { start, elements };
  };

  return getContinuousText;
});

/**
 * Rolls a dice, D&D style.
 * 
 * @param {number} count
 * @param {number} sides
 * @returns {number}
 */
exports.rollDice = (count, sides) => {
  let result = 0;
  for (let i = 0; i < count; i++)
  result += Math.floor(Math.random() * sides) + 1;
  return result;
};