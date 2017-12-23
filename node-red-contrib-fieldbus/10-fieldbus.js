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
  "nodeREDVersion": { "name": "Node-RED version", "val": undefined },
  "actNodeCycleTime": {"name": "Internal node cycle", "val": undefined},
  "wrapperTraceLevel": { "name": "Trace level for Wrapper", "val": undefined},
  "nodeTraceLevel": { "name": "Trace level for fieldbus node", "val": undefined}
};

module.exports = function (RED) {
  "use strict";
  var getFileName = "10-fieldbus.js";
  var log = require("./lib/HilscherLog");
  var connectionPool = require("./lib/fieldbusConnectionPool");
  var fs = require("fs");
  var globalInitError = 0;
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
  
  function loadPNIO(board, fw, callback) {
    //find out if a name with version extension is given and cut this extension
    var Query = {
      "selectedBoardName": board.cifXName,
      "firmwarePath": fw.path
    };
    //find out if a whole path is given or only the file name
    var firmwareComponents = Query.firmwarePath.split(/\\|\//);
    if (firmwareComponents.length <= 1) {
      Query.firmwarePath = RED.settings.userDir + "/FWPool/" + Query.firmwarePath;
    }
    log.HilLog(getFileName, log.getLineNumber(), "Start download PNIO firmware", "info");
    fieldbusDLL.downloadFirmware(Query, function (locerror, data) {
      if (locerror) {
        log.HilLog(getFileName, log.getLineNumber(), "download PNIO error" + JSON.stringify(locerror), "info");
        callback(locerror);
      } else {
        if (data.ResponseVersion === 1) {
          log.HilLog(getFileName, log.getLineNumber(), "download PNIO success", "info");
          callback(undefined, data.Result);
        } else {
          log.HilLog(getFileName, log.getLineNumber(), "download PNIO error version", "info");
          callback("downloadFirmware return an unexpected ResponsVersion of: " + data.ResponseVersion);
        }
      }
    });
  }
 
  function getEmptyBoard(BoardList) {
    var n = 0;
    var retArray = [];
    BoardList.forEach(function (boardItem, bIndex) {
      var nc = 0;
      for (nc = 0; nc < boardItem.channel.length; nc++) {
        if (boardItem.channel[nc].channelFWName !== undefined && boardItem.channel[nc].channelFWName !== "") {
          //this board has a firmware and could be started immediately
          break;
        }
      }
      if (nc >= boardItem.channel.length) {
        log.HilLog(getFileName, log.getLineNumber(), "Board(" + boardItem.cifXName + ") has no firmware", "warn");
        retArray.push(boardItem);
      }
    });
    var logString = '';
    for (n = 0; n < retArray.length; n++) {
      if (logString === '') {
        logString += "The board(s) [";
      } else {
        logString += ", ";
      }
      logString += BoardList[n].cifXName;
    }
    if (logString !== '') {
      logString += "] does not have a firmware";
      log.HilLog(getFileName, log.getLineNumber(), logString, "warn");
    }
    return retArray;
  }
  
  function searchEmptyCifX(callback) {
    var Query = {
      "selectedProtocolClass": 0,         //return all protocol classes
      "selectedCommunicationClass": 0,    //return all communication classes
      "selectedBoardName": ""             //return informations for all boards
    };
    log.HilLog(getFileName, log.getLineNumber(), "Start searchEmptyCifX", "info");
    fieldbusDLL.getCifXInfo(Query, function (locerror, data) {
      if (locerror) {
        log.HilLog(getFileName, log.getLineNumber(), "Start searchEmptyCifX error: " + JSON.stringify(locerror), "info");
        callback(locerror);
      } else {
        //log.HilLog(getFileName, log.getLineNumber(), "getCifXInfo Response data =" + JSON.stringify(data), "debug");
        if (data.ResponseVersion === 1) {
          var emptyBoards = getEmptyBoard(data.Boards);
          if (emptyBoards.length !== 0) {
            log.HilLog(getFileName, log.getLineNumber(), "searchEmptyCifX Boards(" + emptyBoards.length + ") found", "info");
            callback(undefined, emptyBoards);
          } else {
            data.Boards.forEach(function (boardItem, bIndex) {
              connectionPool.addBoard(boardItem);
            });
            callback(undefined, null); //this is not an error
          }
        } else {
          callback("getCifXInfo ResponseVersion [" + data.ResponseVersion + "] unexpected");
        }
      }
    });
  }
  
  function selectPNIOFirmware(firmwareList) {
    for (var n = 0; n < firmwareList.length; n++) {
      var ccNameStruct = htb.GetProtClassName(firmwareList[n].selectedProtocolClass);
      if (ccNameStruct.name === "COMM_CLASS_IO_DEVICE" &&
          ccNameStruct.name === "PROT_CLASS_PROFINET_IO") {
        log.HilLog(getFileName, log.getLineNumber(), "PNIO path [" + firmwareList[n].path + "] found", "info");
        return firmwareList[n];
      }
    }
    return undefined;
  }
  
  function getPNIOPath(board, callback) {
    //req.query.firmwarePath = __dirname + "/FWPool";
    var Query = {
      "selectedBoardName": board.cifXName,
      "firmwarePath": localFieldbusSettings.osFirmwarePath,
      "validateHWOptions": true
    };
    fieldbusDLL.getFirmwareList(Query, function (locerror, data) {
      if (locerror) {
        callback(locerror);
      } else {
        //log.HilLog(getFileName, log.getLineNumber(), "getFirmwareList Response data =" + JSON.stringify(data), "debug");
        if (data.ResponseVersion === 1) {
          var fw = selectPNIOFirmware(data.FirmwareList);
          if (fw !== undefined) {
            callback(undefined, fw);
          } else {
            callback("could not find a PNIO firmware for board [" + board.cifXName + "]");
          }
        } else {
          callback("getFirmwareList return an unexpected ResponsVersion of: " + data.ResponseVersion);
        }
      }
    });
  }
  
  function testForUninitializedCifX(callback) {
    log.HilLog(getFileName, log.getLineNumber(), "Now looking for empty cifX and load them with PNIO", "info");
    searchEmptyCifX(function (err, res) {
      if (err) {
        log.HilLog(getFileName, log.getLineNumber(), "err:" + JSON.stringify(err), "error");
        callback(err);
      } else {
        callback(undefined, res);
      }
    });
  }
  
  function onInitErr(locerror, line) {
    log.HilLog(getFileName, line, "CifX-Node::globalInitError: " + JSON.stringify(locerror), "error");
    globalInitError = locerror.Error;
    return 1;
  }
  
  if (RED.settings.userDir) {
    var userDir = RED.settings.userDir;
    log.HilLog(getFileName, log.getLineNumber(), "Node-RED flow found at: " + userDir, "info");
    file = userDir + "/fieldbusSettings.json";
    console.log("[" + getFileName.info + "] [" + log.getLineNumber().toString().info + "] [Try to load settings file from : ".info + file.info + "]");
    var tmpSettings = "";
    try {
      tmpSettings = fs.readFileSync(file, "utf8");
      localFieldbusSettings = JSON.parse(tmpSettings);
    } catch (error) {
      console.log("[" + getFileName.info + "] [" + log.getLineNumber().toString().info + "]" + " Could not open settings file from(".error + 
        file.info + ") Error:".error + error.error);
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
    if (localFieldbusSettings.webCfgSettings.winOpenUrl) {
      if (localFieldbusSettings.webCfgSettings.winOpenUrl.search('@LOCAL_IP@') !== -1) {
        var ip = require("ip");
        console.log("LOCAL IP-ADDRESS: " + ip.address());
        localFieldbusSettings.webCfgSettings.winOpenUrl = localFieldbusSettings.webCfgSettings.winOpenUrl.replace('@LOCAL_IP@', ip.address());
        console.log('Replace localFieldbusSettings.webCfgSettings.winOpenUrl with: ' + localFieldbusSettings.webCfgSettings.winOpenUrl);
      }
    }
    log.traceLevel = localFieldbusSettings.traceLevel;
    log.HilLog(getFileName, log.getLineNumber(), "Load local settings file:[" + 
        JSON.stringify(localFieldbusSettings) + "] from [" + file + "]", "debug");
    //make sure the trace bits are set in the expected way
    if (localFieldbusSettings.nodeTraceLevel & log.traceEnum.TRACE_DEBUG) {
      log.traceLevel = log.traceEnum.TRACE_DEBUG | log.traceEnum.TRACE_INFO | log.traceEnum.TRACE_WARNING | log.traceEnum.TRACE_ERROR;
    } else if (localFieldbusSettings.nodeTraceLevel & log.traceEnum.TRACE_INFO) {
      log.traceLevel = log.traceEnum.TRACE_INFO | log.traceEnum.TRACE_WARNING | log.traceEnum.TRACE_ERROR;
    } else if (localFieldbusSettings.nodeTraceLevel & log.traceEnum.TRACE_WARNING) {
      log.traceLevel = log.traceEnum.TRACE_WARNING | log.traceEnum.TRACE_ERROR;
    } else if (localFieldbusSettings.nodeTraceLevel & log.traceEnum.TRACE_ERROR) {
      log.traceLevel = log.traceEnum.TRACE_ERROR;
    }
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
      log.HilLog(getFileName, log.getLineNumber(), "Expected firmware path in [" + localFieldbusSettings.osFirmwarePath + "]", "info");
    }
    versionData.actNodeCycleTime.val = localFieldbusSettings.readCycle;
    versionData.wrapperTraceLevel.val = localFieldbusSettings.traceLevel;
    versionData.nodeTraceLevel.val = localFieldbusSettings.nodeTraceLevel;

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
            testForUninitializedCifX(function (err, res) {
              if (err) {
                startNodes(err);
              } else {
                //now load up to 4 boards with the default firmware
                //I could not do this in a loop because in this case the Lint is grumbling and the downloads will start parallel which I dont know 
                //if the wrapper will ever support this.
                if (res && res.length) {
                  getPNIOPath(res[0], function (err, fw) {
                    if (err) {
                      log.HilLog(getFileName, log.getLineNumber(), "err:" + JSON.stringify(err), "error");
                      startNodes(err);
                    } else {
                      loadPNIO(res[0], fw, function (err, res_0) {
                        if (err) {
                          log.HilLog(getFileName, log.getLineNumber(), "err:" + JSON.stringify(err), "error");
                          startNodes(err);
                        } else {
                          testForUninitializedCifX(function (err, res) {
                            if (res && res.length) {
                              loadPNIO(res[0], fw, function (err, res_1) {
                                if (err) {
                                  log.HilLog(getFileName, log.getLineNumber(), "err:" + JSON.stringify(err), "error");
                                  startNodes(err);
                                } else {
                                  testForUninitializedCifX(function (err, res) {
                                    if (res && res.length) {
                                      loadPNIO(res[0], fw, function (err, res_1) {
                                        if (err) {
                                          log.HilLog(getFileName, log.getLineNumber(), "err:" + JSON.stringify(err), "error");
                                          startNodes(err);
                                        } else {
                                          testForUninitializedCifX(function (err, res) {
                                            if (res && res.length) {
                                              loadPNIO(res[0], fw, function (err, res_1) {
                                                if (err) {
                                                  log.HilLog(getFileName, log.getLineNumber(), "err:" + JSON.stringify(err), "error");
                                                  startNodes(err);
                                                } else {
                                                  log.HilLog(getFileName, log.getLineNumber(), "PNIO firmware loaded successfuly. Start state machine!", "info");
                                                  startNodes(undefined, 'loaded');
                                                }
                                              });
                                            } else {
                                              log.HilLog(getFileName, log.getLineNumber(), "PNIO firmware loaded successfuly. Start state machine!", "info");
                                              startNodes(undefined, 'loaded');
                                            }
                                          });
                                        }
                                      });
                                    } else {
                                      log.HilLog(getFileName, log.getLineNumber(), "PNIO firmware loaded successfuly. Start state machine!", "info");
                                      startNodes(undefined, 'loaded');
                                    }
                                  });
                                }
                              });
                            } else {
                              log.HilLog(getFileName, log.getLineNumber(), "PNIO firmware loaded successfuly. Start state machine!", "info");
                              startNodes(undefined, 'loaded');
                            }
                          });
                        }
                      });
                    }
                  });
                } else {
                  startNodes(undefined, 'ok');
                }
              }
            });
          }
        } else {
          log.HilLog(getFileName, log.getLineNumber(), 
            "DLL.setup return a ResponseVersion of [" + 
            data.ResponseVersion + "] expected is [1]. CLOSE NODE!", "error");
        }
      }
    } );
  } else {
    log.HilLog(getFileName, log.getLineNumber(), "No user dir in RED.settings!", "error");
  }
  function startNodes(err, res) {
    if (err) {
      log.HilLog(getFileName, log.getLineNumber(), "Error on initializing cifX cards could not start nodes!", "error");
      globalInitError = err.Error;
    } else {
      log.HilLog(getFileName, log.getLineNumber(), "CifX environment initialized!", "info");
      globalInitError = 0;
    }
    RED.nodes.registerType("fieldbus interface", FieldbusConfigNode);
    RED.nodes.registerType("fieldbus in", FieldbusInNode);
    RED.nodes.registerType("fieldbus out", FieldbusOutNode);
  }
  /*
   * REGISTER my nodes (config, in, out)
   */
  /* The CONFIGURATION Node */
  function FieldbusConfigNode(fbCfgHTMLVars) {
    if (globalInitError === 0) {
      //now test if the firmware on the cifX matches my expected firmware
      log.HilLog(getFileName, log.getLineNumber(), "FieldbusConfigNode (CREATE) config: " + JSON.stringify(fbCfgHTMLVars), "debug");
      this.selectedConfigPath = fbCfgHTMLVars.selectedConfigPath;
      this.expectedInterfaceName = fbCfgHTMLVars.expectedInterfaceName;
      this.selectedChannelNumber = fbCfgHTMLVars.selectedChannelNumber;
      this.selectedDeviceNumber = fbCfgHTMLVars.selectedDeviceNumber;
      this.selectedSerialNumber = fbCfgHTMLVars.selectedSerialNumber;
      this.selectedCommClass = fbCfgHTMLVars.selectedCommClass;
      this.selectedProtocolName = fbCfgHTMLVars.selectedProtocolName;
      this.selectedSignalPath = fbCfgHTMLVars.selectedSignalPath;
      this.fbConfigDataObj = fbCfgHTMLVars.fbConfigDataObj;
      this.clearOutputsOnDeploy = false;
      if (fbCfgHTMLVars.clearOutputsOnDeploy === 'on' || 
          fbCfgHTMLVars.clearOutputsOnDeploy === 'true' ||
          fbCfgHTMLVars.clearOutputsOnDeploy === true) {
        this.clearOutputsOnDeploy = true;
      }
      var self = this;
      var channel = connectionPool.findFirmware(fbCfgHTMLVars.expectedInterfaceName);
      if (channel !== undefined) {
        log.HilLog(getFileName, log.getLineNumber(), "Firmware (" + fbCfgHTMLVars.expectedInterfaceName + ") found. Node can start", "debug");
      } else {
        log.HilLog(getFileName, log.getLineNumber(), "The config node expects a firmware which could not be found on any cifX", 'error');
      }
      RED.nodes.createNode(self, fbCfgHTMLVars);
    } else {
      log.HilLog(getFileName, log.getLineNumber(), "FieldbusConfigNode will not start because " + 
        "of no cifX cards!", "error");
    }
  }
  
  function FieldbusInNode(fbInHtmlVars) {
    RED.nodes.createNode(this, fbInHtmlVars);
    this.fieldbusObj = fbInHtmlVars.fieldbusObj;
    this.selectedSignalPath = fbInHtmlVars.selectedSignalPath;
    this.fbCfgHTMLVars = RED.nodes.getNode(fbInHtmlVars.fieldbusObj);
    var node = this;
    if (this.fbCfgHTMLVars) {
      log.HilLog(getFileName, log.getLineNumber(), "IN_NODE (" + node.id + "):: (CREATE)", "info");
      var req = { 'id': node.id };
      var channelObj = connectionPool.findFirmware(this.fbCfgHTMLVars.expectedInterfaceName);
      if (channelObj === undefined) {
        log.HilLog(getFileName, log.getLineNumber(), "IN_NODE(" + node.id + ") Firmware (" + this.fbCfgHTMLVars.expectedInterfaceName +
          ") not found. Set Node (" + node.id + ") to state 'wrong firmware'", "error");
        node.status({
          fill: "red",
          shape: "dot",
          text: "wrong firmware"
        });
      } else {
        fieldbusDLL.addReference(req);
        node.status({
          fill: "grey",
          shape: "ring",
          text: "initializing"
        });
        log.HilLog(getFileName, log.getLineNumber(), "IN_NODE(" + node.id + "):: selectedSignalPath(" + this.selectedSignalPath + ")", "info");
        //log.HilLog(getFileName, log.getLineNumber(), "config:" + JSON.stringify(this.fbCfgHTMLVars), "debug");
        var fieldbusOptions = {
          readCycle: localFieldbusSettings.readCycle,
          selectedConfigPath: this.fbCfgHTMLVars.selectedConfigPath,
          selectedChannelNumber: this.fbCfgHTMLVars.selectedChannelNumber,
          expectedInterfaceName: this.fbCfgHTMLVars.expectedInterfaceName,
          selectedDeviceNumber: this.fbCfgHTMLVars.selectedDeviceNumber,
          selectedSerialNumber: this.fbCfgHTMLVars.selectedSerialNumber,
          clearOutputsOnDeploy: this.fbCfgHTMLVars.clearOutputsOnDeploy,
          selectedSignalPath: this.selectedSignalPath,
          config_node_id: this.fbCfgHTMLVars.id,
          uid: node.id
        };
        this.fieldbusConnection = connectionPool.getConnection(fieldbusOptions, false);
        if (signalPathIsValid(this.selectedSignalPath, localFieldbusSettings.separatorToken)) {
          node.status({
            fill: "red",
            shape: "ring",
            text: "disconnected"
          });
          this.fieldbusConnection.addSignalSubscription(fieldbusOptions, function (localSignalPath, payload, uid) {
            var time = Date.parse(payload.timestamp);
            log.HilLog(getFileName, log.getLineNumber(), "IN_NODE addSignalSubscription in: UID:" + uid + ", payload:" + 
              JSON.stringify(payload) + ", conv time ==> " + time, "debug");
            var msg = {
              topic: localSignalPath,
              payload: payload
            };
            //PM wish a long value, not a string
            msg.payload.timestamp = time;
            if (uid === node.id) {
              if (payload.error) {
                var errStr = "";
                if (payload.error < 0) {
                  payload.error = payload.error * -1;
                }
                errStr = "ERROR: 0x" + payload.error.toString(16);
                log.HilLog(getFileName, log.getLineNumber(), "IN_NODE uid:" + uid + "] 'CALLBACK' " + errStr, "error");
              }
              if (payload.error === 0) {
                node.status({
                  fill: "green",
                  shape: "dot",
                  text: "Communicating"
                });
              } else {
                node.status({
                  fill: "red",
                  shape: "ring",
                  text: "Error"
                });
              }
            } else {
              log.HilLog(getFileName, log.getLineNumber(), "IN_NODE uid:" + uid + "] != node.id " + node.id, "error");
            }
            log.HilLog(getFileName, log.getLineNumber(), "IN_NODE send(msg:" + JSON.stringify(msg) + ")", (payload.error === 0)?"debug":"error");
            node.send(msg);
          });
          this.fieldbusConnection.on("error", function (uid, msg) {
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
          this.fieldbusConnection.on("disabled", function (uid) {
            if (uid === node.id) {
              log.HilLog(getFileName, log.getLineNumber(), "IN_NODE uid: [" + uid + "] 'disabled'", "warn");
              node.status({
                fill: "grey",
                shape: "ring",
                text: "disabled"
              });
            }
          });
          this.fieldbusConnection.on("channelIsOpen", function (uid) {
            if (uid === node.id) {
              log.HilLog(getFileName, log.getLineNumber(), "IN_NODE uid: [" + uid + "] 'channelIsOpen'", "info");
              node.status({
                fill: "yellow",
                shape: "ring",
                text: "Ready"
              });
            }
          });
          this.fieldbusConnection.on("restartError", function (uid, error) {
            if (uid === node.id) {
              node.fieldbusConnection.setLastError(error.Error, error.AddDesc);
              log.HilLog(getFileName, log.getLineNumber(), "IN_NODE uid: [" + uid + "] 'restartError' [" + error.AddDesc + "]", "error");
              log.HilLog(getFileName, log.getLineNumber(), "fieldbusConnection=" + JSON.stringify(node.fieldbusConnection), "info");
              //PM has decided to disable all outputs to the debug pane
              //if (err) {
              //  node.error(err);
              //}
              node.status({
                fill: "red",
                shape: "ring",
                text: "Device error"
              });
            }
          });
          this.fieldbusConnection.on("communicationIsRunning", function (uid) {
            if (uid === node.id) {
              //node.fieldbusConnection.lastError = 0;
              log.HilLog(getFileName, log.getLineNumber(), "IN_NODE uid: [" + uid + "] 'communicationIsRunning'", "info");
              node.status({
                fill: "green",
                shape: "dot",
                text: "Communicating"
              });
            }
          });
          this.fieldbusConnection.on("busON", function (uid) {
            if (uid === node.id) {
              //node.fieldbusConnection.lastError = 0;
              log.HilLog(getFileName, log.getLineNumber(), "IN_NODE uid: [" + uid + "] 'busON'", "info");
              node.status({
                fill: "green",
                shape: "ring",
                text: "Running"
              });
            }
          });
          this.fieldbusConnection.on("timeout", function (uid, msg) {
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
          this.fieldbusConnection.on("disconnect", function (uid) {
            if (uid === node.id) {
              //log.HilLog(getFileName, log.getLineNumber(), "IN_NODE uid:" + uid + "] 'disconnect'", "warn");
              node.status({
                fill: "red",
                shape: "ring",
                text: "Disconnected"
              });
            }
          });
          this.fieldbusConnection.on("driveropen", function (uid) {
            if (uid === node.id) {
              log.HilLog(getFileName, log.getLineNumber(), "IN_NODE uid: [" + uid + "] 'driveropen'", "info");
              node.status({
                fill: "yellow",
                shape: "ring",
                text: "Ready"
              });
            }
          });
          this.fieldbusConnection.on("clearError", function (uid) {
            if (uid === node.id) {
              //log.HilLog(getFileName, log.getLineNumber(), "OUT_NODE uid: [" + uid + "] 'writeok'", "info");
              node.status({
                fill: "green",
                shape: "ring",
                text: "Error cleared"
              });
            }
          });
          if (this.fieldbusConnection.isRunning()) {
            node.status({
              fill: "green",
              shape: "dot",
              text: "Communicating"
            });
          } else {
            if (this.fieldbusConnection.connectionInitError === 0) {
              this.fieldbusConnection.connect();
            }
          }
        } else {
          this.error(getFileName + "(" + log.getLineNumber() + ") signal path is invalid");
          node.status({
            fill: "red",
            shape: "ring",
            text: "Signal invalid"
          });
        }
      }
    } else {
      this.error(getFileName + "(" + log.getLineNumber() + ") missing fieldbus configuration");
    }
    this.on("close", function () {
      //close event (stop flows) from NodeRED. Clear all as fast as possible
      if (RED.settings.verbose) { this.log(RED, ("IN_NODE stopped")); }
      if (this.fieldbusConnection !== undefined) {
        this.fieldbusConnection.deleteSignalSubscription(node.id);
        this.fieldbusConnection.disconnect(node.id);
      }
      var req = { 'id': node.id };
      fieldbusDLL.deleteReference(req);
    });
  }

  /* The OUTPUT Node */
  function FieldbusOutNode(fbOutHTMLVars) {
    RED.nodes.createNode(this, fbOutHTMLVars);
    this.fieldbusObj = fbOutHTMLVars.fieldbusObj;
    this.selectedSignalPath = fbOutHTMLVars.selectedSignalPath;
    this.fbCfgHTMLVars = RED.nodes.getNode(fbOutHTMLVars.fieldbusObj);
    var node = this;

    if (this.fbCfgHTMLVars) {
      log.HilLog(getFileName, log.getLineNumber(), "OUT_NODE(" + node.id + "):: (CREATE)", "info");
      var channelObj = connectionPool.findFirmware(this.fbCfgHTMLVars.expectedInterfaceName);
      if (channelObj === undefined) {
        log.HilLog(getFileName, log.getLineNumber(), "OUT_NODE:: Firmware (" + this.fbCfgHTMLVars.expectedInterfaceName +
            ") not found. Set Node (" + node.id + ") to state 'wrong firmware'", "error");
        node.status({
          fill: "red",
          shape: "dot",
          text: "wrong firmware"
        });
      } else {
        if (signalPathIsValid(this.selectedSignalPath, localFieldbusSettings.separatorToken)) {
          var fieldbusOptions = {
            readCycle: localFieldbusSettings.readCycle,
            selectedConfigPath: this.fbCfgHTMLVars.selectedConfigPath,
            selectedChannelNumber: this.fbCfgHTMLVars.selectedChannelNumber,
            expectedInterfaceName: this.fbCfgHTMLVars.expectedInterfaceName,
            selectedDeviceNumber: this.fbCfgHTMLVars.selectedDeviceNumber,
            selectedSerialNumber: this.fbCfgHTMLVars.selectedSerialNumber,
            selectedSignalPath: this.selectedSignalPath,
            clearOutputsOnDeploy: this.fbCfgHTMLVars.clearOutputsOnDeploy,
            config_node_id: this.fbCfgHTMLVars.id,
            uid: node.id
          };
          this.status({
            fill: "grey",
            shape: "ring",
            text: "Initializing"
          });
          this.fieldbusConnection = connectionPool.getConnection(fieldbusOptions, false);
          if (this.fieldbusConnection) {
            this.on("input", function (msg) {
              if (!msg.topic || msg.topic === "") {
                msg.topic = this.selectedSignalPath;
              }
              log.HilLog(getFileName, log.getLineNumber(), "OUT_NODE msg:" + JSON.stringify(msg), "info");
              if (msg.hasOwnProperty("payload")) {
                if (typeof (msg.payload) === "object" ||
              typeof (msg.payload) === "string" || 
              typeof (msg.payload) === "number") {
                  this.fieldbusConnection.publish(msg); // send the message
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
          this.fieldbusConnection.on("error", function (uid, error) {
            if (uid === node.id) {
              var msg = "OUT_NODE uid: [" + uid + "] 'error': " + JSON.stringify(error);
              node.fieldbusConnection.setLastError(error.Error, error.AddDesc);
              log.HilLog(getFileName, log.getLineNumber(), msg, "error");
              log.HilLog(getFileName, log.getLineNumber(), "fieldbusConnection=" + JSON.stringify(node.fieldbusConnection), "info");
              //PM has decided to disable all outputs to the debug pane
              //if (error) {
              //  node.error(JSON.stringify(error));
              //}
              node.status({
                fill: "red",
                shape: "ring",
                text: "Stopped"
              });
            }
          });
          this.fieldbusConnection.on("disabled", function (uid) {
            if (uid === node.id) {
              log.HilLog(getFileName, log.getLineNumber(), "OUT_NODE uid: [" + uid + "] 'disabled'", "warn");
              node.status({
                fill: "grey",
                shape: "ring",
                text: "Disabled"
              });
            }
          });
          this.fieldbusConnection.on("channelIsOpen", function (uid) {
            if (uid === node.id) {
              log.HilLog(getFileName, log.getLineNumber(), "OUT_NODE uid: [" + uid + "] 'channelIsOpen'", "info");
              node.status({
                fill: "yellow",
                shape: "ring",
                text: "Ready"
              });
            }
          });
          this.fieldbusConnection.on("restartError", function (uid, error) {
            if (uid === node.id) {
              node.fieldbusConnection.setLastError(error.Error, error.AddDesc);
              log.HilLog(getFileName, log.getLineNumber(), "OUT_NODE uid: [" + uid + "] 'restartError' [" + error.AddDesc + "]", "error");
              log.HilLog(getFileName, log.getLineNumber(), "fieldbusConnection=" + JSON.stringify(node.fieldbusConnection), "info");
              node.status({
                fill: "red",
                shape: "ring",
                text: "Device error"
              });
            }
          });
          this.fieldbusConnection.on("communicationIsRunning", function (uid) {
            if (uid === node.id) {
              log.HilLog(getFileName, log.getLineNumber(), "OUT_NODE uid: [" + uid + "] 'communicationIsRunning'", "info");
              node.status({
                fill: "green",
                shape: "dot",
                text: "Communicating"
              });
            }
          });
          this.fieldbusConnection.on("busON", function (uid) {
            if (uid === node.id) {
              log.HilLog(getFileName, log.getLineNumber(), "OUT_NODE uid: [" + uid + "] 'busON'", "info");
              node.status({
                fill: "green",
                shape: "ring",
                text: "Running"
              });
            }
          });
          this.fieldbusConnection.on("timeout", function (uid) {
            if (uid === node.id) {
              //log.HilLog(getFileName, log.getLineNumber(), "OUT_NODE uid: [" + uid + "] 'timeout'", "error");
              node.status({
                fill: "red",
                shape: "ring",
                text: "Timeout"
              });
            }
          });
          this.fieldbusConnection.on("disconnect", function (uid) {
            if (uid === node.id) {
              //log.HilLog(getFileName, log.getLineNumber(), "OUT_NODE uid: [" + uid + "] 'disconnect'", "warn");
              node.status({
                fill: "red",
                shape: "ring",
                text: "Disconnected"
              });
            }
          });
          this.fieldbusConnection.on("driveropen", function (uid) {
            if (uid === node.id) {
              //log.HilLog(getFileName, log.getLineNumber(), "OUT_NODE uid: [" + uid + "] 'driveropen'", "info");
              node.status({
                fill: "yellow",
                shape: "ring",
                text: "Ready"
              });
            }
          });
          this.fieldbusConnection.on("waitsignal", function (uid) {
            if (uid === node.id) {
              //log.HilLog(getFileName, log.getLineNumber(), "OUT_NODE uid: [" + uid + "] 'waitsignal'", "info");
              node.status({
                fill: "blue",
                shape: "ring",
                text: "Running"
              });
            }
          });
          this.fieldbusConnection.on("writeok", function (uid) {
            if (uid === node.id) {
              //log.HilLog(getFileName, log.getLineNumber(), "OUT_NODE uid: [" + uid + "] 'writeok'", "info");
              node.status({
                fill: "green",
                shape: "dot",
                text: "Communicating"
              });
            }
          });
          this.fieldbusConnection.on("clearError", function (uid) {
            if (uid === node.id) {
              //log.HilLog(getFileName, log.getLineNumber(), "OUT_NODE uid: [" + uid + "] 'writeok'", "info");
              node.status({
                fill: "green",
                shape: "ring",
                text: "Error cleared"
              });
            }
          });
          this.fieldbusConnection.on("writeerror", function (uid, error) {
            if (uid === node.id) {
              var msg = "OUT_NODE uid: [" + uid + "]" + ' Error [' + JSON.stringify(error) + '] on writing signal.';
              node.fieldbusConnection.setLastError(error.Error, error.AddDesc);
              log.HilLog(getFileName, log.getLineNumber(), msg, "error");
              //log.HilLog(getFileName, log.getLineNumber(), "fieldbusConnection=" + JSON.stringify(node.fieldbusConnection), "info");
              //console.log("fieldbusConnection=" + JSON.stringify(node.fieldbusConnection));
              //if (error) {
              //  node.error(JSON.stringify(error));
              //}
              node.status({
                fill: "red",
                shape: "ring",
                text: "Error"
              });
            }
          });
          if (this.fieldbusConnection.isRunning()) {
            node.status({
              fill: "green",
              shape: "dot",
              text: "Communicating"
            });
          } else {
            if (this.fieldbusConnection.connectionInitError === 0) {
              this.fieldbusConnection.connect();
            }
          }
        } else {
          this.error(getFileName + "(" + log.getLineNumber() + ") signal path is invalid");
          node.status({
            fill: "red",
            shape: "dot",
            text: "Signal invalid"
          });
        }
      }
    } else {
      this.error(getFileName + "(" + log.getLineNumber() + ") missing fieldbus configuration");
    }
    this.on("close", function () {
      //close event (stop flows) from NodeRED. Clear all as fast as possible
      if (RED.settings.verbose) { this.log(RED, ("OUT_NODE stopped")); }
      if (this.fieldbusConnection !== undefined) {
        this.fieldbusConnection.disconnect(node.id);
      }
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
    var connection = connectionPool.searchConnection(req.query.uid);
    if (connection) {
      connection.setLastError(0, '');
    } else {
      log.HilLog(getFileName, log.getLineNumber(), "/getActError uid(" + req.query.uid + ") not found ", "error");
    }
    res.json("done");
  });
  
  RED.httpAdmin.get("/getActError", RED.auth.needsPermission("fieldbus.read"), function (req, res) {
    log.HilLog(getFileName, log.getLineNumber(), "/getActError called. Return: " + JSON.stringify(req.query), "info");
    var connection = connectionPool.searchConnection(req.query.uid);
    var errorData = {"Error": undefined, "AddDesc": undefined};
    if (connection) {
      errorData = connection.getLastError();
    } else {
      log.HilLog(getFileName, log.getLineNumber(), "/getActError uid(" + req.query.uid + ") not found ", "error");
    }
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
          printAndModifyBoardList(data.Boards);
          //log.HilLog(getFileName, log.getLineNumber(), "getCifXInfo Response data =" + JSON.stringify(data), "debug");
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
  
  RED.httpAdmin.get("/getFirmwareList", RED.auth.needsPermission("fieldbus.read"), function (req, res) {
    req.query.firmwarePath = localFieldbusSettings.osFirmwarePath;
    log.HilLog(getFileName, log.getLineNumber(), "START fieldbusDLL.getFirmwareList req=" + JSON.stringify(req.query), "debug");
    if (req.query.selectedProtocolClassName !== undefined) {
      req.query.selectedProtocolClass = htb.GetProtClassNumber(req.query.selectedProtocolClassName);
    }
    if (req.query.selectedCommunicationClassName !== undefined) {
      req.query.selectedCommunicationClass = htb.GetCommClassNumber(req.query.selectedCommunicationClassName);
    }
    fieldbusDLL.getFirmwareList(req.query, function (locerror, data) {
      if (locerror) {
        log.HilLog(getFileName, log.getLineNumber(), "Error in getFirmwareList = " + JSON.stringify(locerror), "error");
        res.json(locerror);
      } else {
        //log.HilLog(getFileName, log.getLineNumber(), "getFirmwareList Response data =" + JSON.stringify(data), "debug");
        if (data.ResponseVersion === 1) {
          addNames2List(data.FirmwareList);
          printFirmwareList(data.FirmwareList);
          res.json(data.FirmwareList);
        } else {
          res = returnVersionError("getFirmwareList", log.getLineNumber(), data.ResponseVersion, 1);
        }
      }
    });
  });
  
  //ATTENTION: This function have an impact to other calls, if the forceDownload property is set
  RED.httpAdmin.get("/renewConfig", RED.auth.needsPermission("fieldbus.read"), function (req, res) {
    req.query.configPath = RED.settings.userDir;
    req.query.selectedProtocolClass = htb.GetProtClassNumber(req.query.selectedProtocolClassName);
    req.query.selectedCommunicationClass = htb.GetCommClassNumber(req.query.selectedCommunicationClassName);
    log.HilLog(getFileName, log.getLineNumber(), "START fieldbusDLL.renewConfig req=" + JSON.stringify(req.query), "debug");
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
          //now maybe the connectionPool must be updated with new firmware          
          var Query = {
            "selectedProtocolClass": 0,         //return all protocol classes
            "selectedCommunicationClass": 0,    //return all communication classes
            "selectedBoardName": req.selectedBoardName  //return informations for only this board
          };
          fieldbusDLL.getCifXInfo(Query, function (locerror, infoData) {
            if (locerror) {
              log.HilLog(getFileName, log.getLineNumber(), "fieldbusDLL.getCifXInfo() error: " + JSON.stringify(locerror), "error");
            } else {
              //log.HilLog(getFileName, log.getLineNumber(), "getCifXInfo Response data =" + JSON.stringify(data), "debug");
              if (infoData.ResponseVersion === 1) {
                if (infoData.Boards.length === 1) {
                  //the request has returned a board description. Now find this board in the connection list and update it's firmware name or
                  //if not found add this board into the list
                  connectionPool.addBoard(infoData.Boards[0]);
                }
              }
            }
            //now give the answer to the cliant
            res.json(data);
          });
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
            //now maybe the connectionPool must be updated with new firmware          
            var Query = {
              "selectedProtocolClass": 0,         //return all protocol classes
              "selectedCommunicationClass": 0,    //return all communication classes
              "selectedBoardName": req.selectedBoardName  //return informations for only this board
            };
            fieldbusDLL.getCifXInfo(Query, function (locerror, infoData) {
              if (locerror) {
                log.HilLog(getFileName, log.getLineNumber(), "fieldbusDLL.getCifXInfo() error: " + JSON.stringify(locerror), "error");
              } else {
                //log.HilLog(getFileName, log.getLineNumber(), "getCifXInfo Response data =" + JSON.stringify(data), "debug");
                if (infoData.ResponseVersion === 1) {
                  if (infoData.Boards.length === 1) {
                    //the request has returned a board description. Now find this board in the connection list and update it's firmware name or
                    //if not found add this board into the list
                    connectionPool.addBoard(infoData.Boards[0]);
                  }
                }
              }
              //now give the answer to the cliant
              res.json(data);
            });
          }
          var json = {input:htmlIn, output:htmlOut, separator: localFieldbusSettings.separatorToken};
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
            this.selectedConfigPath = data.fullPath;
            log.HilLog(getFileName, log.getLineNumber(), "localFieldbusSettings:[" + JSON.stringify(localFieldbusSettings) + "]", "info");
            data.localFieldbusSettings = localFieldbusSettings;
          }
          res.json(data);
        } else {
          res = returnVersionError("createConfigFile", log.getLineNumber(), data.ResponseVersion, 1);
        }
      }
    });
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
          //now maybe the connectionPool must be updated with new firmware          
          var Query = {
            "selectedProtocolClass": 0,         //return all protocol classes
            "selectedCommunicationClass": 0,    //return all communication classes
            "selectedBoardName": req.selectedBoardName  //return informations for only this board
          };
          fieldbusDLL.getCifXInfo(Query, function (locerror, infoData) {
            if (locerror) {
              log.HilLog(getFileName, log.getLineNumber(), "fieldbusDLL.getCifXInfo() error: " + JSON.stringify(locerror), "error");
            } else {
              //log.HilLog(getFileName, log.getLineNumber(), "getCifXInfo Response data =" + JSON.stringify(data), "debug");
              if (infoData.ResponseVersion === 1) {
                if (infoData.Boards.length === 1) {
                  //the request has returned a board description. Now find this board in the connection list and update it's firmware name or
                  //if not found add this board into the list
                  connectionPool.addBoard(infoData.Boards[0]);
                }
              }
            }
            //now give the answer to the client
            res.json(data.Result);
          });
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
          //now maybe the connectionPool must be updated with new firmware          
          var Query = {
            "selectedProtocolClass": 0,         //return all protocol classes
            "selectedCommunicationClass": 0,    //return all communication classes
            "selectedBoardName": req.selectedBoardName  //return informations for only this board
          };
          fieldbusDLL.getCifXInfo(Query, function (locerror, infoData) {
            if (locerror) {
              log.HilLog(getFileName, log.getLineNumber(), "fieldbusDLL.getCifXInfo() error: " + JSON.stringify(locerror), "error");
            } else {
              //log.HilLog(getFileName, log.getLineNumber(), "getCifXInfo Response data =" + JSON.stringify(data), "debug");
              if (infoData.ResponseVersion === 1) {
                if (infoData.Boards.length === 1) {
                  //the request has returned a board description. Now find this board in the connection list and update it's firmware name or
                  //if not found add this board into the list
                  connectionPool.updateBoard(infoData.Boards[0]);
                }
              }
            }
            //now give the answer to the client
            res.json(data.Result);
          });
        } else {
          res = returnVersionError("downloadFirmware", log.getLineNumber(), data.ResponseVersion, 1);
        }
      }
    });
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
    log.HilLog(getFileName, log.getLineNumber(), "VersionData.wrapperVersion = " + JSON.stringify(versionData.wrapperVersion ), "info");
    log.HilLog(getFileName, log.getLineNumber(), "VersionData.fieldbusNodeVersion = " + JSON.stringify(versionData.fieldbusNodeVersion), "info");
    log.HilLog(getFileName, log.getLineNumber(), "VersionData.actNodeCycleTime = " + JSON.stringify(versionData.actNodeCycleTime), "info");    
    log.HilLog(getFileName, log.getLineNumber(), "VersionData.wrapperTraceLevel = " + JSON.stringify(versionData.wrapperTraceLevel), "info");
  }

  function printAndModifyBoardList(BoardList) {
    log.HilLog(getFileName, log.getLineNumber(), "START PrintBoardList length: " + BoardList.length, "info");
    for (var n = 0; n < BoardList.length; n++) {
      var board = BoardList[n];
      log.HilLog(getFileName, log.getLineNumber(), "Board[" + n + "].cifXName = " + board.cifXName, "debug");
      log.HilLog(getFileName, log.getLineNumber(), "Board[" + n + "].serialNumber = " + 
        board.selectedSerialNumber, "debug");
      log.HilLog(getFileName, log.getLineNumber(), "Board[" + n + "].deviceNumber = " + 
        board.selectedDeviceNumber, "debug");
      for (var nc = 0; nc < board.channel.length; nc++) {
        var channel = board.channel[nc];
        log.HilLog(getFileName, log.getLineNumber(), "Board[" + n + "].channel[" + nc + 
          "].channelId = " + channel.channelId, "debug");
        log.HilLog(getFileName, log.getLineNumber(), "Board[" + n + "].channel[" + nc + 
          "].channelNumber = " + channel.channelNumber, "debug");
        log.HilLog(getFileName, log.getLineNumber(), "Board[" + n + "].channel[" + nc + 
          "].channelOffset = " + channel.channelOffset, "debug");
        log.HilLog(getFileName, log.getLineNumber(), "Board[" + n + "].channel[" + nc + 
          "].channelType = " + channel.channelType, "debug");
        channel.channelTypeName = htb.getChannelTypeName(channel.channelType);
        log.HilLog(getFileName, log.getLineNumber(), "Board[" + n + "].channel[" + nc + 
          "].selectedCommunicationClass = " + channel.selectedCommunicationClass, "debug");
        channel.selectedCommunicationClassNameStruct = htb.GetCommClassName(channel.selectedCommunicationClass);
        log.HilLog(getFileName, log.getLineNumber(), "Board[" + n + "].channel[" + nc + 
          "].selectedProtocolClass = " + channel.selectedProtocolClass, "debug");
        channel.selectedProtocolClassNameStruct = htb.GetProtClassName(channel.selectedProtocolClass);
        if (channel.channelFWName !== undefined) {
          log.HilLog(getFileName, log.getLineNumber(), "Board[" + n + "].channel[" + nc + 
          "].channelFWName = " + channel.channelFWName, "debug");
          log.HilLog(getFileName, log.getLineNumber(), "Board[" + n + "].channel[" + nc + 
          "].channelFWVersionMajor = " + channel.channelFWVersionMajor, "debug");
          log.HilLog(getFileName, log.getLineNumber(), "Board[" + n + "].channel[" + nc + 
          "].channelFWVersionMinor = " + channel.channelFWVersionMinor, "debug");
          log.HilLog(getFileName, log.getLineNumber(), "Board[" + n + "].channel[" + nc + 
          "].channelFWVersionRevision = " + channel.channelFWVersionRevision, "debug");
          log.HilLog(getFileName, log.getLineNumber(), "Board[" + n + "].channel[" + nc + 
          "].channelFWVersionBuild = " + channel.channelFWVersionBuild, "debug");
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
      firmwareList[n].protocolClassNameStruct = htb.GetProtClassName(firmwareList[n].selectedProtocolClass);
      firmwareList[n].communicationClassNameStruct = htb.GetCommClassName(firmwareList[n].selectedCommunicationClass);
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