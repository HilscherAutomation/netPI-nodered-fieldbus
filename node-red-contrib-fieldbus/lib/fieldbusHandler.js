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
var util = require("util");
var fieldbusDLL = require("./fieldbus.node"); //the .node file
var events = require("events");
var log = require("./HilscherLog");
var htb = require("./HilscherToolBox");
var getFileName = "fieldbusHandler.js";
var RED = null;
var localFieldbusSettings = {};
//var inspect = require("sys").inspect;

var enumStateMachine = {
  Idle: 0,
  ReconfigureDevice: 1,
  OpenChannel: 2,
  WaitRunning: 3,
  UpdateIO: 4,
  CloseChannel: 5,
  WaitResponse: 6,
  ErrorOnChannel: 8,
  WaitDriverIsOpen: 9,
  TriggerWatchdog: 10,
  InitError: 12
};
var enumWriteState = {
  ToBeWritten: 0,
  Written: 1,
  ToBeDeleted: 2
};

//FBHandler is a class which is created for each cifX card and is used to save all the card specific parameter (e.g SignalList and WriteQueue)
function FBHandler(opt) {
  this.opt = opt || {}; //structure defined in 10-fieldbus.js var fielbusOptions
  this.connecting = false;
  this.channelIsOpen = false;
  this.connected = false;
  this.running = false;
  this.startTime = null;
  this.lastState = 255;
  this.nTimes = 0;
  this.nOverAllTimes = 0;
  this.connectionInitError = 0;
  this.intervallFncID = null;
  var interfaceNameComponents = this.opt.expectedInterfaceName.split(":");
  this.boardName = interfaceNameComponents[0];
  this.protClassName = interfaceNameComponents[1];
  this.commClassName = interfaceNameComponents[2];
  this.protClassNumber = htb.GetProtClassNumber(this.protClassName);
  this.commClassNumber = htb.GetCommClassNumber(this.commClassName);
  this.signalReadList = []; //a list of signals
  this.writeQueue = []; //a list of signals to write
  this.lastWriteTime = undefined;
  this.writeStarted = false;  //a flag when the first write was done to start the watchdog trigger automatically afterwards
  this.wdTriggered = 0;
  this.SubscribedUIDList = []; //new Array(); do it this way because of W009 from JSHint
  //assuming each node will come here with a unique uid and assuming one node could only handle one signal
  //I have to save one signal path per uid
  
  this._nextMessageId = function () {
    this.messageId += 1;
    if (this.messageId > 0xFFFF) {
      this.messageId = 1;
    }
    return this.messageId;
  };
  this.SubscribedUIDList.push({ 'uid': opt.uid, 'lastEvent': undefined });
  this.stateMachineState = enumStateMachine.WaitDriverIsOpen;

  log.HilLog( getFileName, log.getLineNumber(), "FBHandler uid:" + opt.uid + " ADDED to list", "debug");
  log.HilLog(getFileName, log.getLineNumber(), "FBHandler opt:" + JSON.stringify( opt ), "debug");
  events.EventEmitter.call(this);
}
util.inherits(FBHandler, events.EventEmitter);

function getStateAsString(state) {
  if (state === enumStateMachine.Idle) {
    return "Idle";
  }
  if (state === enumStateMachine.ReconfigureDevice) {
    return "ReconfigureDevice";
  }
  if (state === enumStateMachine.OpenChannel) {
    return "OpenChannel";
  }
  if (state === enumStateMachine.WaitRunning) {
    return "WaitRunning";
  }
  if (state === enumStateMachine.UpdateIO) {
    return "UpdateIO";
  }
  if (state === enumStateMachine.CloseChannel) {
    return "CloseChannel";
  }
  if (state === enumStateMachine.TriggerWatchdog) {
    return "TriggerWatchdog";
  }
  if (state === enumStateMachine.WaitResponse) {
    return "WaitResponse";
  }
  if (state === enumStateMachine.ErrorOnChannel) {
    return "ErrorOnChannel";
  }
  if (state === enumStateMachine.WaitDriverIsOpen) {
    return "WaitDriverIsOpen";
  }
  if (state === enumStateMachine.InitError) {
    return "InitError";
  }
  return state;
}
var EnumRequest = {
  REQ_UNDEFINED: 0,
  REQ_MBX_STATE: 1,
  REQ_HOST_STATE: 2,
  REQ_DPM_SIZE: 4,
  REQ_DMA_STATE: 8,
  REQ_BUS_STATE: 16,
  REQ_IO_STATE: 32,
  REQ_COS_STATE: 64 //... 
};

function findSignalInQueue(self, signal) {
  self.writeQueue.forEach(function (writeItem, wIndex) {
    if (writeItem.topic === signal) {
      return writeItem;
    }
  });
  return undefined;
}

