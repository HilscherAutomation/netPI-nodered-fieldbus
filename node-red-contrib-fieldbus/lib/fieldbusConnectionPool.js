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
"use strict";
var fieldbus = require("./fieldbusHandler");
var htb = require("./HilscherToolBox");
var settings = {};
var log = require("./HilscherLog");

var getFileName = "fieldbusConnectionPool.js";
var fieldbusHandlerArray = [];
var connections = {};
var connectionsCnt = 0;
var boardArray = [];

function BoardObject(RED, board) {
  this.initError = {'Error': 0, 'AddDesc': undefined, 'Timestamp': undefined};
  this.cifXName = board.cifXName;
  this.supportedProtocolClass = "";
  this.supportedCommunicationClass = "";
  this.supportedProtocolClassName = "";
  this.supportedCommunicationClassName = "";
  this.cntOfConfigNodesUsingIt = 0;
  this.configNodeID = undefined;
  var self = this;
  //log.HilLog(getFileName, log.getLineNumber(), "input: " + JSON.stringify(board), "debug");
  board.channel.forEach(function (item, index) {
    if (htb.GetCommClassName(item.selectedCommunicationClass, true) !== "UNDEFINED"  &&
        htb.GetProtClassName(item.selectedProtocolClass, true) !== "UNDEFINED") {
      self.supportedProtocolClass = item.selectedProtocolClass;
      self.supportedCommunicationClass = item.selectedCommunicationClass;
      self.supportedProtocolClassName = htb.GetProtClassName(item.selectedProtocolClass, true);
      self.supportedCommunicationClassName = htb.GetCommClassName(item.selectedCommunicationClass, true);
    }
  });
  log.HilLog(getFileName, log.getLineNumber(), "CREATE BoardObject(" + this.cifXName + ") PROT(" + 
        this.supportedProtocolClassName + ") COMM(" + this.supportedCommunicationClassName + ") to connectionPool", "info");
}

function findFieldbusHandler(RED, boardName) {
  if (fieldbusHandlerArray) {
    for (var n = 0; n < fieldbusHandlerArray.length; n++) {
      if (fieldbusHandlerArray[n].opt.interfaceComponents.boardName === boardName) {
        return fieldbusHandlerArray[n];
      }
    }
  }
  log.HilLog(getFileName, log.getLineNumber(), "findFieldbusHandler() could not find board: " + boardName + 
    " in Array:" + JSON.stringify(fieldbusHandlerArray), "info");
  return undefined;
}

function deleteFromFieldbusHandlerArray(RED, boardName) {
  if (fieldbusHandlerArray) {
    for (var n = 0; n < fieldbusHandlerArray.length; n++) {
      if (fieldbusHandlerArray[n].opt.interfaceComponents.boardName === boardName) {
        fieldbusHandlerArray[n].removeAllListeners();
        log.HilLog(getFileName, log.getLineNumber(), "fieldbusHandlerArray.remove() Board: " + boardName, "warn");
        delete fieldbusHandlerArray[n];
        fieldbusHandlerArray.splice(n, 1);
        return 1;
      }
    }
  }
  log.HilLog(getFileName, log.getLineNumber(), "deleteFromFieldbusHandlerArray(can not find the FBHandler for Board:" + 
                  boardName + ")", "error");
  return 0;
}

/* Each instance of an input and output Node will call getConnection.
 * Here I will create each time a new connection, if the Node-RED ID is not already in the connection list
 * 
 * Each connection itself will create a new fieldbusHandler which is used to update the signals in this connection 
 * (which will be only one per definition because only one signal could be selected per Node)
 */
