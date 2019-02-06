/*  Copyright 2016 Hilscher Gesellschaft fuer Systemautomation mbH.
 * 
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 * 
 *  http://www.apache.org/licenses/LICENSE-2.0
 * 
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */ 
/*
 * This module contains the server side functions which are called by the 10-fieldbus.html page in Node-RED
 * 
 * 
 */
var packageConfig = require("./package");
var versionData = {
  "usedV8Version": { "name": "V8 version", "val": undefined }, 
  "expectedNodeVersion": { "name": "expected NodeJS version", "val": undefined }, 
  "currentNodeVersion": { "name": "running NodeJS version", "val": undefined }, 
  "libuvVersion": { "name": "LIBUV version", "val": undefined }, 
  "wrapperVersion": { "name": "Wrapper version", "val": undefined, "Compiled": undefined }, 
  "fieldbusNodeVersion": { "name": "FieldbusNode version", "val": packageConfig.version },
  "nodeREDVersion": { "name": "Node-RED version", "val": undefined }
};

module.exports = function (RED) {
  "use strict";
  var getFileName = "10-fieldbus.js";
  var log = require("./lib/HilscherLog");
  var connectionPool = require("./lib/fieldbusConnectionPool");
  var fs = require("fs");
  var globalInitError = {
    "Error": 0, 
    "Module": undefined, 
    "AddDesc": undefined, 
    "ShortDesc": undefined, 
    "Timestamp": undefined, 
    "initError": false,
    "board": [{
      "Name": undefined,
      "Error": 0,
      "AddDesc": undefined
    }]
  };
  var file = __dirname + "/lib/fieldbus";
  var startTime = 0;
  var htb = require("./lib/HilscherToolBox");
  
  //see http://nodered.org/docs/writing-functions.html#global-context
  /*
   * Global context
   * There is also a global context available that is shared by, and accessible to all nodes. 
   * For example to make the variable foo available globally across the canvas:
   */
  //global.set("foo", "bar");  // this is now available to other nodes
  /*And can then be read using .get*/
  //var myfoo = global.get("foo");  // this should now be "bar"
  log.HilLog(getFileName, log.getLineNumber(), "Try to load node from : " + file + ".node", "warn");
  var fieldbusDLL = {};
  fieldbusDLL = require(file);
  var localFieldbusSettings = {};
  
  function getCifXList(callback) {
    var Query = {
      "selectedProtocolClass": 0,         //return all protocol classes
      "selectedCommunicationClass": 0,    //return all communication classes
      "selectedBoardName": ""             //return informations for all boards
    };
    log.HilLog(getFileName, log.getLineNumber(), "Start getCifXList", "info");
    fieldbusDLL.getCifXInfo(Query, function (locerror, data) {
      if (locerror) {
        log.HilLog(getFileName, log.getLineNumber(), "getCifXList ERROR: " + JSON.stringify(locerror), "error");
        callback(locerror);
      } else {
        //log.HilLog(getFileName, log.getLineNumber(), "getCifXInfo Response data =" + JSON.stringify(data), "debug");
        if (data.ResponseVersion === 1) {
          data.Boards.forEach(function (boardItem, bIndex) {
            connectionPool.addBoard(RED, boardItem);
          });
          callback(undefined, null); //this is not an error
        } else {
          callback("getCifXInfo ResponseVersion [" + data.ResponseVersion + "] unexpected");
        }
      }
    });
  }
  
  function onInitErr(locerror, line) {
    log.HilLog(getFileName, line, "CifX-Node::globalInitError: " + JSON.stringify(locerror), "error");
    globalInitError = locerror;
    globalInitError.initError = true;
    if (locerror.TimeStamp) {
      globalInitError.Timestamp = locerror.TimeStamp;
    } else if (locerror.Timestamp) {
      globalInitError.Timestamp = locerror.Timestamp;
    } else {
      globalInitError.Timestamp = new Date().getTime();
    }
    return 1;
  }
  
  if (RED.settings.userDir) {
    var userDir = RED.settings.userDir;
    log.HilLog(getFileName, log.getLineNumber(), "Node-RED flow found at: " + userDir, "info");
    file = userDir + "/fieldbusSettings.json";
    log.HilLog(getFileName, log.getLineNumber(), "Try to load settings file from : " + file, "info");
    var tmpSettings = "";
    try {
      tmpSettings = fs.readFileSync(file, "utf8");
      localFieldbusSettings = JSON.parse(tmpSettings);
    } catch (error) {
      log.HilLog(getFileName, log.getLineNumber(), "Could not open settings file from : USING DEFAULT!" + 
        file + " Error:" + error, "error");
      localFieldbusSettings = {
        "traceFileName": "",
        "traceLevel": 0,
        "nodeTraceLevel": 0,
        "separatorToken": "~",
        "readCycle": 200,
        "fwPath": [{
            "OS": "unix", 
            "path": "/opt/node-red/.userdir/FWPool"
          }, {
            "OS": "Win", 
            "path": "c:/Temp/FWPool"
          }],
        "webCfgSettings": { "winOpenUrl": "/webConfigurator/fieldbus?Config_Filename=" }
      };
      try {
        fs.writeFileSync(file, JSON.stringify(localFieldbusSettings));
      } catch (error) {
        log.HilLog(getFileName, log.getLineNumber(), "Could not write default settings file!" + 
          file + " Error:" + error, "error");
      }
    }
    if (typeof (localFieldbusSettings.traceLevel) === "string") {
      if (localFieldbusSettings.traceLevel.search("0x") !== -1 || localFieldbusSettings.traceLevel.search("0X") !== -1) {
        log.traceLevel = parseInt(localFieldbusSettings.traceLevel, 16);
      } else {
        log.traceLevel = parseInt(localFieldbusSettings.traceLevel, 10);
      }
    } else {
      log.traceLevel = localFieldbusSettings.traceLevel;
    }
    if (typeof (localFieldbusSettings.nodeTraceLevel) === "string") {
      if (localFieldbusSettings.nodeTraceLevel.search("0x") !== -1 || localFieldbusSettings.nodeTraceLevel.search("0X") !== -1) {
        localFieldbusSettings.nodeTraceLevel = parseInt(localFieldbusSettings.nodeTraceLevel, 16);
      } else {
        localFieldbusSettings.nodeTraceLevel = parseInt(localFieldbusSettings.nodeTraceLevel, 10);
      }
    }
    log.HilLog(getFileName, log.getLineNumber(), "Load local settings file:[" + 
        JSON.stringify(localFieldbusSettings) + "] from [" + file + "]", "debug");
    localFieldbusSettings.osFirmwarePath = RED.settings.userDir + "/FWPool"; //default if unknown OS
    var nPos = 0;
    for (; nPos < localFieldbusSettings.fwPath.length; nPos++) {
      if (localFieldbusSettings.fwPath[nPos].OS === process.platform) {
        localFieldbusSettings.osFirmwarePath = localFieldbusSettings.fwPath[nPos].path;
        if (localFieldbusSettings.fwPath[nPos].variante) {
          localFieldbusSettings.osVariante = localFieldbusSettings.fwPath[nPos].variante;
        }
        break;
      }
    }
    if (nPos >= localFieldbusSettings.fwPath.length) {
      log.HilLog(getFileName, log.getLineNumber(), "OS [" + process.platform + "] is unknown. Try to read firmware list from:" + 
        localFieldbusSettings.osFirmwarePath, "warn");
    } else {
      log.HilLog(getFileName, log.getLineNumber(), "Expected firmware path in [" + localFieldbusSettings.osFirmwarePath + "}", "info");
    }
    
    connectionPool.setup(RED, localFieldbusSettings);
    
   
    var query = {
      "flowPath": userDir, 
      "separatorToken": localFieldbusSettings.separatorToken,
      "traceLevel": localFieldbusSettings.traceLevel, 
      "traceFile": localFieldbusSettings.traceFileName, 
      "trace2Console": localFieldbusSettings.trace2Console,
      "firmwarePath": userDir + '/FWPool',
      "os": process.platform,
      "osVariante": localFieldbusSettings.osVariante //"gateway", "pc"
    };
    fieldbusDLL.openDLL(query, function (locerror, data) {
      var error = { "Error": 0, "AddDesc": null };
      if (locerror) {
        onInitErr(locerror, log.getLineNumber());
      } else {
        log.HilLog(getFileName, log.getLineNumber(), "openDLL Response data =" + JSON.stringify(data), "debug");
        if (data.ResponseVersion === 1) {
          if (data.Result !== "Done" && data.Result !== "Ok") {
            /* an error occure while the CifX-Node is initializing */
            error.Error = 1;
            error.AddDesc = "CifX-Node initialization error. Close Node";
            log.HilLog(getFileName, log.getLineNumber(), error.AddDesc, "error");
            startNodes(error);
          } else {
            var ar;
            if (data.traceFileOpen) {
              log.HilLog(getFileName, log.getLineNumber(), data.traceFileOpen, "debug");
            }
            if (data.traceStartOptions) {
              log.HilLog(getFileName, log.getLineNumber(), data.traceStartOptions, "debug");
            }
            if (data.wrapperVersion) {
              log.HilLog(getFileName, log.getLineNumber(), data.wrapperVersion, "debug");
              ar = data.wrapperVersion.split('[');
              ar.forEach(function (item, idx) {
                log.HilLog(getFileName, log.getLineNumber(), "[" + idx + "] = " + item.split(']')[0], "debug");
              });
              if (ar.length === 4) {
                versionData.wrapperVersion.val = ar[2].split(']')[0];
                versionData.wrapperVersion.Compiled = ar[3].split(']')[0];
              }
            }
            if (data.libuvVersion) {
              log.HilLog(getFileName, log.getLineNumber(), data.libuvVersion, "debug");
              ar = data.libuvVersion.split('[');
              ar.forEach(function (item, idx) {
                log.HilLog(getFileName, log.getLineNumber(), "[" + idx + "] = " + item.split(']')[0], "debug");
              });
              versionData.libuvVersion.val = ar[1].split(']')[0];
            }
            if (data.expectedNodeVersion) {
              log.HilLog(getFileName, log.getLineNumber(), data.expectedNodeVersion, "debug");
              ar = data.expectedNodeVersion.split('[');
              ar.forEach(function (item, idx) {
                log.HilLog(getFileName, log.getLineNumber(), "[" + idx + "] = " + item.split(']')[0], "debug");
              });
              versionData.expectedNodeVersion.val = ar[1].split(']')[0];
            }
            var str = process.version;
            versionData.currentNodeVersion.val = str.substr(1); //current nodeJS version comes in the format vx.y.z where v is undesired
            versionData.nodeREDVersion.val = RED.version(); 
            if (data.usedV8Version) {
              log.HilLog(getFileName, log.getLineNumber(), data.usedV8Version, "debug");
              ar = data.usedV8Version.split('[');
              ar.forEach(function (item, idx) {
                log.HilLog(getFileName, log.getLineNumber(), "[" + idx + "] = " + item.split(']')[0], "debug");
              });
              versionData.usedV8Version.val = ar[1].split(']')[0];
            }
            if (data.fieldbusNodeVersion) {
              log.HilLog(getFileName, log.getLineNumber(), data.fieldbusNodeVersion, "debug");
              ar = data.fieldbusNodeVersion.split('[');
              ar.forEach(function (item, idx) {
                log.HilLog(getFileName, log.getLineNumber(), "[" + idx + "] = " + item.split(']')[0], "debug");
              });
              versionData.fieldbusNodeVersion.val = ar[1].split(']')[0];
            }
            if (data.workingDir) {
              log.HilLog(getFileName, log.getLineNumber(), data.workingDir, "debug");
            }
            log.HilLog(getFileName, log.getLineNumber(), "versionData:" + JSON.stringify(versionData), "debug");
            getCifXList(function (err, res) {
              if (err) {
                startNodes(err);
              } else {
                startNodes(undefined);
              }
            }, 1);
          }
        } else {
          log.HilLog(getFileName, log.getLineNumber(), 
            "DLL.setup return a ResponseVersion of [" + 
            data.ResponseVersion + "] expected is [1]. CLOSE NODE!", "error");
        }
      }
    });
  } else {
    log.HilLog(getFileName, log.getLineNumber(), "No user dir in RED.settings!", "error");
  }
  function startNodes(err, res) {
    if (err) {
      log.HilLog(getFileName, log.getLineNumber(), "Error (" + err.Error + ") on initializing cifX cards. Could not use Fieldbus-Nodes!", "error");
      globalInitError = err;
      if (err.TimeStamp) {
        globalInitError.Timestamp = err.TimeStamp;
      } else if (err.Timestamp) {
        globalInitError.Timestamp = err.Timestamp;
      } else {
        globalInitError.Timestamp = new Date().getTime();
      }
      globalInitError.ShortDesc = 'driver error';
      globalInitError.initError = true;
    } else {
      log.HilLog(getFileName, log.getLineNumber(), "CifX environment initialized!", "info");
    }
    RED.nodes.registerType("fieldbus interface", FieldbusConfigNode);
    RED.nodes.registerType("fieldbus in", FieldbusInNode);
    RED.nodes.registerType("fieldbus out", FieldbusOutNode);
  }
  /*
   * REGISTER my nodes (config, in, out)
   */
  /* The CONFIGURATION Node */

  function FieldbusConfigNode(fbCfgNode) {
    if (globalInitError.Error === 0) {
      //now test if the firmware on the cifX matches my expected firmware
      log.HilLog(getFileName, log.getLineNumber(), "FieldbusConfigNode (CREATE) config: " + JSON.stringify(fbCfgNode), "debug");
      if (fbCfgNode.interfaceComponents && typeof(fbCfgNode.interfaceComponents) === 'string') {
        this.itfComponents = JSON.parse(fbCfgNode.interfaceComponents);
        this.selectedSignalPath = fbCfgNode.selectedSignalPath;
        this.fbConfigDataObj = fbCfgNode.fbConfigDataObj;
        this.clearOutputsOnDeploy = false;
        if (fbCfgNode.clearOutputsOnDeploy === 'on' || 
          fbCfgNode.clearOutputsOnDeploy === 'true' ||
          fbCfgNode.clearOutputsOnDeploy === true) {
          this.clearOutputsOnDeploy = true;
        }
        var self = this;
        var obj = connectionPool.findFirmware(RED, this.itfComponents, 'config', fbCfgNode.id);
        if (obj.BoardObj !== undefined) {
          log.HilLog(getFileName, log.getLineNumber(), "Firmware (" + this.itfComponents.prtName + 
          ": " + this.itfComponents.className + 
          ": " + this.itfComponents.boardName + 
          ") found. Node can start", "debug");
        } else {
          log.HilLog(getFileName, log.getLineNumber(), "The config node expects a firmware which could not be found on any cifX", 'error');
        }
        RED.nodes.createNode(self, fbCfgNode);
      }
    } else {
      log.HilLog(getFileName, log.getLineNumber(), "FieldbusConfigNode will not start because " + 
        "of no cifX cards!", "error");
    }
  }
  
  function FieldbusInNode(fbInHtmlVars) {
    RED.nodes.createNode(this, fbInHtmlVars);
    //var events = require("../../../red/red");
    var node = this;
    node.nodeIsStarted = false;
    console.log("FieldbusInNode() this.nodeIsStarted = " + node.nodeIsStarted);
    node.fieldbusObj = fbInHtmlVars.fieldbusObj;
    node.selectedSignalPath = fbInHtmlVars.selectedSignalPath;
    node.fbCfgNode = RED.nodes.getNode(fbInHtmlVars.fieldbusObj);
    console.log("FieldbusInNode: node.fbCfgNode=" + JSON.stringify(node.fbCfgNode));
    if (globalInitError.Error === 0) {
      if (node.fbCfgNode) {
        log.HilLog(getFileName, log.getLineNumber(), "IN_NODE (" + node.id + "):: (CREATE)", "info");
        log.HilLog(getFileName, log.getLineNumber(), "IN_NODE node.fbCfgNode=(" + JSON.stringify(node.fbCfgNode) + ")", "info");
        var req = { 'id': node.id };
        var itfComponents = node.fbCfgNode.itfComponents;
        if (itfComponents && typeof (itfComponents) === 'string') {
          itfComponents = JSON.parse(itfComponents);
        }
        var obj = connectionPool.findFirmware(RED, itfComponents, 'in');
        if (obj.BoardObj === undefined) {
          log.HilLog(getFileName, log.getLineNumber(), "IN_NODE (" + node.id + ") Firmware (" + itfComponents.prtName +
            ": " + itfComponents.className + ": " + itfComponents.boardName + 
            ") not found. Set Node (" + node.id + ") to state 'wrong firmware'", "error");
          node.status({
            fill: "red",
            shape: "dot",
            text: "cifX not found"
          });
        } else {
          fieldbusDLL.addReference(req);
          node.status({
            fill: "grey",
            shape: "ring",
            text: "initializing"
          });
          log.HilLog(getFileName, log.getLineNumber(), "IN_NODE (" + node.id + "):: selectedSignalPath(" + node.selectedSignalPath + ")", "info");
          //log.HilLog(getFileName, log.getLineNumber(), "config:" + JSON.stringify(this.fbCfgNode), "debug");
          var fieldbusOptions = {
            readCycle: localFieldbusSettings.readCycle,
            interfaceComponents: itfComponents,
            clearOutputsOnDeploy: node.fbCfgNode.clearOutputsOnDeploy,
            selectedSignalPath: node.selectedSignalPath,
            config_node_id: node.fbCfgNode.id,
            uid: node.id
          };
          node.fieldbusConnection = connectionPool.getConnection(RED, fieldbusOptions, false, obj.ErrorObj);
          if (obj.ErrorObj.Error !== 0) {
            node.fieldbusConnection.setLastError(obj.ErrorObj, getFileName, log.getLineNumber());
            node.status({
              fill: "red",
              shape: "dot",
              text: "wrong firmware"
            });
          } else {
            if (signalPathIsValid(node.selectedSignalPath, localFieldbusSettings.separatorToken)) {
              node.status({
                fill: "red",
                shape: "ring",
                text: "disconnected"
              });
              node.fieldbusConnection.addSignalSubscription(fieldbusOptions, function (localSignalPath, payload, uid, mod, line) {
                var time = Date.parse(payload.timestamp);
                //log.HilLog(getFileName, log.getLineNumber(), "IN_NODE addSignalSubscription in: UID:" + uid + ", payload:" + 
                //JSON.stringify(payload) + ", conv time ==> " + time, "debug");
                var msg = {
                  topic: localSignalPath,
                  payload: payload
                };
                //PM wish a long value, not a string
                msg.payload.timestamp = time;
                if (uid === node.id) {
                  if (msg.payload.error) {
                    var errObj = {
                      'Error': msg.payload.error,
                      'AddDesc': msg.payload.add_desc,
                      'Timestamp': msg.payload.timestamp
                    };
                    node.fieldbusConnection.setLastError(errObj, getFileName, log.getLineNumber());
                  }
                  if (payload.error === 0) {
                    log.HilLog(mod, line, "IN_NODE send(msg:" + JSON.stringify(msg) + ")", "debug");
                    node.status({
                      fill: "green",
                      shape: "dot",
                      text: "Communicating"
                    });
                  } else {
                    log.HilLog(mod, line, "IN_NODE send(msg:" + JSON.stringify(msg) + ")", "error");
                    node.status({
                      fill: "red",
                      shape: "ring",
                      text: "Error"
                    });
                  }
                } else {
                  log.HilLog(mod, line, "IN_NODE uid:" + uid + "] != node.id " + node.id, "error");
                }
                node.send(msg);
              });
              node.fieldbusConnection.on("update_error", function (uid, element) {
                if (uid === node.id) {
                  node.fieldbusConnection.setLastError(element.lastErrorObj, getFileName, log.getLineNumber());
                }
              });
              node.fieldbusConnection.on("error", function (uid, msg) {
                if (uid === node.id) {
                  log.HilLog(getFileName, log.getLineNumber(), "IN_NODE uid: [" + uid + "] 'error'", "error");
                  //PM has decided to disable all outputs to the debug pane
                  //if (msg) {
                  //  node.error(msg);
                  //}
                  node.status({
                    fill: "red",
                    shape: "ring",
                    text: "stopped"
                  });
                }
              });
              node.fieldbusConnection.on("disabled", function (uid) {
                if (uid === node.id) {
                  log.HilLog(getFileName, log.getLineNumber(), "IN_NODE uid: [" + uid + "] 'disabled'", "warn");
                  node.status({
                    fill: "grey",
                    shape: "ring",
                    text: "disabled"
                  });
                }
              });
              node.fieldbusConnection.on("channelIsOpen", function (uid) {
                if (uid === node.id) {
                  log.HilLog(getFileName, log.getLineNumber(), "IN_NODE uid: [" + uid + "] 'channelIsOpen'", "info");
                  node.status({
                    fill: "yellow",
                    shape: "ring",
                    text: "Ready"
                  });
                }
              });
              node.fieldbusConnection.on("restartError", function (uid, errorObj) {
                if (uid === node.id) {
                  node.fieldbusConnection.setLastError(errorObj, getFileName, log.getLineNumber());
                  node.status({
                    fill: "red",
                    shape: "ring",
                    text: "Device error"
                  });
                  var msg = {
                    topic: node.selectedSignalPath,
                    payload: { "error": 0, "add_desc": undefined, "value": 0, "timestamp": new Date().getTime() }
                  };
                  msg.payload.error = errorObj.Error;
                  msg.payload.add_desc = errorObj.AddDesc;
                  log.HilLog(getFileName, log.getLineNumber(), "IN_NODE uid: [" + uid + "] 'sendMsg' [error:0x" + errorObj.Error.toString(16) + 
                    ", AddDesc:" + errorObj.AddDesc + "]", "error");
                  node.send(msg);
                }
              });
              node.fieldbusConnection.on("communicationIsRunning", function (uid) {
                if (uid === node.id) {
                  log.HilLog(getFileName, log.getLineNumber(), "IN_NODE uid: [" + uid + "] 'communicationIsRunning'", "info");
                  node.status({
                    fill: "green",
                    shape: "dot",
                    text: "Communicating"
                  });
                }
              });
              node.fieldbusConnection.on("busON", function (uid) {
                if (uid === node.id) {
                  log.HilLog(getFileName, log.getLineNumber(), "IN_NODE uid: [" + uid + "] 'busON'", "info");
                  node.status({
                    fill: "green",
                    shape: "ring",
                    text: "Running"
                  });
                }
              });
              node.fieldbusConnection.on("timeout", function (uid, msg) {
                if (uid === node.id) {
                  log.HilLog(getFileName, log.getLineNumber(), "IN_NODE uid: [" + uid + "] 'timeout'", "error");
                  //PM has decided to disable all outputs to the debug pane
                  //if (msg) {
                  //  node.error(msg);
                  //}
                  node.status({
                    fill: "blue",
                    shape: "ring",
                    text: "Timeout"
                  });
                }
              });
              node.fieldbusConnection.on("disconnect", function (uid) {
                if (uid === node.id) {
                  //log.HilLog(getFileName, log.getLineNumber(), "IN_NODE uid:" + uid + "] 'disconnect'", "warn");
                  node.status({
                    fill: "red",
                    shape: "ring",
                    text: "Disconnected"
                  });
                }
              });
              node.fieldbusConnection.on("driveropen", function (uid) {
                if (uid === node.id) {
                  log.HilLog(getFileName, log.getLineNumber(), "IN_NODE uid: [" + uid + "] 'driveropen'", "info");
                  node.status({
                    fill: "yellow",
                    shape: "ring",
                    text: "Ready"
                  });
                }
              });
              node.fieldbusConnection.on("clearError", function (uid) {
                if (uid === node.id) {
                  //log.HilLog(getFileName, log.getLineNumber(), "IN_NODE uid: [" + uid + "] 'writeok'", "info");
                  node.status({
                    fill: "green",
                    shape: "ring",
                    text: "Error gone"
                  });
                }
              });
              if (node.fieldbusConnection.isRunning()) {
                node.status({
                  fill: "green",
                  shape: "dot",
                  text: "Communicating"
                });
              } else {
                if (node.fieldbusConnection.connectionInitError === 0) {
                  node.fieldbusConnection.connect();
                }
              }
            } else {
              var errorObj = htb.GetError('SignalInvalid');
              errorObj.AddDesc = errorObj.AddDesc.replace('@1', node.selectedSignalPath);
              node.fieldbusConnection.setLastError(errorObj, getFileName, log.getLineNumber());
              node.error(getFileName + "(" + log.getLineNumber() + ") signal path is invalid");
              node.status({
                fill: "red",
                shape: "ring",
                text: "Signal invalid"
              });
            }
          }
        }
      } else {
        node.error(getFileName + "(" + log.getLineNumber() + ") missing fieldbus configuration");
        if (globalInitError.Error === 0) {
          var err = htb.GetError('InvalidConfig');
          globalInitError.Error = err.Error;
          globalInitError.ShortDesc = 'config missed';
          globalInitError.AddDesc = err.AddDesc;
          globalInitError.Timestamp = err.Timestamp;
        }
        node.status({
          fill: "red",
          shape: "dot",
          text: globalInitError.ShortDesc
        });
      }
    } else {
      node.status({
        fill: "red",
        shape: "dot",
        text: globalInitError.ShortDesc
      });
      //test show me that if I send the error at this time the following flow will not get the message. So I searched for a solution of that and found
      //https://groups.google.com/forum/#!msg/node-red/Cv22qtg1ltk/yPpdo4-8zYsJ and https://github.com/node-red/node-red/wiki/API-Reference (look for RED.events)
      //Which stated out that node-RED will send some interesting events
      //var msg = {
      //  topic: this.selectedSignalPath,
      //  payload: { "error": 0, "timestamp": undefined, "value": undefined }
      //};
      //msg.payload.timestamp = new Date().getTime();
      //msg.payload.error = globalInitError.Error;
      //log.HilLog(getFileName, log.getLineNumber(), "IN_NODE send: [" + JSON.stringify(msg) + "]", "error");
      ////TODO this message is not seen in a flow ???!!!!!
      //node.send(msg);
    }
    node.on("close", function () {
      //close event (stop flows) from NodeRED. Clear all as fast as possible
      if (RED.settings.verbose) { node.log(RED, ("IN_NODE stopped")); }
      if (node.fieldbusConnection !== undefined) {
        node.fieldbusConnection.deleteSignalSubscription(node.id);
        node.fieldbusConnection.disconnect(node.id);
      }
      var req = { 'id': node.id };
      fieldbusDLL.deleteReference(req);
      node.nodeIsStarted = false;
      console.log("EVENT(close) this.nodeIsStarted = " + node.nodeIsStarted);
      //after a deploy the globalInitError no openDll and testForUninitializedCifX is called. So this var could not change even if the circumstances 
      //on the gateway has changed in this case node-RED should be restartet
      //make sure after restarting things could work
      if (globalInitError.Error === 0x80001009) {
        globalInitError = { "Error": 0, "Module": undefined, "AddDesc": undefined, "ShortDesc": undefined };
      }
    });
    RED.events.on("nodes-started", function () {
      console.log("EVENT(nodes-started) this.nodeIsStarted = " + node.nodeIsStarted);
      if (node.nodeIsStarted === false) {
        //could be used to send a message once at start time
        node.nodeIsStarted = true;
        var msg = {
          topic: node.selectedSignalPath,
          payload: { "error": 0, "timestamp": undefined, "value": undefined }
        };
        if (globalInitError.Error !== 0) {
          console.log("IN_NODE: node=" + JSON.stringify(node));
          msg.payload.timestamp = new Date().getTime();
          msg.payload.error = globalInitError.Error;
          msg.payload.value = 0;
          msg.payload.datatype = 0;
          if (globalInitError.AddDesc !== undefined) {
            msg.payload.add_desc = node.id + ": " + globalInitError.AddDesc;
          }
          log.HilLog(getFileName, log.getLineNumber(), "IN_NODE uid: [" + node.id + "] 'sendMsg' [error:0x" + msg.payload.error.toString(16) + ", AddDesc:" + msg.payload.add_desc + "]", "error");
          //node.error();
          node.send(msg);
        } else {
          if (node.fieldbusConnection) {
            var err = node.fieldbusConnection.getLastError();
            if (err.Error !== 0) {
              //PM wish a long value, not a string
              msg.payload.timestamp = new Date().getTime();
              msg.payload.error = err.Error;
              msg.payload.add_desc = err.AddDesc;
              msg.payload.value = 0;
              msg.payload.datatype = 0;
              log.HilLog(getFileName, log.getLineNumber(), "IN_NODE uid: [" + node.id + "] 'sendMsg' [error:0x" + msg.payload.error.toString(16) + ", AddDesc:" + msg.payload.add_desc + "]", "error");
              node.send(msg);
            }
          }
        }
      }
    });
  }

  /* The OUTPUT Node */
  function FieldbusOutNode(fbOutHTMLVars) {
    RED.nodes.createNode(this, fbOutHTMLVars);
    var node = this;
    node.fieldbusObj = fbOutHTMLVars.fieldbusObj;
    node.selectedSignalPath = fbOutHTMLVars.selectedSignalPath;
    node.fbCfgNode = RED.nodes.getNode(fbOutHTMLVars.fieldbusObj);
    console.log("FieldbusInNode() this.nodeIsStarted = " + node.nodeIsStarted);
    //var events = require("../../../red");

    if (globalInitError.Error === 0) {
      if (node.fbCfgNode) {
        log.HilLog(getFileName, log.getLineNumber(), "OUT_NODE (" + node.id + "):: (CREATE)", "info");
        log.HilLog(getFileName, log.getLineNumber(), "OUT_NODE node.fbCfgNode=(" + JSON.stringify(node.fbCfgNode) + ")", "info");
        var itfComponents = node.fbCfgNode.itfComponents;
        if (itfComponents && typeof (itfComponents) === 'string') {
          itfComponents = JSON.parse(itfComponents);
        }
        var obj = connectionPool.findFirmware(RED, itfComponents, 'out');
        if (obj.BoardObj === undefined) {
          log.HilLog(getFileName, log.getLineNumber(), "OUT_NODE:: Firmware (" + itfComponents.prtName +
            ": " + itfComponents.className + ": " + itfComponents.boardName +
            ") not found. Set Node (" + node.id + ") to state 'wrong firmware'", "error");
          node.status({
            fill: "red",
            shape: "dot",
            text: "cifX not found"
          });
        } else {
          var fieldbusOptions = {
            readCycle: localFieldbusSettings.readCycle,
            interfaceComponents: itfComponents,
            selectedSignalPath: node.selectedSignalPath,
            clearOutputsOnDeploy: node.fbCfgNode.clearOutputsOnDeploy,
            config_node_id: node.fbCfgNode.id,
            uid: node.id
          };
          node.fieldbusConnection = connectionPool.getConnection(RED, fieldbusOptions, false, obj.ErrorObj);
          if (obj.ErrorObj.Error !== 0) {
            node.status({
              fill: "red",
              shape: "dot",
              text: "wrong firmware"
            });
          } else {
            if (signalPathIsValid(node.selectedSignalPath, localFieldbusSettings.separatorToken)) {
              this.status({
                fill: "grey",
                shape: "ring",
                text: "Initializing"
              });
              if (node.fieldbusConnection) {
                node.on("input", function (msg) {
                  if (!msg.topic || msg.topic === "") {
                    msg.topic = node.selectedSignalPath;
                  }
                  log.HilLog(getFileName, log.getLineNumber(), "OUT_NODE msg:" + JSON.stringify(msg), "info");
                  if (msg.hasOwnProperty("payload")) {
                    if (typeof (msg.payload) === "object" || typeof (msg.payload) === "string" || typeof (msg.payload) === "number") {
                      node.fieldbusConnection.publish(msg); // send the message
                    } else {
                      node.warn("Invalid msg.payload specified");
                    }
                  } else {
                    node.warn("Invalid msg.payload specified");
                  }
                });
              } else {
                log.HilLog(getFileName, log.getLineNumber(), "OUT_NODE ERROR: No connection available!", "error");
              }
              node.fieldbusConnection.on("error", function (uid, errorObj) {
                if (uid === node.id) {
                  var msg = "OUT_NODE uid: [" + uid + "] 'error': " + JSON.stringify(errorObj);
                  node.fieldbusConnection.setLastError(errorObj, getFileName, log.getLineNumber());
                  node.status({
                    fill: "red",
                    shape: "ring",
                    text: "Stopped"
                  });
                }
              });
              node.fieldbusConnection.on("disabled", function (uid) {
                if (uid === node.id) {
                  log.HilLog(getFileName, log.getLineNumber(), "OUT_NODE uid: [" + uid + "] 'disabled'", "warn");
                  node.status({
                    fill: "grey",
                    shape: "ring",
                    text: "Disabled"
                  });
                }
              });
              node.fieldbusConnection.on("channelIsOpen", function (uid) {
                if (uid === node.id) {
                  log.HilLog(getFileName, log.getLineNumber(), "OUT_NODE uid: [" + uid + "] 'channelIsOpen'", "info");
                  node.status({
                    fill: "yellow",
                    shape: "ring",
                    text: "Ready"
                  });
                }
              });
              node.fieldbusConnection.on("restartError", function (uid, errorObj) {
                if (uid === node.id) {
                  node.fieldbusConnection.setLastError(errorObj, getFileName, log.getLineNumber());
                  node.status({
                    fill: "red",
                    shape: "ring",
                    text: "Device error"
                  });
                }
              });
              node.fieldbusConnection.on("communicationIsRunning", function (uid) {
                if (uid === node.id) {
                  log.HilLog(getFileName, log.getLineNumber(), "OUT_NODE uid: [" + uid + "] 'communicationIsRunning'", "info");
                  node.status({
                    fill: "green",
                    shape: "dot",
                    text: "Communicating"
                  });
                }
              });
              node.fieldbusConnection.on("busON", function (uid) {
                if (uid === node.id) {
                  log.HilLog(getFileName, log.getLineNumber(), "OUT_NODE uid: [" + uid + "] 'busON'", "info");
                  node.status({
                    fill: "green",
                    shape: "ring",
                    text: "Running"
                  });
                }
              });
              node.fieldbusConnection.on("timeout", function (uid) {
                if (uid === node.id) {
                  //log.HilLog(getFileName, log.getLineNumber(), "OUT_NODE uid: [" + uid + "] 'timeout'", "error");
                  node.status({
                    fill: "red",
                    shape: "ring",
                    text: "Timeout"
                  });
                }
              });
              node.fieldbusConnection.on("disconnect", function (uid) {
                if (uid === node.id) {
                  //log.HilLog(getFileName, log.getLineNumber(), "OUT_NODE uid: [" + uid + "] 'disconnect'", "warn");
                  node.status({
                    fill: "red",
                    shape: "ring",
                    text: "Disconnected"
                  });
                }
              });
              node.fieldbusConnection.on("driveropen", function (uid) {
                if (uid === node.id) {
                  //log.HilLog(getFileName, log.getLineNumber(), "OUT_NODE uid: [" + uid + "] 'driveropen'", "info");
                  node.status({
                    fill: "yellow",
                    shape: "ring",
                    text: "Ready"
                  });
                }
              });
              node.fieldbusConnection.on("waitsignal", function (uid) {
                if (uid === node.id) {
                  //log.HilLog(getFileName, log.getLineNumber(), "OUT_NODE uid: [" + uid + "] 'waitsignal'", "info");
                  node.status({
                    fill: "blue",
                    shape: "ring",
                    text: "Running"
                  });
                }
              });
              node.fieldbusConnection.on("writeok", function (uid) {
                if (uid === node.id) {
                  //log.HilLog(getFileName, log.getLineNumber(), "OUT_NODE uid: [" + uid + "] 'writeok'", "info");
                  node.status({
                    fill: "green",
                    shape: "dot",
                    text: "Communicating"
                  });
                }
              });
              node.fieldbusConnection.on("clearError", function (uid) {
                if (uid === node.id) {
                  //log.HilLog(getFileName, log.getLineNumber(), "OUT_NODE uid: [" + uid + "] 'writeok'", "info");
                  node.status({
                    fill: "green",
                    shape: "ring",
                    text: "Error gone"
                  });
                }
              });
              node.fieldbusConnection.on("writeerror", function (uid, errorObj) {
                if (uid === node.id) {
                  var msg = "OUT_NODE uid: [" + uid + "]" + ' Error [' + JSON.stringify(errorObj) + '] on writing signal.';
                  node.fieldbusConnection.setLastError(errorObj, getFileName, log.getLineNumber());
                  node.status({
                    fill: "red",
                    shape: "ring",
                    text: "Error"
                  });
                }
              });
              if (node.fieldbusConnection.isRunning()) {
                node.status({
                  fill: "green",
                  shape: "dot",
                  text: "Communicating"
                });
              } else {
                if (node.fieldbusConnection.connectionInitError === 0) {
                  node.fieldbusConnection.connect();
                }
              }
            } else {
              var errObj = htb.GetError('SignalInvalid');
              errObj.AddDesc = errObj.AddDesc.replace('@1', node.selectedSignalPath);
              node.fieldbusConnection.setLastError(errObj, getFileName, log.getLineNumber());
              node.error(getFileName + "(" + log.getLineNumber() + ") signal path is invalid");
              node.status({
                fill: "red",
                shape: "dot",
                text: "Signal invalid"
              });
            }
          }
        }
      } else {
        node.error(getFileName + "(" + log.getLineNumber() + ") missing fieldbus configuration");
        if (globalInitError.Error === 0) {
          var err = htb.GetError('InvalidConfig');
          globalInitError.Error = err.Error;
          globalInitError.ShortDesc = 'config missed';
          globalInitError.AddDesc = err.AddDesc;
          globalInitError.Timestamp = err.Timestamp;
        }
        node.status({
          fill: "red",
          shape: "dot",
          text: globalInitError.ShortDesc
        });
      }
    } else {
      node.status({
        fill: "red",
        shape: "dot",
        text: globalInitError.ShortDesc
      });
    }
    node.on("close", function () {
      //close event (stop flows) from NodeRED. Clear all as fast as possible
      if (RED.settings.verbose) { node.log(RED, ("OUT_NODE stopped")); }
      if (node.fieldbusConnection !== undefined) {
        node.fieldbusConnection.disconnect(node.id);
      }
      if (globalInitError.Error === 0x80001009) {
        globalInitError = { "Error": 0, "Module": undefined, "AddDesc": undefined, "ShortDesc": undefined };
      }
      //make sure after restarting things could work
      //after a deploy the globalInitError no openDll and testForUninitializedCifX is called. So this var could not change even if the circumstances on the gateway has changed
      //in this case node-RED should be restartet
      //globalInitError = { "Error": 0, "Module": undefined, "AddDesc": undefined };
    });
    RED.events.on("nodes-started", function () {
      //for an output node it does not make sens to send a message!
      //could be used to sent a message once at start time
      //if (globalInitError.Error !== 0) {
      //  console.log("OUT_NODE: All nodes have started");
      //  var msg = {
      //    topic: this.selectedSignalPath,
      //    payload: { "error": 0, "timestamp": undefined, "value": undefined }
      //  };
      //  msg.payload.timestamp = new Date().getTime();
      //  msg.payload.error = globalInitError.Error;
      //  msg.payload.value = '';
      //  msg.payload.datatype = '';
      //  log.HilLog(getFileName, log.getLineNumber(), "IN_NODE send: [" + JSON.stringify(msg) + "]", "error");
      //  //TODO this message is not seen in a flow ???!!!!!
      //  node.send(msg);
      //}
    });
  }
  /*
   * START Node-RED EVENTS
   */

  /*
   * START REQUESTS from html page
   * ATTENTION: These requests are totally asynchron to any other call currently performed by the fieldbusHandler!!
  */

  RED.httpAdmin.get("/clearLastError", RED.auth.needsPermission("fieldbus.read"), function (req, res) {
    log.HilLog(getFileName, log.getLineNumber(), "/clearLastError called. Return: " + JSON.stringify(req.query), "info");
    var connection = connectionPool.searchConnection(RED, req.query.uid);
    if (connection) {
      connection.setLastError(undefined);
    } else {
      log.HilLog(getFileName, log.getLineNumber(), "/getActError uid(" + req.query.uid + ") not found ", "error");
    }
    res.json("done");
  });
  
  RED.httpAdmin.get("/getActError", RED.auth.needsPermission("fieldbus.read"), function (req, res) {
    var errorData = {"Error": undefined, "AddDesc": undefined, "Timestamp": undefined };
    if (globalInitError.Error) {
      errorData = globalInitError;
    } else {
      var connection = connectionPool.searchConnection(RED, req.query.uid);
      if (connection) {
        errorData = connection.getLastError();
      } else {
        log.HilLog(getFileName, log.getLineNumber(), "/getActError uid(" + req.query.uid + ") not found ", "error");
      }
    }
    log.HilLog(getFileName, log.getLineNumber(), "/getActError called. Return: " + JSON.stringify(errorData), "debug");
    res.json(errorData);
  });

  RED.httpAdmin.get("/getVersionInfo", RED.auth.needsPermission("fieldbus.read"), function (req, res) {
    printVersionData(versionData);
    log.HilLog(getFileName, log.getLineNumber(), "/getVersionInfo called. Return: " + JSON.stringify(versionData), "info");
    res.json(versionData);
  });

  RED.httpAdmin.get("/getCifXInfo", RED.auth.needsPermission("fieldbus.read"), function (req, res) {
    log.HilLog(getFileName, log.getLineNumber(), "START fieldbusDLL.getCifXInfo req=" + JSON.stringify(req.query), "debug");
    fieldbusDLL.getCifXInfo(req.query, function (locerror, data) {
      if (locerror) {
        log.HilLog(getFileName, log.getLineNumber(), "Error in getCifXInfo = " + JSON.stringify(locerror), "error");
        res.json(locerror);
      } else {
        //log.HilLog(getFileName, log.getLineNumber(), "getCifXInfo Response data =" + JSON.stringify(data), "debug");
        if (data.ResponseVersion === 1) {
          printBoardList(data.Boards);
          res.json(data.Boards);
        } else {
          res = returnVersionError("getCifXInfo", log.getLineNumber(), data.ResponseVersion, 1);
        }
      }
    });
  });

  RED.httpAdmin.get("/getCifXChannelInfo", RED.auth.needsPermission("fieldbus.read"), function (req, res) {
    //1 Output in Chrom: jquery-1.11.1.min.js:4 GET http://127.0.0.1:1880/cifxnames 400 (Bad Request)
    //2 Output in console: TypeError: Converting circular structure to JSON
    log.HilLog(getFileName, log.getLineNumber(), "START fieldbusDLL.getCifXChannelInfo req=" + JSON.stringify(req.query), "debug");
    req.query.request = 64;
    fieldbusDLL.getCifXChannelInfo(req.query, function (locerror, data) {
      if (locerror) {
        log.HilLog(getFileName, log.getLineNumber(), "Error in getCifXChannelInfo = " + JSON.stringify(locerror), "error");
        res.json(locerror);
      } else {
        log.HilLog(getFileName, log.getLineNumber(), "getCifXChannelInfo Response data =" + JSON.stringify(data), "debug");
        if (data.ResponseVersion === 1) {
          res.json(data);
        } else {
          res = returnVersionError("getCifXChannelInfo", log.getLineNumber(), data.ResponseVersion, 1);
        }
      }
    });
  });
  
  //RED.httpAdmin.get("/getFirmwareList", RED.auth.needsPermission("fieldbus.read"), function (req, res) {
  //  log.HilLog(getFileName, log.getLineNumber(), "START fieldbusDLL.getFirmwareList req=" + JSON.stringify(req.query), "debug");
  //  req.query.firmwarePath = localFieldbusSettings.osFirmwarePath;
  //  if (req.query.selectedProtocolClassName !== undefined) {
  //    req.query.selectedProtocolClass = htb.GetProtClassNumber(req.query.selectedProtocolClassName);
  //  }
  //  if (req.query.selectedCommunicationClassName !== undefined) {
  //    req.query.selectedCommunicationClass = htb.GetCommClassNumber(req.query.selectedCommunicationClassName);
  //  }
  //  fieldbusDLL.getFirmwareList(req.query, function (locerror, data) {
  //    if (locerror) {
  //      log.HilLog(getFileName, log.getLineNumber(), "Error in getFirmwareList = " + JSON.stringify(locerror), "error");
  //      res.json(locerror);
  //    } else {
  //      //log.HilLog(getFileName, log.getLineNumber(), "getFirmwareList Response data =" + JSON.stringify(data), "debug");
  //      if (data.ResponseVersion === 1) {
  //        addNames2List(data.FirmwareList);
  //        printFirmwareList(data.FirmwareList);
  //        res.json(data.FirmwareList);
  //      } else {
  //        res = returnVersionError("getFirmwareList", log.getLineNumber(), data.ResponseVersion, 1);
  //      }
  //    }
  //  });
  //});
  
  //ATTENTION: This function have an impact to other calls, if the forceDownload property is set
  RED.httpAdmin.get("/renewConfig", RED.auth.needsPermission("fieldbus.read"), function (req, res) {
    log.HilLog(getFileName, log.getLineNumber(), "START fieldbusDLL.renewConfig req=" + JSON.stringify(req.query), "debug");
    req.query.configPath = RED.settings.userDir;
    fieldbusDLL.renewConfig(req.query, function (locerror, data) {
      if (locerror) {
        log.HilLog(getFileName, log.getLineNumber(), "Error in renewConfig = " + JSON.stringify(locerror), "error");
        res.json(locerror);
      } else {
        /* do something with the data and switch the state machine */
        // save the list of known boards for use later on
        //log.HilLog(getFileName, log.getLineNumber(), "renewConfig Response data =" + JSON.stringify(data), "debug");
        if (data.ResponseVersion === 1) {
          printSignalList(data);
          res.json(data);
        } else {
          res = returnVersionError("renewConfig", log.getLineNumber(), data.ResponseVersion, 1);
        }
      }
    });
  });
  
  function convertSingleSignalData2HTML(sep, data, asTable, path) {
    var retSingleSignal = "";
    /* Now insert for each signal all needed data
    */
    path += sep + data.Tag;
    if (asTable === true) {
      retSingleSignal += "<tr>";
      retSingleSignal += "<td>" + data.Tag + "</td>";
      retSingleSignal += "<td>" + data.DataType + "</td>";
      retSingleSignal += "<td>" + data.AddressDpram + "</td>";
      retSingleSignal += "</tr>";
    } else {
      retSingleSignal += '<ul><li>' + data.Tag + '</li><ul>';
      retSingleSignal += '<li>Path:' + path + '</li>';
      retSingleSignal += '<li>Data&nbsp;type:' + data.DataType + '</li>';
      retSingleSignal += '<li>Address&nbsp;offset:' + data.AddressDpram + '</li>';
      retSingleSignal += '</ul></ul>';
    }
    return retSingleSignal;
  }
  function convertModuleData2HTML(thisPath, sep, data, asTable) {
    var retModule = "";
    if (data !== undefined && data.Signals !== undefined && data.Signals.length !== undefined && data.Signals.length > 0) {
      if (asTable === false) {
        retModule = '<ul style=\"list-style-type: none;\"><li>' + data.Tag;
        thisPath += sep + data.Tag;
      }
      for (var nS = 0; nS < data.Signals.length; nS++) {
        /* Now insert for each signal all needed data
        */
        retModule += convertSingleSignalData2HTML(sep, data.Signals[nS], asTable, thisPath);
      }
      if (asTable === false) {
        retModule += "</li></ul>";
      }
    }
    return retModule;
  }
  function convertSignalData2HTML(sep, data, io, asTable) {
    var thisRetData = "";
    if (data.modules !== undefined) {
      if (data.modules.length !== undefined) {
        var outerPath = "";
        /* First insert the column header.
        */
        if (asTable === true) {
          thisRetData += "<tr>";
          thisRetData += "<th>Path</th>";
          thisRetData += "<th>Signal</th>";
          thisRetData += "<th>Type</th>";
          thisRetData += "<th>Offset</th>";
          thisRetData += "</tr>";
        } else {
          thisRetData += '<ul style=\"list-style-type: none;\">' + '<li><span class=\"attributes\"><i class=\"fa fa-folder-close\" ';
          if (io === "input") {
            thisRetData += 'Input&nbsp;Signals'; 
            outerPath = "input" + sep;
          } else {
            thisRetData += 'Output&nbsp;Signals';
            outerPath = "output" + sep;
          }
          thisRetData += '</i></span>'; //leaving an open <div>, <ul> and <li>
        }
        for (var nM = 0; nM < data.modules.length; nM++) {
          var innerPath = outerPath + data.modules[nM].Tag;
          thisRetData += convertModuleData2HTML(innerPath, sep, data.modules[nM], asTable);
        }
        if (asTable === false) {
          thisRetData += "</li></ul></div>";
        }
      }
    }
    return thisRetData;
  }

  //ATTENTION: This function have an impact to other calls, if the forceDownload property is set
  RED.httpAdmin.get("/renewConfig_ex", RED.auth.needsPermission("fieldbus.read"), function (req, res) {
    log.HilLog(getFileName, log.getLineNumber(), "START fieldbusDLL.renewConfig req=" + JSON.stringify(req.query), "debug");
    req.query.configPath = RED.settings.userDir;
    fieldbusDLL.renewConfig(req.query, function (locerror, data) {
      if (locerror) {
        log.HilLog(getFileName, log.getLineNumber(), "Error in renewConfig = " + JSON.stringify(locerror), "error");
        res.json(locerror);
      } else {
        log.HilLog(getFileName, log.getLineNumber(), "renewConfig Response data =" + JSON.stringify(data), "debug");
        if (req.query.asHTML !== undefined && req.query.asHTML === "true") {
          var htmlIn = "";
          var htmlOut = "";
          if (data.signalData !== undefined) {
            if (data.signalData.input !== undefined) {
              htmlIn = convertSignalData2HTML(localFieldbusSettings.separatorToken, data.signalData.input, "input", false);
              //log.HilLog(getFileName, log.getLineNumber(), "HTML IN String:" + htmlIn, "info");
            }
            if (data.signalData.output !== undefined) {
              htmlOut = convertSignalData2HTML(localFieldbusSettings.separatorToken, data.signalData.output, "output", false);
              //log.HilLog(getFileName, log.getLineNumber(), "HTML OUT String:" + htmlOut, "info");
            }
          }
          var json = {"input": htmlIn, "output": htmlOut, "separator": localFieldbusSettings.separatorToken};
          res.json(json);
        } else {
          log.HilLog(getFileName, log.getLineNumber(), "renewConfig res=" + JSON.stringify(data), "debug");
          res.json(data);
        }
      }
    });
  });
  
  RED.httpAdmin.get("/getFieldbusSettings", RED.auth.needsPermission("fieldbus.read"), function (req, res) {
    log.HilLog(getFileName, log.getLineNumber(), "START fieldbusDLL.getFieldbusSettings", "info");
    res.json(localFieldbusSettings);
  });
  
  RED.httpAdmin.get("/createConfigFile", RED.auth.needsPermission("fieldbus.read"), function (req, res) {
    log.HilLog(getFileName, log.getLineNumber(), "START fieldbusDLL.createConfigFile req=" + JSON.stringify(req.query), "debug");
    req.query.configPath = RED.settings.userDir;
    fieldbusDLL.createConfigFile(req.query, function (locerror, data) {
      if (locerror) {
        log.HilLog(getFileName, log.getLineNumber(), "Error in createConfigFile = " + JSON.stringify(locerror), "error");
        res.json(locerror);
      } else {
        log.HilLog(getFileName, log.getLineNumber(), "createConfigFile Response data =" + JSON.stringify(data), "debug");
        if (data.ResponseVersion === 1) {
          if (data.Result === "Created" || data.Result === "Exists") {
            if (data.Result === "Created") {
              log.HilLog(getFileName, log.getLineNumber(), "Empty config file created [" + JSON.stringify(data) + "]", "info");
            }
            //data.fullPath;
            log.HilLog(getFileName, log.getLineNumber(), "localFieldbusSettings:[" + JSON.stringify(localFieldbusSettings) + "]", "info");
            data.localFieldbusSettings = localFieldbusSettings;
          }
          res.json(data);
        } else {
          res = returnVersionError("createConfigFile", log.getLineNumber(), data.ResponseVersion, 1);
        }
      }
    });
    //var data = {'Result': 'Created'};
    //res.json(data);
  });

  //ATTENTION: This function have an impact to other calls, if the forceDownload property is set
  RED.httpAdmin.get("/reconfigureDevice", RED.auth.needsPermission("fieldbus.read"), function (req, res) {
    log.HilLog(getFileName, log.getLineNumber(), "START fieldbusDLL.reconfigureDevice req=" + JSON.stringify(req.query), "debug");
    req.query.configPath = RED.settings.userDir;
    fieldbusDLL.reconfigureDevice(req.query, function (locerror, data) {
      if (locerror) {
        log.HilLog(getFileName, log.getLineNumber(), "Error in reconfigureDevice = " + JSON.stringify(locerror), "error");
        res.json(locerror);
      } else {
        log.HilLog(getFileName, log.getLineNumber(), "reconfigureDevice Response data =" + JSON.stringify(data), "debug");
        if (data.ResponseVersion === 1) {
          res.json(data.Result);
        } else {
          res = returnVersionError("reconfigureDevice", log.getLineNumber(), data.ResponseVersion, 1);
        }
      }
    });
  });

  //ATTENTION: This function have an impact to other calls, if the forceDownload property is set
  RED.httpAdmin.get("/downloadFirmware", RED.auth.needsPermission("fieldbus.read"), function (req, res) {
    log.HilLog(getFileName, log.getLineNumber(), "START fieldbusDLL.downloadFirmware req=" + JSON.stringify(req.query), "debug");
    //find out if a name with version extension is given and cut this extension
    var index = req.query.firmwarePath.lastIndexOf(": Version");
    if (index !== -1) {
      req.query.firmwarePath = req.query.firmwarePath.substr(0, index);
    }
    //find out if a whole path is given or only the file name
    var firmwareComponents = req.query.firmwarePath.split(/\\|\//);
    if (firmwareComponents.length <= 1) {
      //req.query.firmwarePath = __dirname + "/FWPool/" + req.query.firmwarePath;
      req.query.firmwarePath = RED.settings.userDir + "/FWPool/" + req.query.firmwarePath;
    }
    fieldbusDLL.downloadFirmware(req.query, function (locerror, data) {
      if (locerror) {
        log.HilLog(getFileName, log.getLineNumber(), "Error in downloadFirmware = " + JSON.stringify(locerror), "error");
        res.json(locerror);
      } else {
        log.HilLog(getFileName, log.getLineNumber(), "downloadFirmware Response data =" + JSON.stringify(data), "debug");
        if (data.ResponseVersion === 1) {
          res.json(data.Result);
        } else {
          res = returnVersionError("downloadFirmware", log.getLineNumber(), data.ResponseVersion, 1);
        }
      }
    });
  });

  RED.httpAdmin.get("/checkForUnusedBoard", RED.auth.needsPermission("fieldbus.read"), function (req, res) {
    var result = connectionPool.getUnusedBoards(RED);
    log.HilLog(getFileName, log.getLineNumber(), "checkForUnusedBoard return=" + JSON.stringify(result), "debug");
    res.json(result);
  });
  
  RED.httpAdmin.get("/getLocalFieldbusSettings", RED.auth.needsPermission("fieldbus.read"), function (req, res) {
    log.HilLog(getFileName, log.getLineNumber(), "getLocalFieldbusSettings return=" + JSON.stringify(localFieldbusSettings), "debug");
    res.json(localFieldbusSettings);
  });
  
  /*
   * START Printing and helper functions
   */
  function printVersionData(versionData) {
    log.HilLog(getFileName, log.getLineNumber(), "VersionData.actNodeREDVersion = " + JSON.stringify(versionData.nodeREDVersion), "info");
    log.HilLog(getFileName, log.getLineNumber(), "VersionData.usedV8Version = " + JSON.stringify(versionData.usedV8Version), "info");
    log.HilLog(getFileName, log.getLineNumber(), "VersionData.expectedNodeVersion = " + JSON.stringify(versionData.expectedNodeVersion), "info");
    log.HilLog(getFileName, log.getLineNumber(), "VersionData.currentNodeVersion = " + JSON.stringify(versionData.currentNodeVersion), "info");
    log.HilLog(getFileName, log.getLineNumber(), "VersionData.libuvVersion = " + JSON.stringify(versionData.libuvVersion), "info");
    log.HilLog(getFileName, log.getLineNumber(), "VersionData.wrapperVersion = " + JSON.stringify(versionData.wrapperVersion), "info");
    log.HilLog(getFileName, log.getLineNumber(), "VersionData.fieldbusNodeVersion = " + JSON.stringify(versionData.fieldbusNodeVersion), "info");
  }

  function printBoardList(BoardList) {
    log.HilLog(getFileName, log.getLineNumber(), "START PrintBoardList length: " + BoardList.length, "info");
    for (var n = 0; n < BoardList.length; n++) {
      log.HilLog(getFileName, log.getLineNumber(), "Board[" + n + "].cifXName = " + BoardList[n].cifXName, "debug");
      log.HilLog(getFileName, log.getLineNumber(), "Board[" + n + "].serialNumber = " + 
        BoardList[n].selectedSerialNumber, "debug");
      log.HilLog(getFileName, log.getLineNumber(), "Board[" + n + "].deviceNumber = " + 
        BoardList[n].selectedDeviceNumber, "debug");
      for (var nc = 0; nc < BoardList[n].channel.length; nc++) {
        log.HilLog(getFileName, log.getLineNumber(), "Board[" + n + "].channel[" + nc + 
          "].channelId = " + BoardList[n].channel[nc].channelId, "debug");
        log.HilLog(getFileName, log.getLineNumber(), "Board[" + n + "].channel[" + nc + 
          "].channelNumber = " + BoardList[n].channel[nc].channelNumber, "debug");
        log.HilLog(getFileName, log.getLineNumber(), "Board[" + n + "].channel[" + nc + 
          "].channelType = " + BoardList[n].channel[nc].channelType, "debug");
        BoardList[n].channel[nc].channelTypeName = htb.getChannelTypeName(BoardList[n].channel[nc].channelType);
        log.HilLog(getFileName, log.getLineNumber(), "Board[" + n + "].channel[" + nc + 
          "].selectedCommunicationClass = " + BoardList[n].channel[nc].selectedCommunicationClass, "debug");
        BoardList[n].channel[nc].selectedCommunicationClassName = htb.GetCommClassName(BoardList[n].channel[nc].selectedCommunicationClass, true);
        log.HilLog(getFileName, log.getLineNumber(), "Board[" + n + "].channel[" + nc + 
          "].selectedProtocolClass = " + BoardList[n].channel[nc].selectedProtocolClass, "debug");
        BoardList[n].channel[nc].selectedProtocolClassName = htb.GetProtClassName(BoardList[n].channel[nc].selectedProtocolClass, true);
        if (BoardList[n].channel[nc].channelFWName !== undefined) {
          log.HilLog(getFileName, log.getLineNumber(), "Board[" + n + "].channel[" + nc + 
          "].channelFWName = " + BoardList[n].channel[nc].channelFWName, "debug");
          log.HilLog(getFileName, log.getLineNumber(), "Board[" + n + "].channel[" + nc + 
          "].channelFWVersionMajor = " + BoardList[n].channel[nc].channelFWVersionMajor, "debug");
          log.HilLog(getFileName, log.getLineNumber(), "Board[" + n + "].channel[" + nc + 
          "].channelFWVersionMinor = " + BoardList[n].channel[nc].channelFWVersionMinor, "debug");
          log.HilLog(getFileName, log.getLineNumber(), "Board[" + n + "].channel[" + nc + 
          "].channelFWVersionRevision = " + BoardList[n].channel[nc].channelFWVersionRevision, "debug");
          log.HilLog(getFileName, log.getLineNumber(), "Board[" + n + "].channel[" + nc + 
          "].channelFWVersionBuild = " + BoardList[n].channel[nc].channelFWVersionBuild, "debug");
        }
      }
    }
    log.HilLog(getFileName, log.getLineNumber(), "END PrintBoardList", "info");
  }

  function printModuleList(str, moduleArray, n) {
    str = str + n + "].Tag(" + moduleArray[n].Tag + "): desc(" + moduleArray[n].Description + ")";
    if (moduleArray[n].submodules !== undefined) {
      for (var nSub = 0; nSub < moduleArray[n].submodules.length; nSub++) {
        printModuleList(str, moduleArray[n].submodules, nSub);
      }
    }
    if (moduleArray[n].Signals !== undefined) {
      for (var nSig = 0; nSig < moduleArray[n].Signals.length; nSig++) {
        log.HilLog(getFileName, log.getLineNumber(), str + ".Tag = " + 
          moduleArray[n].Signals[nSig].Tag, "debug");
        log.HilLog(getFileName, log.getLineNumber(), str + ".DataType = " + 
          moduleArray[n].Signals[nSig].DataType, "debug");
        log.HilLog(getFileName, log.getLineNumber(), str + ".Description = " + 
          moduleArray[n].Signals[nSig].Description, "debug");
      }
    }
  }
  
  function printSignalList(SignalList) {
    log.HilLog(getFileName, log.getLineNumber(), 
      "START PrintSignalList", "info");
    log.HilLog(getFileName, log.getLineNumber(), 
      "packetChecksumChanged = " + SignalList.packetChecksumChanged, "debug");
    log.HilLog(getFileName, log.getLineNumber(), 
      "inputChecksumChanged = " + SignalList.inputChecksumChanged, "debug");
    log.HilLog(getFileName, log.getLineNumber(), 
      "outputChecksumChanged = " + SignalList.outputChecksumChanged, "debug");
    log.HilLog(getFileName, log.getLineNumber(), 
      "protocolClass = " + SignalList.protocolClass, "debug");
    log.HilLog(getFileName, log.getLineNumber(), 
      "communicationClass = " + SignalList.communicationClass, "debug");
    log.HilLog(getFileName, log.getLineNumber(), 
      "majorVersion = " + SignalList.majorVersion, "debug");
    log.HilLog(getFileName, log.getLineNumber(), 
      "minorVersion = " + SignalList.minorVersion, "debug");
    log.HilLog(getFileName, log.getLineNumber(), 
      "revision = " + SignalList.revision, "debug");
    log.HilLog(getFileName, log.getLineNumber(), 
      "toolInfo = " + SignalList.toolInfo, "debug");
    if (SignalList && SignalList.signalData.input !== undefined) {
      if (SignalList.signalData.input.modules) {
        for (var n1 = 0; n1 < SignalList.signalData.input.modules.length; n1++) {
          printModuleList("input.modules[", SignalList.signalData.input.modules, n1);
        }
      }
    } else {
      log.HilLog(getFileName, log.getLineNumber(), "NO input list available", "warn");
    }
    if (SignalList && SignalList.signalData.output !== undefined) {
      if (SignalList.signalData.output.modules) {
        for (var n2 = 0; n2 < SignalList.signalData.output.modules.length; n2++) {
          printModuleList("output.modules[", SignalList.signalData.output.modules, n2);
        }
      }
    }
    log.HilLog(getFileName, log.getLineNumber(), "END PrintSignalList", "info");
  }

  function returnVersionError(fnc, line, givenVersion, expectedVersion) {
    var locError = {};
    locError.Error = 1;
    locError.Module = getFileName;
    locError.Line = line;
    locError.AddDesc = "The response in function [" + fnc + "] is [" + givenVersion + "]. Expected is [" + 
    expectedVersion + "]";
    return JSON.stringify(locError);
  }
  
  function addNames2List(firmwareList) {
    for (var n = 0; n < firmwareList.length; n++) {
      firmwareList[n].protocolClassName = htb.GetProtClassName(firmwareList[n].selectedProtocolClass, true);
      firmwareList[n].communicationClassName = htb.GetCommClassName(firmwareList[n].selectedCommunicationClass, true);
    }
  }
  
  function printFirmwareList(firmwareList) {
    log.HilLog(getFileName, log.getLineNumber(), "START PrintFirmwareList.length: " + 
      firmwareList.length, "info");
    for (var n = 0; n < firmwareList.length; n++) {
      if (firmwareList[n].protocolClassName !== undefined) {
        log.HilLog(getFileName, log.getLineNumber(), "firmwareList[" + n + "].protocolClassName = " + 
        firmwareList[n].protocolClassName, "debug");
      }
      if (firmwareList[n].communicationClassName !== undefined) {
        log.HilLog(getFileName, log.getLineNumber(), "firmwareList[" + n + "].communicationClassName = " + 
        firmwareList[n].communicationClassName, "debug");
      }
      log.HilLog(getFileName, log.getLineNumber(), "firmwareList[" + n + "].path = " + 
        firmwareList[n].path, "debug");
      log.HilLog(getFileName, log.getLineNumber(), "firmwareList[" + n + "].selectedCommunicationClass = " + 
        firmwareList[n].selectedCommunicationClass, "debug");
      log.HilLog(getFileName, log.getLineNumber(), "firmwareList[" + n + "].selectedProtocolClass = " + 
        firmwareList[n].selectedProtocolClass, "debug");
    }
    log.HilLog(getFileName, log.getLineNumber(), "END PrintFirmwareList", "info");
  }

  function signalPathIsValid(path, token) {
    if (path !== undefined &&
      path !== null &&
      path !== "" &&
      path !== "none" &&
      path.indexOf(token) >= 0 &&
      (path.indexOf("input") >= 0 || path.indexOf("output") >= 0)) {
      return true;
    }
    return false;
  }






  function test() {
  }




}; //module.exports = function (RED) {