function returnVersionError(fnc, line, givenVersion, expectedVersion) {
  var locError = {};
  locError.Error = 1;
  locError.Module = getFileName;
  locError.Line = line;
  locError.AddDesc = "The response in function [" + fnc + "] is [" + givenVersion + 
  "]. Expected is [" + expectedVersion + "]";
  log.HilLog( getFileName, line, JSON.stringify(locError), "error");
  return JSON.stringify(locError);
}

function emit2AllUIDS(self, event, addMsg) {
  self.SubscribedUIDList.forEach(function (uidItem, uidIndex) {
    //TODO: Is it a good idea to send events only if they have changed?
    if (uidItem.lastEvent === undefined || uidItem.lastEvent !== event) {
      self.SubscribedUIDList[uidIndex].lastEvent = event;
      log.HilLog( getFileName, log.getLineNumber(), "FBHandler.emit(" + event + " to uid:" + uidItem.uid + ")", "info");
      self.emit(event, uidItem.uid, addMsg);
    }
  });
}

//only called by the state machine. Never directly
function isCommunicationRunning(self) {
  var Query = {
    "selectedBoardName": self.boardName,
    "selectedChannelNumber": self.opt.selectedChannelNumber,
    "request": EnumRequest.REQ_MBX_STATE + EnumRequest.REQ_BUS_STATE + EnumRequest.REQ_HOST_STATE + 
    EnumRequest.REQ_DMA_STATE + EnumRequest.REQ_IO_STATE
  };
  fieldbusDLL.getCifXChannelInfo(Query, function (error, DllData) {
    if (error === undefined) {
      if (DllData.ResponseVersion === 1) {
        /* do something with the data and switch the state machine */
        if (DllData.busState === 1) {
          if (DllData.ioState === "Communication") {
            self.running = true;
            self.stateMachineState = enumStateMachine.UpdateIO;
            emit2AllUIDS(self, 'communicationIsRunning');
          } else {
            emit2AllUIDS(self, 'busON');
          }
        } else {
          //PM does not want a cyclic close and open!
          self.running = false;
          //test for timeout
          //var thisTime = new Date();
          //if (thisTime - self.startTime > 10000) {
          //  self.stateMachineState = enumStateMachine.CloseChannel;
          //  emit2AllUIDS(self, 'timeout');
          //}
        }
      } else {
        self.stateMachineState = enumStateMachine.ErrorOnChannel;
        self.DllError = returnVersionError("getCifXChannelInfo", log.getLineNumber(), DllData.ResponseVersion, 1);
      }
    } else {
      self.stateMachineState = enumStateMachine.ErrorOnChannel;
      self.DllError = JSON.parse(JSON.stringify(error));
    }
  });
}

function closeStateMachine(self) {
  if (self.intervallFncID !== null) {
    log.HilLog( getFileName, log.getLineNumber(), "FBHandler.doStateMachine(DISABLE cyclic function)", "warn");
    clearInterval(self.intervallFncID);
  }
  self.connecting = false;
  self.connected = false;
  self.running = false;
  self.intervallFncID = null;
  self.stateMachineState = enumStateMachine.WaitDriverIsOpen;

}

//only called by the state machine. Never directly
/*
 * reconfigureDevice is called when Node-RED starts the flow. This is also the case on a deploy!
 */
function reconfigureDevice(self) {
  var Query = {
    "configPath": RED.settings.userDir,
    "selectedBoardName": self.boardName,
    "selectedDeviceNumber": self.opt.selectedDeviceNumber,
    "selectedSerialNumber": self.opt.selectedSerialNumber,
    "selectedChannelNumber": self.opt.selectedChannelNumber,
    "id": self.opt.uid,
    "forceDownload": false, //true,
    "forceInit": false
  };
  //log.HilLog( getFileName, log.getLineNumber(), "calling DLL:reconfigureDevice(Query:" + JSON.stringify(Query) + ")", "debug");
  fieldbusDLL.reconfigureDevice(Query, function (error, DllData) {
    if (error === undefined) {
      //log.HilLog( getFileName, log.getLineNumber(), "DLL:reconfigureDevice(res=" + JSON.stringify(DllData) + ")", "debug");
      if (DllData.ResponseVersion === 1) {
        //log.HilLog( getFileName, log.getLineNumber(), "stateMachineState = enumStateMachine.OpenChannel", "debug");
        self.stateMachineState = enumStateMachine.OpenChannel;
      } else {
        self.DllError = returnVersionError("reconfigureDevice", log.getLineNumber(), DllData.ResponseVersion, 1);
        closeStateMachine(self);
        emit2AllUIDS(self, 'restartError', self.DllError);
      }
    } else {
      //log.HilLog( getFileName, log.getLineNumber(), "DLL:reconfigureDevice(error=" + 
      //JSON.stringify(error) + ")", "error");
      closeStateMachine(self);
      self.DllError = JSON.parse(JSON.stringify( error ));
      emit2AllUIDS(self, 'restartError', self.DllError);
    }
  });
}