module.exports = {
  getConnection: function (RED, opt, fStartFieldbus, errorObj) {
    log.HilLog(getFileName, log.getLineNumber(), "getConnection(fStartFieldbus:" + fStartFieldbus + ")", "info");
    log.HilLog(getFileName, log.getLineNumber(), "getConnection(opt:" + JSON.stringify(opt) + ")", "debug");
    //opt.uid is the NodeID from NodeRED. This ID is different for each instance of a node
    //interfaceComponents.prtName = PROFINET IO
    //interfaceComponents.className = Device
    //interfaceComponents.boardName = cifx0
    if (!connections[opt.uid]) {
      ++connectionsCnt;
      log.HilLog(getFileName, log.getLineNumber(), "Create connection[" + opt.uid + "]", "info");
      connections[opt.uid] = function () {
        //var uid = (1 + Math.random() * 4294967295).toString(16);
        var options = opt || {};
        var connecting = false;
        var lastErrorObj = {'Error':0, 'AddDesc': undefined, 'Timestamp': 0};
        var FBHandler = findFieldbusHandler(RED, opt.interfaceComponents.boardName);
        if (FBHandler === undefined) {
          FBHandler = fieldbus.createFieldbusHandler(opt);
          fieldbusHandlerArray.push(FBHandler);
          FBHandler.setMaxListeners(0);
        } else {
          FBHandler.addInstance(options);
        }
        if (errorObj.Error) {
          log.HilLog(getFileName, log.getLineNumber(), "Create connection[" + opt.uid + "] called with (Error:0x" + errorObj.Error.toString(16) + ", AddDesc:" + errorObj.AddDesc + ")", "error");
          lastErrorObj = errorObj;
        }
        var obj = {
          _instances: 0,
          publish: function (msg) {
            //HP: change 08/23/2016 if I do it the old way we can not insert a value if the communication is not running
            //The change I have made is: A user could insert always a write value, but only one per signal. If the signal was
            //inserted before only the value is updated!
            FBHandler.publish(opt.selectedSignalPath, msg.payload, opt.uid);
          },
          addSignalSubscription: function (opt, callback) {
            //var sub = {
            //  handler: function (topic, payload, uid) {
            //    callback(topic, payload, uid);
            //  }
            //};
            //FBHandler.addSignalSubscription(opt, sub.handler);
            FBHandler.addSignalSubscription(opt, callback);
          },
          deleteSignalSubscription: function (node_id) {
            log.HilLog(getFileName, log.getLineNumber(), "obj.DeleteSignalSubscription(uid:" + node_id + ")", "info");
            FBHandler.deleteSignalSubscription(node_id);
          //delete sub; deleted because of JSHint output "W051"
          },
          on: function (a, b) {
            //log.HilLog(getFileName, log.getLineNumber(), "obj.on(a:" + a + ", b:" + b + ")", "debug");
            FBHandler.on(a, b);
          },
          once: function (a, b) {
            //log.HilLog(getFileName, log.getLineNumber(), "obj.once(a:" + a + ", b:" + b + ")", "debug");
            FBHandler.once(a, b);
          },
          connect: function () {
            //log.HilLog(getFileName, log.getLineNumber(), "obj.connect()", "debug");
            if (FBHandler && !FBHandler.isConnected() && !connecting) {
              connecting = true;
              FBHandler.doStateMachine(false, opt.uid, fStartFieldbus);
            }
          },
          reconnect: function () {
            //log.HilLog(getFileName, log.getLineNumber(), "obj.reconnect()", "debug");
            if (FBHandler && !FBHandler.isConnected() && !connecting) {
              connecting = true;
              FBHandler.doStateMachine(true, opt.uid, fStartFieldbus);
            }
          },
          disconnect: function (uid) {
            if (FBHandler.delInstance(uid) <= 0) {
              deleteFromFieldbusHandlerArray(RED, opt.interfaceComponents.boardName);
            }
            connections[uid].setLastError(undefined);
            delete connections[uid];
            --connectionsCnt;
            log.HilLog(getFileName, log.getLineNumber(), "connection[" + uid + "] removed. ConnectionCnt: " + connectionsCnt, "warn");
          },
          isRunning: function () {
            return FBHandler.isRunning();
          },
          getLastError: function () {
            if (lastErrorObj.Error) {
              log.HilLog(getFileName, log.getLineNumber(), "getLastError[UID:" + opt.uid + "] return: [ Error:" + lastErrorObj.Error + ", 0x" + 
                lastErrorObj.Error.toString(16) + ", AddDesc:" + lastErrorObj.AddDesc + ", Timestamp:" + lastErrorObj.Timestamp + "]", "error");
            }
            return lastErrorObj;
          },
          setLastError: function (errorObj, mod, line) {
            var fLog = false;
            var fSendClearEvent = false;
            if (errorObj) {
              if (lastErrorObj.Error !== errorObj.Error) {
                fLog = true;
              }
              lastErrorObj = errorObj;
            } else {
              if (lastErrorObj.Error !== 0) {
                fLog = true;
                fSendClearEvent = true;
              }
              lastErrorObj.Error = 0;
              lastErrorObj.AddDesc = undefined;
              lastErrorObj.Timestamp = 0;
            }
            if (fLog) {
              log.HilLog(getFileName, log.getLineNumber(), "setLastError[UID:" + opt.uid + "] [ Error:" + lastErrorObj.Error + " 0x" + lastErrorObj.Error.toString(16) + 
              ", AddDesc:" + lastErrorObj.AddDesc + "Timestamp:" + lastErrorObj.Timestamp + "]", "info");
              if (mod && line) {
                log.HilLog(getFileName, log.getLineNumber(), "setLastError[from module:" + mod + ", line:" + line + "]", "info");
              }
            }
            if (fSendClearEvent) {
              FBHandler.sendEvent(opt.uid, 'clearError');
            }
          },
          isConnected: function () {
            return FBHandler.isConnected();
          }
        }; //end obj
        function errorFnc(uid) {
          if (uid === opt.uid) {
            log.HilLog(getFileName, log.getLineNumber(), "error uid:" + uid + " STOPPING NODE", "error");
          }
          connecting = false;
          //PM did'nt want a cyclic reconnection
        }
        function restartErrorFnc(uid, error) {
          if (FBHandler) {
            if (uid === opt.uid) {
              if (error) {
                if (error.add_desc) {
                  log.HilLog(getFileName, log.getLineNumber(), "uid:" + uid + "] 'restartError' [" + error.add_desc + "]", "error");
                } else if (error.AddDesc) {
                  log.HilLog(getFileName, log.getLineNumber(), "uid:" + uid + "] 'restartError' [" + error.AddDesc + "]", "error");
                } else {
                  log.HilLog(getFileName, log.getLineNumber(), "uid:" + uid + "] 'restartError' [" + JSON.stringify(error) + "]", "error");
                }
              } else {
                log.HilLog(getFileName, log.getLineNumber(), "uid:" + uid + "] 'restartError'", "warn");
              }
            }
            connecting = false;
          }
        }
          
        function channelIsOpenFnc(uid) {
          if (FBHandler) {
            if (uid === opt.uid) {
              log.HilLog(getFileName, log.getLineNumber(), "channelIsOpen uid:" + uid + ")", "debug");
            }
            connecting = false;
          }
        }
          
        function communicationIsRunningFnc(uid) {
          if (FBHandler) {
            if (uid === opt.uid) {
              log.HilLog(getFileName, log.getLineNumber(), "communicationIsRunning uid:" + uid + ")", "debug");
            }
          }
        }
          
        function busONFnc(uid) {
          if (FBHandler) {
            if (uid === opt.uid) {
              log.HilLog(getFileName, log.getLineNumber(), "busON uid:" + uid + ")", "debug");
            }
          }
        }
        
        function timeoutFnc(uid) {
          if (FBHandler) {
            if (uid === opt.uid) {
              log.HilLog(getFileName, log.getLineNumber(), "timeout uid:" + uid + ") try reconnect", "warn");
            }
            connecting = false;
            setTimeout(function () {
              obj.reconnect();
            }, settings.fieldbusReconnectTime || 1000); //TODO: Let this time be defined by the user
          }
        }
        FBHandler.on("error", errorFnc);
        FBHandler.on("restartError", restartErrorFnc);
        FBHandler.on("channelIsOpen", channelIsOpenFnc);
        FBHandler.on("communicationIsRunning", communicationIsRunningFnc);
        FBHandler.on("busON", busONFnc);
        FBHandler.on("timeout", timeoutFnc);
        FBHandler.doStateMachine(false, opt.uid, fStartFieldbus);
        return obj;
      }(); //JSHint output. Dont know what JSHint try to tell me
      connections[opt.uid]._instances += 1;
      //log.HilLog(getFileName, log.getLineNumber(), "connectionPool.getConnection(instance:" + 
      //connections[opt.uid]._instances + ")", "debug");
    }
    log.HilLog(getFileName, log.getLineNumber(), "Return connection[" + opt.uid + "]. ConnectionCnt: " + connectionsCnt, "info");
    return connections[opt.uid];
  },
  setup: function (RED, localFieldbusSettings) {
    settings = localFieldbusSettings;
    fieldbus.setup(RED, localFieldbusSettings);
  },
  findFirmware: function (RED, interfaceComponents, nodeType, nodeID) {
    var ret = {
      'BoardObj': undefined, 
      'ErrorObj': {
        'Error': 0, 
        'AddDesc': undefined,
        'Timestamp': undefined
      }
    };
    if (interfaceComponents) {
      if (boardArray) {
        for (var nB = 0; nB < boardArray.length; nB++) {
          if (interfaceComponents.boardName === boardArray[nB].cifXName) {
            if (nodeType === 'config') {
              ++boardArray[nB].cntOfConfigNodesUsingIt;
              boardArray[nB].configNodeID = nodeID;
            }
            log.HilLog(getFileName, log.getLineNumber(), "Board (" + boardArray[nB].cifXName + ") is used by (" + 
              boardArray[nB].cntOfConfigNodesUsingIt + ") config nodes", "info");
            //a cifX was found
            if (interfaceComponents.prtName === boardArray[nB].supportedProtocolClassName && 
                interfaceComponents.className === boardArray[nB].supportedCommunicationClassName) {
              ret.BoardObj = boardArray[nB];
              return ret;
            } else {
              var fwFound = "";
              if (boardArray[nB].supportedProtocolClassName) {
                fwFound += boardArray[nB].supportedProtocolClassName + ': ';
              } else {
                fwFound += "PC unknown" + ': ';
              }
              if (boardArray[nB].supportedCommunicationClassName) {
                fwFound += boardArray[nB].supportedCommunicationClassName + ': ';
              } else {
                fwFound += "CC unknown" + ': ';
              }
              fwFound += boardArray[nB].cifXName;
              ret.ErrorObj = htb.GetError('FirmwareNotFound');
              ret.ErrorObj.AddDesc = ret.ErrorObj.AddDesc.replace('@1', interfaceComponents.prtName + " " + interfaceComponents.className);
              ret.ErrorObj.AddDesc = ret.ErrorObj.AddDesc.replace('@2', boardArray[nB].cifXName);
              ret.ErrorObj.AddDesc = ret.ErrorObj.AddDesc.replace('@3', fwFound);
              log.HilLog(getFileName, log.getLineNumber(), "ConnectionPool findFirmware(" + interfaceComponents.boardName + ") Error: " + 
                ret.ErrorObj.AddDesc, "error");
              ret.BoardObj = boardArray[nB];
              return ret;
            }
          }
        }
        ret.ErrorObj = htb.GetError('BoardNotFound');
        ret.ErrorObj.AddDesc = ret.ErrorObj.AddDesc.replace('@1', interfaceComponents.boardName);
      } else {
        ret.ErrorObj = htb.GetError('NoBoardAvailable');
      }
    } else {
      ret.ErrorObj = htb.GetError('InvalidParameter');
      ret.ErrorObj.AddDesc = ret.ErrorObj.AddDesc.replace('@1', JSON.stringify(interfaceComponents));
    }
    log.HilLog(getFileName, log.getLineNumber(), ret.ErrorObj.AddDesc, "error");
    return ret;
  },
  addBoard: function (RED, board) {
    log.HilLog(getFileName, log.getLineNumber(), "ConnectionPool addBoard(" + board.cifXName + ") START", "debug");
    if (boardArray[board.cifXName] === undefined) {
      boardArray.push(new BoardObject(RED, board));
    } else {
      log.HilLog(getFileName, log.getLineNumber(), "ConnectionPool addBoard(" + board.cifXName + 
        ") impossible to add more than one protocol to the same board", "debug");
    }
  },
  getUnusedBoards: function (RED) {
    var ret = [];
    log.HilLog(getFileName, log.getLineNumber(), "ConnectionPool getUnusedBoard() START (" + boardArray.length + ") Boards available", "debug");
    for (var n = 0; n < boardArray.length; n++) {
      if (boardArray[n].cntOfConfigNodesUsingIt === 0) {
        log.HilLog(getFileName, log.getLineNumber(), "Board (" + boardArray[n].cifXName + ") is unused", "debug");
        ret.push(boardArray[n]);
      }
    }
    return ret;
  },
  searchConnection: function (RED, uid) {
    if (!connections[uid]) {
      log.HilLog(getFileName, log.getLineNumber(), "Connection [" + uid + "] not found!", "error");
    } else {
      log.HilLog(getFileName, log.getLineNumber(), "Return found uid (" + uid + ")", "debug");
      return connections[uid];
    }
    return undefined;
  }
  };
