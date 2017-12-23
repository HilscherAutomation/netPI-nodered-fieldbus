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
var glbFieldbusHandlerArray = [];
var glbConnections = {};
var glbBoardArray = [];

function Channel(channel, idx) {
  this.selectedProtocolClass = channel.selectedProtocolClass;
  this.selectedProtocolClassNameStruct = htb.GetProtClassName(channel.selectedProtocolClass);
  this.selectedCommunicationClass = channel.selectedCommunicationClass;
  this.selectedCommunicationClassNameStruct = htb.GetCommClassName(channel.selectedCommunicationClass);
  this.channelIdx = idx;
  log.HilLog(getFileName, log.getLineNumber(), "ADD ChannelObject(" + JSON.stringify(this) + ")", "info");
}

function BoardObject(board) {
  this.initError = 0;
  this.cifXName = board.cifXName;
  this.channelArray = [];
  var self = this;
  //log.HilLog(getFileName, log.getLineNumber(), "input: " + JSON.stringify(board), "debug");
  log.HilLog(getFileName, log.getLineNumber(), "ADD BoardObject(" + this.cifXName + ")", "info");
  board.channel.forEach(function (item, index) {
    var ccNameStruct = htb.GetCommClassName(item.selectedCommunicationClass);
    if (ccNameStruct.userFriendlyName !== "UNDEFINED") {
      var channelObject = new Channel(item, index); 
      self.channelArray.push(channelObject);
    }
  });
}

function findFieldbusHandler(boardName) {
  for (var n = 0; n < glbFieldbusHandlerArray.length; n++) {
    if (glbFieldbusHandlerArray[n].boardName === boardName) {
      return glbFieldbusHandlerArray[n];
    } 
  }
  return undefined;
}

function deleteFromFieldbusHandlerArray(interfaceName) {
  log.HilLog(getFileName, log.getLineNumber(), "deleteFromFieldbusHandlerArray(" + interfaceName + ")", "warn");
  var interfaceNameComponents = interfaceName.split(':');
  for (var n = 0; n < glbFieldbusHandlerArray.length; n++) {
    if (glbFieldbusHandlerArray[n].boardName === interfaceNameComponents[0] ) {
      glbFieldbusHandlerArray[n].removeAllListeners();
      log.HilLog(getFileName, log.getLineNumber(), "fieldbusHandlerArray(interface removed)", "warn" );
      delete glbFieldbusHandlerArray[n];
      glbFieldbusHandlerArray.splice(n, 1);
      return 1;
    }
  }
  log.HilLog(getFileName, log.getLineNumber(), "deleteFromFieldbusHandlerArray(can not find the FBHandler for Board:" + 
                  interfaceNameComponents[0] + ")", "error");
  return 0;
}

/* Each instance of an input and output Node will call getConnection.
 * Here I will create each time a new connection, if the Node-RED ID is not already in the connection list
 * 
 * Each connection itself will create a new fieldbusHandler which is used to update the signals in this connection 
 * (which will be only one per definition because only one signal could be selected per Node)
 */