//only called by the state machine. Never directly
function openChannel(self, busOn) {
  var Query = {
    "selectedBoardName": self.boardName,
    "selectedChannelNumber": self.opt.selectedChannelNumber,
    "id": self.opt.uid,
    "busOnOff": busOn,
    "applicationOnOff": true,
    "outputMirror": false, //set to true if the DLL should automatically copy the first 20 bytes from input to output
    "initOutputs": self.opt.clearOutputsOnDeploy //set to true if the DLL should initialize the output area with 0 on OpenChannel (after each deploy)
  };
  log.HilLog(getFileName, log.getLineNumber(), "calling DLL:openChannel(busOn:" + busOn + ", appOn:" + true + ", outMirror:" + false +
    ", initOutputs:" + self.opt.clearOutputsOnDeploy + ")", "info");
  fieldbusDLL.openChannel(Query, function (error, DllData) {
    if (error === undefined) {
      //log.HilLog( getFileName, log.getLineNumber(), "DLL:openChannel(res=" + JSON.stringify(DllData) + ")", "debug");
      if (DllData.ResponseVersion === 1) {
        log.HilLog( getFileName, log.getLineNumber(), "FBHandler: channelOpen [No:" + 
          self.opt.selectedChannelNumber + ", ID:" + self.opt.uid + 
          ", RefCnt:" + DllData.RefCnt +"]", "info");
        self.startTime = new Date();
        self.stateMachineState = enumStateMachine.WaitRunning;
        self.connected = true;
        self.connecting = false;
        emit2AllUIDS(self, 'channelIsOpen');
      } else {
        closeStateMachine(self);
        self.DllError = returnVersionError("openChannel", log.getLineNumber(), DllData.ResponseVersion, 1);
      }
    } else {
      closeStateMachine(self);
      self.DllError = JSON.parse(JSON.stringify( error ));
      emit2AllUIDS(self, 'timeout', self.DllError);
    }
  });
}

//only called by the state machine. Never directly
function readArrayElement(self, element) {
  var Query = {
    "selectedBoardName": self.boardName,
    "selectedChannelNumber": self.opt.selectedChannelNumber,
    "id": element.uid,
    "selectedSignalPath": element.selectedSignalPath
  };
  fieldbusDLL.readSignal(Query, function (error, DllData) {
    var payload = {};
    if (error === undefined) {
      if (DllData.ResponseVersion === 1) {
        //send a payload with the callback from element
        var fSend = false;
        //if (DllData.Quality == "Good") { 
        if (element.readCnt === 0) {
          log.HilLog(getFileName, log.getLineNumber(), "Read Signal first call!) ", "debug");
          fSend = true;
        //} else if (element.lastError !== undefined && element.lastError.Error !== 0) {
        //  log.HilLog( getFileName, log.getLineNumber(), "element.lastError.Error = " + 
        //    element.lastError.Error + ")", "error");
        //  fSend = true;
        } else if (element.oldData.Quality !== DllData.Quality) {
          log.HilLog( getFileName, log.getLineNumber(), "Quality changed) ", "debug");
          fSend = true;
        } else if (element.oldData.Error !== DllData.Error) {
          log.HilLog(getFileName, log.getLineNumber(), "Error changed) ", "error");
          fSend = true;
        } else {
          if (DllData.Value.length !== undefined) {
            //currently we have no multi dimensional arrays!
            if (DllData.Value.length === element.oldData.Value.length) {
              for (var nPos = 0; nPos < element.oldData.Value.length && fSend === false; nPos++) {
                if (element.oldData.Value[nPos] !== DllData.Value[nPos]) {
                  log.HilLog( getFileName, log.getLineNumber(), "Value at[" + nPos + "](" + element.oldData.Value[nPos] + ") changed to(" + DllData.Value[nPos] + ")) ", "debug");
                  fSend = true;
                }
              }
            } else {
              log.HilLog( getFileName, log.getLineNumber(), "Value.length[" + element.oldData.Value.length + 
                "] changed [" + DllData.Value.length + "]) ", "debug");
              fSend = true;
            }
          } else if (element.oldData.Value !== DllData.Value) {
            log.HilLog(getFileName, log.getLineNumber(), "Value changed old:(" + element.oldData.Value + 
              "), new(" + DllData.Value + ")", "debug");
            fSend = true;
          }
        }
        ++element.readCnt;
        //}
        if (fSend) {
          payload = {
            //"BusState": DllData.BusState,
            "error": DllData.Error, //changed 05/24/2016 and again 08/29/2016 and finaly? 09/09/2016
            "add_desc": DllData.AddDesc, //new 09/09/2016
            "datatype": DllData.DataType, //changed 09/09/2016
            "timestamp": new Date(DllData.TimeStamp),
            "value": DllData.Value
          };
          element.lastError.Error = 0;
          element.oldData = JSON.parse( JSON.stringify(DllData));
          log.HilLog( getFileName, log.getLineNumber(), "DLL:readSignal(topic=" + element.selectedSignalPath + ", payload=" + JSON.stringify(payload), "debug");
          element.handler(element.selectedSignalPath, payload, element.uid);
        }
      } else {
        ++element.errorCnt;
        self.stateMachineState = enumStateMachine.ErrorOnChannel;
        self.DllError = returnVersionError("readSignal", log.getLineNumber(), DllData.ResponseVersion, 1);
        element.lastError = JSON.parse(JSON.stringify( self.DllError ));
      }
    } else {
      ++element.errorCnt;
      //self.stateMachineState = enumStateMachine.ErrorOnChannel; // dont influence the main state 
      //machine if only one read signal has a problem !
      self.DllError = JSON.parse(JSON.stringify( error ));
      if (element.lastError.Error !== error.Error) {
        element.lastError = JSON.parse(JSON.stringify( error ));
        log.HilLog( getFileName, log.getLineNumber(), "DLL:readSignal() send readerror to [" + element.uid + 
        "]: Error [" + JSON.stringify(element.lastError) + "]", "error");
        //a comment from Armin was to sent the latest data in case of an error but with quality = BAD
        if (element.oldData !== undefined) {
          //resolving Jira ISSUE (#J150216-227)
          payload = {
            "error": error.Error,
            "add_desc": error.AddDesc, //new 09/09/2016
            "datatype": element.oldData.DataType,
            "timestamp": new Date(element.oldData.TimeStamp),
            "value": element.oldData.Value
          };
          element.handler(element.selectedSignalPath, payload, element.uid);
        }
      }
    }
  });
}
//only called by the state machine. Never directly
function readSignals(self) {
  self.stateMachineState = enumStateMachine.UpdateIO;
  if (self.signalReadList.length) {
    self.signalReadList.forEach(function (signalItem, signalIndex) {
      readArrayElement(self, signalItem, signalIndex);
    });
  } else {
    isCommunicationRunning(self);
  }
}

