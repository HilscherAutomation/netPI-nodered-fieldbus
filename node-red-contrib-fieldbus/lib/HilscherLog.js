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
  TRACE_ERROR: 0x00000001,
  TRACE_WARNING: 0x00000002,
  TRACE_INFO: 0x00000004,
  TRACE_DEBUG: 0x00000008,
  TRACE_FNC: 0x000000010,
  TRACE_FNC_ARGS: 0x00000020,
  TRACE_JSON: 0x00000040,
  TRACE_PACKET_HEADER: 0x00000080,
  TRACE_REFCNT: 0x00000100,
  TRACE_PACKET_DATA: 0x00000200,
  TRACE_WR_VALUE: 0x00000400,
  TRACE_QUERY_PARAM: 0x00000800,
  TRACE_RD_VALUE: 0x00001000,
  TRACE_FREE_0X2000: 0x00002000,
  TRACE_FREE_0X4000: 0x00004000,
  TRACE_FREE_0X8000: 0x00008000,
  TRACE_FREE_0X10000: 0x00010000,
  TRACE_FREE_0X20000: 0x00020000,
  TRACE_FREE_0X40000: 0x00040000,
  TRACE_FREE_0X80000: 0x00080000,
  TRACE_FREE_0X100000: 0x00100000,
  TRACE_FREE_0X200000: 0x00200000,
  TRACE_FREE_0X400000: 0x00400000,
  TRACE_FREE_0X800000: 0x00800000,
  TRACE_FREE_0X1000000: 0x01000000,
  TRACE_FREE_0X2000000: 0x02000000,
  TRACE_FREE_0X4000000: 0x04000000,
  TRACE_FREE_0X8000000: 0x08000000,
  TRACE_FREE_0X10000000: 0x10000000,
  TRACE_FREE_0X20000000: 0x20000000,
  TRACE_FREE_0X40000000: 0x40000000,
  TRACE_OUTPUT_CONSOLE: 0x80000000
};

function HilLogNoPrefix(txt, level) {
    "use strict";
    this.HilLog(undefined, undefined, txt, level, true);
}
exports.HilLogNoPrefix = HilLogNoPrefix;
function HilLog(filename, line, txt, level, noPrefix) {
  "use strict";
  var levelStr;
  var fLog = false;
  if (exports.traceLevel !== 0) {
    if (level) {
      if (level === "error") {
        levelStr = "error".error;
        if (exports.traceLevel >= exports.traceEnum.TRACE_ERROR) {
          fLog = true;
        }
      } else if (level === "warn") {
        levelStr = "warn".warn;
        if (exports.traceLevel >= exports.traceEnum.TRACE_WARNING) {
          fLog = true;
        }
      } else if (level === "debug") {
        levelStr = "debug".debug;
        if (exports.traceLevel >= exports.traceEnum.TRACE_DEBUG) {
          fLog = true;
        }
      } else if (level === "info") {
        levelStr = "info".info;
        if (exports.traceLevel >= exports.traceEnum.TRACE_INFO) {
          fLog = true;
        }
      } else  {
        levelStr = "verb".verbose;
      }
    } else {
      levelStr = "verb".verbose;
    }
    if (fLog === true) {
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