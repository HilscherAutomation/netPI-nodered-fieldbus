var stackTrace = require("stack-trace"); //for working with getFileName() and getLineNumber()
var colors = require("colors"); //to be able to coloring the output
var htb = require("./HilscherToolBox.js");
colors.setTheme({
  silly: "rainbow",
  input: "grey",
  verbose: "cyan",
  prompt: "grey",
  info: "green",
  data: "grey",
  help: "cyan",
  warn: "yellow",
  debug: "blue",
  invers: ["black", "white"],
  error: ["red", "bold"],
  endTest: ["green", "bold"],
  newLoop: ["cyan", "bold"]
});

var exports = module.exports = {};

exports.traceLevel = 0;
exports.traceEnum = {
  TRACE_ERROR: 1,
  TRACE_WARNING: 2,
  TRACE_INFO: 4,
  TRACE_DEBUG: 8,
  TRACE_FNC: 16,
  TRACE_FNC_ARGS: 32,
  TRACE_JSON: 64,
  TRACE_PACKET_HEADER: 128,
  TRACE_REFCNT: 256,
  TRACE_PACKET_DATA: 512,
  TRACE_WR_VALUE: 1024,
  TRACE_QUERY_PARAM: 2048,
  TRACE_RD_VALUE: 4096,
  TRACE_FREE_0X2000: 8192,
  TRACE_FREE_0X4000: 16384,
  TRACE_FREE_0X8000: 32768,
  TRACE_FREE_0X10000: 65536,
  TRACE_FREE_0X20000: 131072,
  TRACE_FREE_0X40000: 262144,
  TRACE_FREE_0X80000: 524288,
  TRACE_FREE_0X100000: 1048576,
  TRACE_FREE_0X200000: 2097152,
  TRACE_FREE_0X400000: 4194304,
  TRACE_FREE_0X800000: 8388608,
  TRACE_FREE_0X1000000: 16777216,
  TRACE_FREE_0X2000000: 33554432,
  TRACE_FREE_0X4000000: 67108864,
  TRACE_FREE_0X8000000: 134217728,
  TRACE_FREE_0X10000000: 268435456,
  TRACE_FREE_0X20000000: 536870912,
  TRACE_FREE_0X40000000: 1073741824,
  TRACE_OUTPUT_CONSOLE: 2147483648,
};

function HilLogNoPrefix(txt, level) {
    "use strict";
    this.HilLog(undefined, undefined, txt, level, true);
}
exports.HilLogNoPrefix = HilLogNoPrefix;
function HilLog(filename, line, txt, level, noPrefix) {
  "use strict";
  var levelStr;
  var levelBit = 0;
  if (exports.traceLevel) {
    if (level) {
      if (level === "error") {
        levelBit = this.traceEnum.TRACE_ERROR;
        levelStr = "error".error;
      } else if (level === "warn") {
        levelBit = this.traceEnum.TRACE_WARNING;
        levelStr = "warn".warn;
      } else if (level === "debug") {
        levelBit = this.traceEnum.TRACE_DEBUG;
        levelStr = "debug".debug;
      } else if (level === "info") {
        levelBit = this.traceEnum.TRACE_INFO;
        levelStr = "info".info;
      } else  {
        levelStr = "verb".verbose;
      }
    } else {
      levelStr = "verb".verbose;
    }
    if (exports.traceLevel & levelBit) {
      if (noPrefix === true) {
        console.log("[" + levelStr + "]" + " [" + txt.verbose + "]");
      } else {
        console.log(htb.GetTimestamp() + " [" + levelStr + "] [" + filename.info + "] [" + line.toString().info + "] [" + txt.help + "]");
      }
    }
  }
}
exports.HilLog = HilLog;
function getLineNumber() {
  "use strict";
  if (stackTrace.get(getLineNumber)[0] !== undefined) {
    return stackTrace.get(getLineNumber)[0].getLineNumber();
  }
  return 0;
}
exports.getLineNumber = getLineNumber;