//only called by the state machine. Never directly
function writeQueueElement(self, element) {
  if (element.state === enumWriteState.ToBeWritten) {
    var varTime = new Date().toISOString();
    var value;
    if (element.payload.hasOwnProperty("Value")) {
      value = JSON.parse(JSON.stringify( element.payload.Value ));
    } else if (element.payload.hasOwnProperty("value")) {
      value = JSON.parse(JSON.stringify( element.payload.value ));
    } else {
      self.DllError = {
        "Error": 101, 
        "Module": getFileName, 
        "Line": log.getLineNumber(), 
        "AddDesc": "OUT_NODE expects the property 'Value' or 'value' in it's payload. Given is: " + JSON.stringify(element)
      };
      log.HilLog(self.DllError.Module, self.DllError.Line, self.DllError.AddDesc, "error");
      element.state = enumWriteState.ToBeDeleted;
      self.emit("writeerror", element.uid, self.DllError); //only for this single node instance!
    }
    if (value !== undefined) {
      var Query = {
        "selectedBoardName": self.boardName,
        "selectedChannelNumber": self.opt.selectedChannelNumber,
        "id": element.uid,
        "msg": {
          "topic": element.topic,
          "payload": {
            "Value": value,
            "TimeStamp": varTime
          }
        }
      };
      log.HilLog(getFileName, log.getLineNumber(), "DLL:writeSignal(element:" + JSON.stringify(Query) + ", writeStarted=true)", "debug");
      self.writeStarted = true;
      fieldbusDLL.writeSignal(Query, function (error, DllData) {
        if (error === undefined) {
          self.lastWriteTime = new Date().getTime();
          if (DllData.ResponseVersion === 1) {
            element.writeTime = new Date().getTime();
            //A decision from PM is to let the Node state unchanged (static 'Communicating') and not to fallback
            //into 'Running' after 2 Sec.
            //element.state = enumWriteState.Written;
            element.state = enumWriteState.ToBeDeleted;
            self.emit("writeok", element.uid); //only for this single node instance!
          } else {
            element.state = enumWriteState.ToBeDeleted;
            self.DllError = returnVersionError("writeSignal", log.getLineNumber(), DllData.ResponseVersion, 1);
            self.emit("writeerror", element.uid, self.DllError); //only for this single node instance!
          }
        } else {
          //print the error but dont disconnect
          self.DllError = JSON.parse(JSON.stringify( error ));
          element.state = enumWriteState.ToBeDeleted;
          self.emit("writeerror", element.uid, self.DllError); //only for this single node instance!
        }
      });
    } else if (element.state === enumWriteState.Written) {
      var timeNow = new Date().getTime();
      if (timeNow - element.writeTime > 2000) {
        element.state = enumWriteState.ToBeDeleted;
        self.emit("waitsignal", element.uid); //only for this single node instance!
      }
    }
  }
}
//only called by the state machine. Never directly
function writeSignals(self) {
  if (self.writeQueue.length > 0) {
    self.writeQueue.forEach(function (writeItem, wIndex) {
      writeQueueElement(self, writeItem);
      if (self.writeQueue[wIndex].state === enumWriteState.ToBeDeleted) {
        self.writeQueue.splice(wIndex, 1);
        log.HilLog(getFileName, log.getLineNumber(), "writeQueue.length:" + self.writeQueue.length, "debug");
      }
    });
    self.stateMachineState = enumStateMachine.UpdateIO;
  } else {
    //trigger the watchdog if there was a write before
    if (self.writeStarted === true) {
      //if I use a setTimeout this will result in the following problem:
      //If a deploy is pressed while the timeout is running the callback function could be called 
      //with invalid informations (self is not valid any more)
      //To prevent this problem I will handle the TriggerWatchdog in the state machine and not with
      //setTimeout()
      
      var actTime = new Date().getTime();
      /*
       * As discussed with Armin a trigger time of 500ms will be fast enough because the configurator will set this time to 1000 and
       * it is a hidden value, not editable by any user!
       */
      if ((actTime < self.lastWriteTime) || ((actTime - self.lastWriteTime) > 500)) {
        //log.HilLog(getFileName, log.getLineNumber(), "writeStarted=false", "debug");
        self.writeStarted = false;
        //trigger the watchdog
        var Query = {
          "selectedBoardName": self.boardName,
          "selectedChannelNumber": self.opt.selectedChannelNumber,
          "id": self.opt.uid,
        };
        //log.HilLog( getFileName, log.getLineNumber(), "call DLL:triggerWatchdog(" + JSON.stringify(Query) + ")", "debug");
        //log.HilLog(getFileName, log.getLineNumber(), "call DLL:triggerWatchdog()", "debug");
        fieldbusDLL.triggerWatchdog(Query, function (error, DllData) {
          self.waitTriggerWatchdogRunning = false;
          if (error === undefined) {
            if (DllData.ResponseVersion === 1) {
              //log.HilLog(getFileName, log.getLineNumber(), "writeStarted=true", "debug");
              self.writeStarted = true; //keep watchdog running
              self.lastWriteTime = actTime;
              self.wdTriggered++;
              if ((self.wdTriggered % 10) === 0) {
                log.HilLog(getFileName, log.getLineNumber(), "DLL:triggerWatchdog() called " + self.wdTriggered + " times", "debug");
              }
            } else {
              self.DllError = returnVersionError("triggerWatchdog", log.getLineNumber(), DllData.ResponseVersion, 1);
              log.HilLog( getFileName, log.getLineNumber(), "DLL:triggerWatchdog(error:" + JSON.stringify(self.DllError) + ")", "debug");
              self.emit("writeerror", self.opt.uid, self.DllError); //only for this single node instance!
            }
          } else {
            //print the error but dont disconnect
            self.DllError = JSON.parse(JSON.stringify( error ));
            log.HilLog( getFileName, log.getLineNumber(), "DLL:triggerWatchdog(error:" + JSON.stringify(self.DllError) + ")", "debug");
            self.emit("writeerror", self.opt.uid, self.DllError); //only for this single node instance!
            //self.emit("driveropen", self.opt.uid, self.DllError); //only for this single node instance!
          }
          self.stateMachineState = enumStateMachine.UpdateIO;
        });
      }
    } else {
      self.stateMachineState = enumStateMachine.UpdateIO;
    }
  }
}

