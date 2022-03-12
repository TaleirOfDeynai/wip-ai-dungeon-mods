/**
 * Error to wrap directly thrown strings.
 */
class ThrownStringError extends Error {
  /**
   * @param {string} thrownStr
   */
  constructor(thrownStr) {
    super(`A string was thrown directly:\n${thrownStr}`);

    // @ts-ignore - That's why we're checking, TS.
    Error.captureStackTrace?.(this, this.constructor);
    this.name = this.constructor.name;

    /** The actual string that was thrown. */
    this.value = thrownStr;
  }
}

/**
 * Error to wrap thrown values that are not an instance of {@link Error}.
 */
class ThrownValueError extends Error {
  /**
   * @param {unknown} thrownVal
   */
  constructor(thrownVal) {
    super("A non-error was thrown.");

    // @ts-ignore - That's why we're checking, TS.
    Error.captureStackTrace?.(this, this.constructor);
    this.name = this.constructor.name;

    /** The actual value that was thrown. */
    this.value = thrownVal;
  }
}

class AggregateError extends Error {
  /**
   * @param {string} message
   * @param {Error[]} errors
   */
  constructor(message, errors) {
    super(message);

    // @ts-ignore - That's why we're checking, TS.
    Error.captureStackTrace?.(this, this.constructor);
    this.name = this.constructor.name;

    /** The aggregated errors. */
    this.errors = errors;
  }
}

exports.ThrownStringError = ThrownStringError;
exports.ThrownValueError = ThrownValueError;
exports.AggregateError = AggregateError;

/**
 * Ensures `thrownVal` is an instance of {@link Error}.
 * 
 * @param {unknown} thrownVal 
 * @returns {Error}
 */
exports.wrapAsError = (thrownVal) => {
  // Rethrow the original error.
  if (thrownVal instanceof Error) return thrownVal;
  // Wrap strings, treating them as messages.
  if (typeof thrownVal === "string") return new ThrownStringError(thrownVal);
  // Anything else is wrapped up generically.
  return new ThrownValueError(thrownVal);
};

/**
 * Rethrows `thrownVal` as an {@link Error}, wrapping it as needed.
 * 
 * @param {unknown} thrownVal
 * @returns {never}
 */
exports.wrapAndThrow = (thrownVal) => {
  throw exports.wrapAsError(thrownVal);
};