module.exports = {
  getConnection: function (opt, fStartFieldbus) {
    log.HilLog(getFileName, log.getLineNumber(), "getConnection(fStartFieldbus:" + fStartFieldbus + ")", "info");
    //opt.uid is the NodeID from NodeRED. This ID is different for each instance of a node
    var interfaceNameComponents = opt.expectedInterfaceName.split(':');
    if (!glbConnections[opt.uid]) {
      log.HilLog(getFileName, log.getLineNumber(), "Create connection[" + opt.uid + "]", "info");
      glbConnections[opt.uid] = function () {
        //var uid = (1 + Math.random() * 4294967295).toString(16);
        var options = opt || {};
        var connecting = false;
        var lastError = 0;
        var lastErrorDesc = "";
        var FBHandler = findFieldbusHandler(interfaceNameComponents[0]);
        if (FBHandler === undefined) {
          FBHandler = fieldbus.createFieldbusHandler(opt);
          glbFieldbusHandlerArray.push(FBHandler);
          FBHandler.setMaxListeners(0);
        } else {
          FBHandler.addInstance(options);
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
            var sub = {
              handler: function (topic, payload, uid) {
                if (payload.error && payload.error !== lastError) {
                  log.HilLog(getFileName, log.getLineNumber(), "obj.handler(topic:" + topic + ", payload:" + JSON.stringify(payload) + ")", "error");
                  lastError = payload.error;
                }
                if (payload.add_desc && payload.add_desc !== "") {
                  lastErrorDesc = payload.add_desc;
                }
                delete payload.add_desc; //remove property 'add_desc' from payload
                callback(topic, payload, uid);
              }
            };
            FBHandler.addSignalSubscription(opt, sub.handler);
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
              deleteFromFieldbusHandlerArray(opt.expectedInterfaceName);
            }
            log.HilLog(getFileName, log.getLineNumber(), "connection[" + uid + "] removed.", "warn");
            delete glbConnections[uid];
          },
          isRunning: function () {
            return FBHandler.isRunning();
          },
          getLastError: function () {
            var ret = { "Error": lastError, "AddDesc": lastErrorDesc };
            log.HilLog(getFileName, log.getLineNumber(), "getLastError[UID:" + opt.uid + "] return: [" + JSON.stringify(ret) + "]", "info");
            return ret;
          },
          setLastError: function (code, desc) {
            lastError = code;
            lastErrorDesc = desc;
            log.HilLog(getFileName, log.getLineNumber(), "setLastError[UID:" + opt.uid + "] [code:" + code + ", desc:" + desc + "]", "info");
            FBHandler.sendEvent(opt.uid, 'clearError');
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
                log.HilLog(getFileName, log.getLineNumber(), "uid:" + uid + "] 'restartError' [" + error.add_desc + "]", "error");
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
      glbConnections[opt.uid]._instances += 1;
      //log.HilLog(getFileName, log.getLineNumber(), "connectionPool.getConnection(instance:" + 
      //glbConnections[opt.uid]._instances + ")", "debug");
    }
    log.HilLog(getFileName, log.getLineNumber(), "Return connection[" + opt.uid + "]", "info");
    return glbConnections[opt.uid];
  },
  setup: function (RED, localFieldbusSettings){
    settings = localFieldbusSettings;
    fieldbus.setup(RED, localFieldbusSettings);
  },
  findFirmware: function (interfaceName) {
    var self = this;
    if (interfaceName) {
      log.HilLog(getFileName, log.getLineNumber(), "FindFirmware(" + JSON.stringify(interfaceName) + ")", "debug");
      var interfaceNameComponents = interfaceName.split(':');
      for (var nB = 0; nB < glbBoardArray.length; nB++) {
        var board = glbBoardArray[nB];
        log.HilLog(getFileName, log.getLineNumber(), "Compare(fw: " + board.cifXName + " with: " + interfaceNameComponents[0] + ")", "debug");
        if (interfaceNameComponents[0] === board.cifXName) {
          //now search over all channels in this board
          for (var nC = 0; nC < board.channelArray.length; nC++) {
            var channel = board.channelArray[nC];
            log.HilLog(getFileName, log.getLineNumber(), "Compare(Channel(" + channel.channelOffset + "): PC: " + channel.selectedProtocolClassNameStruct.userFriendlyName + 
              " with: " + interfaceNameComponents[1] + ")", "debug");
            log.HilLog(getFileName, log.getLineNumber(), "Compare(Channel(" + channel.channelOffset + "): CC: " + channel.selectedCommunicationClassNameStruct.userFriendlyName + 
              " with: " + interfaceNameComponents[2] + ")", "debug");
            if (( interfaceNameComponents[1] === channel.selectedProtocolClassNameStruct.userFriendlyName || 
                  interfaceNameComponents[1] === channel.selectedProtocolClassNameStruct.name) && 
                ( interfaceNameComponents[2] === channel.selectedCommunicationClassNameStruct.userFriendlyName ||
                  interfaceNameComponents[2] === channel.selectedCommunicationClassNameStruct.name)) {
                log.HilLog(getFileName, log.getLineNumber(), "ConnectionPool findFirmware() found (" + interfaceName + ")", "warn");
                return channel;
            }
          }
        }
      }
      log.HilLog(getFileName, log.getLineNumber(), "ConnectionPool findFirmware() could not find (" + interfaceName + ")", "warn");
    } else {
      log.HilLog(getFileName, log.getLineNumber(), "ConnectionPool findFirmware() called with invalid parameter(" + interfaceName + ")", "error");
    }
    return undefined;
  },
  findBoard: function (boardName) {
    var self = this;
    if (boardName) {
      var n;
      for (n = 0; n < glbBoardArray.length; n++) {
        if (glbBoardArray[n].cifXName === boardName) {
          return n;
        }
      }
    //} else {
    //  log.HilLog(getFileName, log.getLineNumber(), "ConnectionPool findBoard() called with invalid parameter(" + boardName + ")", "error");
    }
    return undefined;
  },
  updateBoard: function (boardObject) {
    var self = this;
    if (boardObject !== undefined && boardObject.hasOwnProperty('cifXName')) {
      var n = this.findBoard(boardObject.cifXName);
      if (n !== undefined) {
        log.HilLog(getFileName, log.getLineNumber(), "ConnectionPool delete BoardObject for(" + boardObject.cifXName + ")", "debug");
        glbBoardArray.slice(n, 1);
      }
      var myBoardObject = new BoardObject(boardObject);
      glbBoardArray.push(myBoardObject);
    }
  },
  addBoard: function (boardObject) {
    this.updateBoard(boardObject);
  },
  searchConnection: function (uid) {
    if (!glbConnections[uid]) {
      log.HilLog(getFileName, log.getLineNumber(), "Connection [" + uid + "] not found!", "error");
    } else {
      log.HilLog(getFileName, log.getLineNumber(), "Return found uid (" + uid + ")", "info");
      return glbConnections[uid];
    }
    return undefined;
  }
  };