//only called by the state machine. Never directly
function closeChannel(self) {
  var Query = {
    "selectedBoardName": self.boardName,
    "selectedChannelNumber": self.opt.selectedChannelNumber,
    "id": self.opt.uid
  };
  log.HilLog( getFileName, log.getLineNumber(), "calling DLL:closeChannel(Query:" + JSON.stringify(Query) + ")", "info");
  fieldbusDLL.closeChannel(Query, function (error, DllData) {
    if (error === undefined) {
      //log.HilLog(getFileName, log.getLineNumber(), "writeStarted=false", "debug");
      self.writeStarted = false; //stop triggering the watchdog
      log.HilLog( getFileName, log.getLineNumber(), "DLL:closeChannel(res=" + JSON.stringify(DllData) + ")", "info");
      if (DllData.ResponseVersion === 1) {
        log.HilLog( getFileName, log.getLineNumber(), "FBHandler: closeChannel [No:" + 
          self.opt.selectedChannelNumber + ", ID:" + self.opt.uid + 
          ", RefCnt:" + DllData.RefCnt + "]", "info");
        emit2AllUIDS(self, 'disconnect');
      } else {
        self.DllError = returnVersionError("closeChannel", log.getLineNumber(), DllData.ResponseVersion, 1);
      }
      closeStateMachine(self);
    } else {
      //RED.log.error(getFileName + "(" + getLineNumber() + ") DLL:closeChannel(error=" + JSON.stringify(error) + ")");
      self.DllError = JSON.parse(JSON.stringify( error ));
      closeStateMachine(self);
    }
  });
}

