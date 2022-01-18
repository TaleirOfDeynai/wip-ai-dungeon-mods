const p = require("parsimmon");

/** Involved in separation, but not a separator itself.  Does not include `\n`. */
exports.ws = p.regex(/[ \t\r\f]*/).desc("optional whitespace (excluding new lines)");

exports.semi = p.string(";").desc("a semi-colon");
exports.comma = p.string(",").desc("a comma");
exports.newline = p.string("\n").desc("a new line");
exports.tag = p.string("&").desc("an ampersand (&)");