function waitDriverIsOpen(self, fReconnect) {
  log.HilLog( getFileName, log.getLineNumber(), "calling DLL:IsDriverOpen()", "debug");
  //first time a node need to open a cifX. So call driver open and wait until this functions is done and
  //the driver knows all cards
  fieldbusDLL.isDriverOpen(function (error, DllData) {
    if (error === undefined) {
      log.HilLog( getFileName, log.getLineNumber(), "DLL:IsDriverOpen(res=" + JSON.stringify(DllData) + ")", "debug");
      if (DllData.ResponseVersion === 1) {
        if (DllData.Result === "true" || DllData.Result === "Done") {
          /* do something with the data */
          if (fReconnect === false) {
            //this is called when the connection should be initiated the first time
            self.stateMachineState = enumStateMachine.ReconfigureDevice;
          } else {
            //this is called after the timeout, when a connection was lost
            self.stateMachineState = enumStateMachine.OpenChannel;
          }
          emit2AllUIDS(self, 'driveropen');
        } else {
          /* an error occure while the CifX-Node is initializing */
          RED.log.error(getFileName + "(" + log.getLineNumber() + ") isDriverOpen error [" + JSON.stringify(DllData) + "]. CLOSE NODE!");
          closeStateMachine(self);
          //} else {
          //do nothing and wait again
        }
      } else {
        RED.log.error(getFileName + "(" + log.getLineNumber() + ") isDriverOpen error [" + JSON.stringify(DllData) + "]. CLOSE NODE!");
        closeStateMachine(self);
      }
    } else {
      self.DllError = JSON.parse(JSON.stringify( error ));
      closeStateMachine(self);
    }
  });
}

//Could be called by an other module
FBHandler.prototype.doStateMachine = function (fReconnect, uid, busOn) {
  log.HilLog( getFileName, log.getLineNumber(), "FBHandler.doStateMachine(UID:" + uid + ", busOn:" + busOn + ")", "debug");
  if (this.opt.uid === uid) { //only the first instance has access to the state machine
    if (this.connected === false && this.connecting === false) {
      var self = this;
      
      //self.lastOutbound = (new Date()).getTime()
      self.DllError = {};
      self.connecting = true;
      self.connected = false;
      self.running = false;
      log.HilLog( getFileName, log.getLineNumber(), "FBHandler.doStateMachine(ENABLE cyclic function)", "debug");
      if (self.stateMachineState === enumStateMachine.WaitDriverIsOpen) {
        //now the cyclic function is entered which handles the state machine of this connection
        self.intervallFncID = setInterval(function () {
          if ( /*self.nTimes > 20 ||*/ self.lastState !== self.stateMachineState) {
            log.HilLog( getFileName, log.getLineNumber(), "StateMachine(cnt:(" + self.nOverAllTimes + "), state:" +
              getStateAsString(self.stateMachineState) + ", uid:" + self.opt.uid + ")", "info");
            self.nTimes = 0;
            self.lastState = self.stateMachineState;
          }
          switch (self.stateMachineState) {
            case enumStateMachine.WaitDriverIsOpen:
              //H.P. waitDriverIsOpen is now (03/04/2016) also asynchron
              self.stateMachineState = enumStateMachine.WaitResponse;
              waitDriverIsOpen(self, fReconnect);
              break;
            case enumStateMachine.ReconfigureDevice:
              self.stateMachineState = enumStateMachine.WaitResponse;
              reconfigureDevice(self);
              break;
            case enumStateMachine.OpenChannel:
              if (self.connected === false) {
                self.stateMachineState = enumStateMachine.WaitResponse;
                openChannel(self, busOn);
              } else {
                self.stateMachineState = enumStateMachine.WaitRunning;
              }
              break;
            case enumStateMachine.WaitRunning:
              isCommunicationRunning(self);
              break;
            case enumStateMachine.UpdateIO:
              //if no node is attached to this handler any more close the channel
              self.stateMachineState = enumStateMachine.WaitResponse;
              readSignals(self);
              writeSignals(self);
              break;
            case enumStateMachine.CloseChannel:
              if (self.connected === true) {
                self.stateMachineState = enumStateMachine.WaitResponse;
                closeChannel(self);
              } else {
                closeStateMachine(self);
              }
              break;
            case enumStateMachine.ErrorOnChannel:
              emit2AllUIDS(self, 'error', self.DllError);
              self.stateMachineState = enumStateMachine.CloseChannel;
              break;
            case enumStateMachine.TriggerWatchdog:
              break;
            case enumStateMachine.WaitResponse:
              /*Do nothing. The state is switched in the corresponding function*/
              break;
            case enumStateMachine.InitError:
              /*Do nothing. The state is switched in the corresponding function*/
              break;
          }
          ++self.nTimes;
          ++self.nOverAllTimes;
        }, self.opt.readCycle);
      } else {
        RED.log.error(getFileName + "(" + log.getLineNumber() + 
        ") INTERNAL error. Could not restart state machine in state[" + 
        getStateAsString(self.stateMachineState) + "]");
      }
    }
  }
};

/*
 * Only called from an input node
 */
FBHandler.prototype.addSignalSubscription = function (signalOpt, handler) {
  var self = this;
  var interfaceNameComponents = signalOpt.expectedInterfaceName.split(':');
  if (self.protClassName === interfaceNameComponents[1]) {
    var opt = {
      selectedSignalPath: signalOpt.selectedSignalPath,
      uid: signalOpt.uid,
      handler: handler,
      readCnt: 0,
      oldData: {},
      lastError: {},
      errorCnt: 0
    };
    
    self.signalReadList.push(opt);
    if (self.intervallFncID === null) {
      this.doStateMachine(false, signalOpt.uid, true);
    }
    log.HilLog( getFileName, log.getLineNumber(), "FBHandler(" + self.boardName + ") PROT(" + interfaceNameComponents[1] + 
    ") AddSignalSubscription(Cnt:" + self.signalReadList.length + ", SignalPath:" + signalOpt.selectedSignalPath + 
    ", uid:" + signalOpt.uid + ")", "debug");
  } else {
    log.HilLog( getFileName, log.getLineNumber(), "FBHandler(" + self.boardName + ") available protocol(" + self.protClassName +
      ") protocol from node (" + interfaceNameComponents[1] + ")", "error");
  }
};
//The following is not supported in all browsers. (IE < 9)
FBHandler.prototype.deleteSignalSubscription = function (node_id) {
  var self = this;
  var fFound = false;
  //searching the array element with the matching signalPath
  for (var n = 0; n < self.SubscribedUIDList.length; n++) {
    if (self.SubscribedUIDList[n].uid === node_id) {
      for (var nPos = 0; nPos < self.signalReadList.length; nPos++) {
        if (self.signalReadList[nPos].uid === node_id) {
          log.HilLog( getFileName, log.getLineNumber(), "FBHandler(" + self.boardName + 
            ") DeleteSignalSubscription(path:" + self.signalReadList[nPos].selectedSignalPath + ")", "debug");
          self.signalReadList.splice(nPos, 1); //splice = delete array elements from pos iIndex i count
          fFound = true;
        }
      }
      if (fFound === false) {
        log.HilLog( getFileName, log.getLineNumber(), "FBHandler(" + self.boardName + 
          ") DeleteSignalSubscription(No signals for uid (" + node_id + ") found)", "warn");
      } else {
        log.HilLog( getFileName, log.getLineNumber(), "(signalReadList.length:" + self.signalReadList.length + ")", "debug");
      }
      return;
    }
  }
  log.HilLog( getFileName, log.getLineNumber(), "FBHandler(" + self.boardName + 
      ") DeleteSignalSubscription(uid:" + node_id + " NOT FOUND!)", "error");
};

function addSignal2Queue(self, payload, uid, signalPath) {
  var options = {
    topic: signalPath,
    payload: payload,
    uid: uid,
    writeTime: 0,
    lastWriteTime: undefined,
    writeStarted: false,  //a flag when the first write was done to start the watchdog trigger automatically afterwards
    state: enumWriteState.ToBeWritten,
    messageId: self._nextMessageId()
  };
  //TBD:
  //This here will not work correctly if more than one cifX will have the same signal!!!
  //searching the queue if this signal should already be written. And in this case update only the value but prevent a second write command
  for (var n = 0; n < self.writeQueue.length; n++) {
    if (self.writeQueue[n].topic === signalPath && self.writeQueue[n].state === enumWriteState.ToBeWritten) {
      self.writeQueue[n].payload = JSON.parse(JSON.stringify( payload ));
      log.HilLog(getFileName, log.getLineNumber(), "OUT_NODE uidOld:" + self.writeQueue[n].uid + " uidNew: " + uid + 
        "; Update value: (" + JSON.stringify(options) + ") in write queue:", "debug");
      self.writeQueue[n].uid = uid;
      log.HilLog(getFileName, log.getLineNumber(), "writeQueue.length:" + self.writeQueue.length, "debug");
      return;
    }
  }
  log.HilLog( getFileName, log.getLineNumber(), "OUT_NODE uid: " + uid + "; Insert: (" + JSON.stringify(options) + ") in write queue:", "debug");
  self.writeQueue.push(options);
  log.HilLog( getFileName, log.getLineNumber(), "writeQueue.length:" + self.writeQueue.length, "debug");
}

FBHandler.prototype.publish = function (localSignalPath, payload, uid) {
  var self = this;
  //in case I ask for self.running I will only put the signal into the write queue if the communication is started
  //But when a user defines an inject node with the option 'do it once at startup' into the flow this signal could'nt
  //be written in any case, because on flow start no communication is started
//if (self.running) {
  //log.HilLog( getFileName, log.getLineNumber(), "FBHandler.publish(localSignalPath:" + localSignalPath
  //    + ", payload:" + JSON.stringify(payload) + ", uid:" + uid + ")", "debug");
  if (!Buffer.isBuffer(payload)) {
    if (typeof payload === "object") {
      addSignal2Queue(self, payload, uid, localSignalPath);
    } else {
      self.DllError = {
        "Error": 100, 
        "Module": getFileName, 
        "Line": log.getLineNumber(), 
        "AddDesc": "OUT_NODE expects the property 'payload' as an object"
      };
      log.HilLog(self.DllError.Module, self.DllError.Line, self.DllError.AddDesc, "error");
      self.emit("writeerror", uid, self.DllError); //only for this single node instance!
    }
  }
};

FBHandler.prototype.isConnected = function () {
  return this.connected;
};
FBHandler.prototype.isRunning = function () {
  return this.running;
};
FBHandler.prototype.addInstance = function (opt) {
  var fFound = false;
  var self = this;
  //log.HilLog( getFileName, log.getLineNumber(), "FBHandler.addInstance called. Opt:" + JSON.stringify(opt), "debug");
  
  var interfaceNameComponents = opt.expectedInterfaceName.split(":");
  if (self.boardName === interfaceNameComponents[0]) {
    //now make sure we will not have nodes with different protocols added to the same subscription list
    if (interfaceNameComponents[1] === self.protClassName) {
      self.SubscribedUIDList.forEach(function (uidItem, uidIndex) {
        if (uidItem.uid === opt.uid) {
          RED.log.error(getFileName + "(" + log.getLineNumber() + ") FBHandler(" + self.boardName + 
            ") addInstance(uid:[" + uidItem.uid + "] already present)");
          fFound = true;
        }
      });
      if (fFound === false) {
        self.SubscribedUIDList.push({'uid': opt.uid, 'lastEvent': undefined});
        log.HilLog( getFileName, log.getLineNumber(), "FBHandler(" + self.boardName + "] PROT(" + interfaceNameComponents[1] + 
          ") addInstance(uid:[" + opt.uid + "] ADDED, size:" + self.SubscribedUIDList.length + ")", "debug");
      }
    } else {
      RED.log.error(getFileName + "(" + log.getLineNumber() + ") FBHandler(" + self.boardName + 
            ") addInstance(" + interfaceNameComponents[1] + ") could not add a second protocol while (" +  
            self.protClassName +") is already present.");
    }
  } else {
    process.exit(-1); //fundamental error in fieldbusConnectionPool.js
  }
  return self.SubscribedUIDList.length;
};
FBHandler.prototype.delInstance = function (uid) {
  var fFound = false;
  var self = this;
  self.SubscribedUIDList.forEach(function (uidItem, uidIndex) {
    if (uidItem.uid === uid) {
      self.emit("disabled", uidItem.uid);
      self.SubscribedUIDList.splice(uidIndex, 1);
      log.HilLog( getFileName, log.getLineNumber(), "FBHandler(" + self.boardName + ") PROT(" + self.protClassName + 
        ") delInstance(uid:" + uid + " instances:" + self.SubscribedUIDList.length + ")", "debug");
      fFound = true;
    }
  });
  var uidLength = self.SubscribedUIDList.length;
  //now if the length of the connected Nodes (UIDs) is going to zero I can close the channel
  if (uidLength <= 0) {
    closeChannel(self);
  }
  if (uidLength <= 0 && self.stateMachineState !== enumStateMachine.WaitDriverIsOpen) {
    log.HilLog( getFileName, log.getLineNumber(), "Channel is closed now!", "info");
    this.stateMachineState = enumStateMachine.CloseChannel;
    this.connecting = false;
    this.connected = false;
    this.running = false;
    this.startTime = null;
    this.lastState = 255;
    this.nTimes = 0;
    this.nOverAllTimes = 0;
  }
  return uidLength;
};
FBHandler.prototype.sendEvent = function (uid, event) {
  var fFound = false;
  var self = this;
  for (var n=0; n< self.SubscribedUIDList.length; n++) {
    if (self.SubscribedUIDList[n].uid === uid) {
      //find the signal and clear the last error entry to be able
      //to get a static error even if the error does not change
      for (var m = 0; m < self.signalReadList.length; m++) {
        if (self.signalReadList[m].uid === uid) {
          self.signalReadList[m].oldData.Error = 0;
          break;
        }
      }
      self.emit(event, uid);
      break;
    }
  }
};


module.exports = {
  createFieldbusHandler: function (opt) {
    var fieldbus_handler = new FBHandler(opt);
    log.HilLog( getFileName, log.getLineNumber(), "New FBHandler for interface [" + opt.expectedInterfaceName + "] created!", "info");
    return fieldbus_handler;
  },
  setup: function (localRED, settings) {
    RED = localRED;
    localFieldbusSettings = settings;
  }
};

