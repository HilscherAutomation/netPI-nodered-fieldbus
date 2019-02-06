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
/* jshint indent: false */
/* jshint white: false */
var exports = module.exports = {};

var EnumChannelType = [{
    number: 0,
    name: "CHANNEL_TYPE_UNDEFINED"
}, {
    number: 1,
    name: "CHANNEL_TYPE_NOT_AVAILABLE"
}, {
    number: 2,
    name: "CHANNEL_TYPE_RESERVED"
}, {
    number: 3,
    name: "CHANNEL_TYPE_SYSTEM"
}, {
    number: 4,
    name: "CHANNEL_TYPE_HANDSHAKE"
}, {
    number: 5,
    name: "CHANNEL_TYPE_COMMUNICATION"
}, {
    number: 6,
    name: "CHANNEL_TYPE_APPLICATION"
}];

exports.EnumBusState = {
    BUS_STATE_NO_COMMUNICATION: 0,
    BUS_STATE_COMMUNICATING: 1
};
/*
 * Since 04/18/2016 we will only show communication classes which implements cyclic IO-Data
 */
/* jshint laxcomma: true */
var EnumCommClass = [{
    number: 0,
    name: "COMM_CLASS_UNDEFINED",
    userFriendlyName: "UNDEFINED"
  } 
  //, {
  //  number: 1,
  //  name: "COMM_CLASS_UNCLASSIFIABLE",
  //  userFriendlyName: "UNCLASSIFIABLE"
  //} 
  , {
    number: 2,
    name: "COMM_CLASS_MASTER",
    userFriendlyName: "Master"
  } 
  , {
    number: 3,
    name: "COMM_CLASS_SLAVE",
    userFriendlyName: "Slave"
  } 
  , {
    number: 4,
    name: "COMM_CLASS_SCANNER",
    userFriendlyName: "Scanner"
  } 
  , {
    number: 5,
    name: "COMM_CLASS_ADAPTER",
    userFriendlyName: "Adapter"
  } 
  //, {
  //  number: 6,
  //  name: "COMM_CLASS_MESSAGING",
  //  userFriendlyName: "Messaging"
  //} 
  , {
    number: 7,
    name: "COMM_CLASS_CLIENT",
    userFriendlyName: "Client"
  } 
  , {
    number: 8,
    name: "COMM_CLASS_SERVER",
    userFriendlyName: "Server"
  } 
  , {
    number: 9,
    name: "COMM_CLASS_IO_CONTROLLER",
    userFriendlyName: "Controller"
  } 
  , {
    number: 10,
    name: "COMM_CLASS_IO_DEVICE",
    userFriendlyName: "Device"
  } 
  //, {
  //  number: 11,
  //  name: "COMM_CLASS_IO_SUPERVISOR",
  //  userFriendlyName: "Supervisor"
  //} 
  //, {
  //  number: 12,
  //  name: "COMM_CLASS_GATEWAY",
  //  userFriendlyName: "Gateway"
  //} 
  //, {
  //  number: 13,
  //  name: "COMM_CLASS_MONITOR",
  //  userFriendlyName: "Monitor / ANALYZER"
  //} 
  //, {
  //  number: 14,
  //  name: "COMM_CLASS_PRODUCER",
  //  userFriendlyName: "Producer"
  //} 
  //, {
  //  number: 15,
  //  name: "COMM_CLASS_CONSUMER",
  //  userFriendlyName: "Consumer"
  //} 
  //, {
  //  number: 16,
  //  name: "COMM_CLASS_SWITCH",
  //  userFriendlyName: "Switch"
  //} 
  //, {
  //  number: 17,
  //  name: "COMM_CLASS_HUB",
  //  userFriendlyName: "Hub"
  //} 
  //, {
  //  number: 18,
  //  name: "COMM_CLASS_COMBI",
  //  userFriendlyName: "Combination Firmware"
  //} 
  //, {
  //  number: 19,
  //  name: "COMM_CLASS_MANAGING_NODE",
  //  userFriendlyName: "Managing Node"
  //} 
  //, {
  //  number: 20,
  //  name: "COMM_CLASS_CONTROLLED_NODE",
  //  userFriendlyName: "Controlled Node"
  //} 
  //, {
  //  number: 21,
  //  name: "COMM_CLASS_PLC",
  //  userFriendlyName: "Programmable Logic Controller (PLC)"
  //} 
  //, {
  //  number: 22,
  //  name: "COMM_CLASS_HMI",
  //  userFriendlyName: "Human Machine Interface (HMI)"
  //} 
  //, {
  //  number: 23,
  //  name: "COMM_CLASS_ITEM_SERVER",
  //  userFriendlyName: "Item Server"
  //}
];
/* jshint laxcomma: false */
/* jshint laxcomma: true */
var EnumProtocolClass = [{
    number: 0,
    name: "PROT_CLASS_UNDEFINED",
    userFriendlyName: "UNDEFINED"
  }
  , {
    number: 1,
    name: "PROT_CLASS_3964R",
    userFriendlyName: "3964R"
  }
  , {
    number: 2,
    name: "PROT_CLASS_ASINTERFACE",
    userFriendlyName: "AS Interface"
  }
  , {
    number: 3,
    name: "PROT_CLASS_ASCII",
    userFriendlyName: "ASCII"
  }
  , {
    number: 4,
    name: "PROT_CLASS_CANOPEN",
    userFriendlyName: "CANopen"
  }
  , {
    number: 5,
    name: "PROT_CLASS_CCLINK",
    userFriendlyName: "CC-Link"
  }
  , {
    number: 6,
    name: "PROT_CLASS_COMPONET",
    userFriendlyName: "CompoNet"
  }
  , {
    number: 7,
    name: "PROT_CLASS_CONTROLNET",
    userFriendlyName: "ControlNet"
  }
  , {
    number: 8,
    name: "PROT_CLASS_DEVICENET",
    userFriendlyName: "DeviceNet"
  }
  , {
    number: 9,
    name: "PROT_CLASS_ETHERCAT",
    userFriendlyName: "EtherCAT"
  }
  , {
    number: 10,
    name: "PROT_CLASS_ETHERNET_IP",
    userFriendlyName: "EtherNet/IP"
  }
  , {
    number: 11,
    name: "PROT_CLASS_FOUNDATION_FB",
    userFriendlyName: "Foundation Fieldbus"
  }
  , {
    number: 12,
    name: "PROT_CLASS_FL_NET",
    userFriendlyName: "FL Net"
  }
  , {
    number: 13,
    name: "PROT_CLASS_INTERBUS",
    userFriendlyName: "InterBus"
  }
  , {
    number: 14,
    name: "PROT_CLASS_IO_LINK",
    userFriendlyName: "IO-Link"
  }
  , {
    number: 15,
    name: "PROT_CLASS_LON",
    userFriendlyName: "LON"
  }
  , {
    number: 16,
    name: "PROT_CLASS_MODBUS_PLUS",
    userFriendlyName: "Modbus Plus"
  }
  , {
    number: 17,
    name: "PROT_CLASS_MODBUS_RTU",
    userFriendlyName: "Modbus RTU"
  }
  , {
    number: 18,
    name: "PROT_CLASS_OPEN_MODBUS_TCP",
    userFriendlyName: "Open Modbus TCP"
  }
  , {
    number: 19,
    name: "PROT_CLASS_PROFIBUS_DP",
    userFriendlyName: "PROFIBUS DP"
  }
  , {
    number: 20,
    name: "PROT_CLASS_PROFIBUS_MPI",
    userFriendlyName: "PROFIBUS MPI"
  }
  , {
    number: 21,
    name: "PROT_CLASS_PROFINET_IO",
    userFriendlyName: "PROFINET IO"
  }
  , {
    number: 22,
    name: "PROT_CLASS_RK512",
    userFriendlyName: "RK512"
  }
  , {
    number: 23,
    name: "PROT_CLASS_SERCOS_II",
    userFriendlyName: "SERCOS II"
  }
  , {
    number: 24,
    name: "PROT_CLASS_SERCOS_III",
    userFriendlyName: "SERCOS III"
  }
  , {
    number: 25,
    name: "PROT_CLASS_TCP_IP_UDP_IP",
    userFriendlyName: "TCP/IP, UDP/IP"
  }
  , {
    number: 26,
    name: "PROT_CLASS_POWERLINK",
    userFriendlyName: "Powerlink"
  }
  , {
    number: 27,
    name: "PROT_CLASS_HART",
    userFriendlyName: "HART"
  }
  , {
    number: 28,
    name: "PROT_CLASS_COMBI",
    userFriendlyName: "COMBINATION FIRMWARE"
  } 
  //, {
  //  number: 29,
  //  name: "PROT_CLASS_PROG_GATEWAY",
  //  userFriendlyName: "Programmable Gateway"
  //} 
  //, {
  //  number: 30,
  //  name: "PROT_CLASS_PROG_SERIAL",
  //  userFriendlyName: "Programmable Serial"
  //}
  //, {
  //  number: 31,
  //  name: "PROT_CLASS_PLC_CODESYS",
  //  userFriendlyName: "PLC: CoDeSys"
  //}
  //, {
  //  number: 32,
  //  name: "PROT_CLASS_PLC_PROCONOS",
  //  userFriendlyName: "PLC: ProConOS"
  //}
  //, {
  //  number: 33,
  //  name: "PROT_CLASS_PLC_IBH_S7",
  //  userFriendlyName: "PLC: IBH S7"
  //}
  //, {
  //  number: 34,
  //  name: "PROT_CLASS_PLC_ISAGRAF",
  //  userFriendlyName: "PLC: ISaGRAF"
  //}
  //, {
  //  number: 35,
  //  name: "PROT_CLASS_VISU_QVIS",
  //  userFriendlyName: "Visualization: QviS"
  //}
  //, {
  //  number: 36,
  //  name: "PROT_CLASS_ETHERNET",
  //  userFriendlyName: "Ethernet"
  //}
  //, {
  //  number: 37,
  //  name: "PROT_CLASS_RFC1006",
  //  userFriendlyName: "RFC1006"
  //}
  //, {
  //  number: 38,
  //  name: "PROT_CLASS_DF1",
  //  userFriendlyName: "DF1"
  //}
  //, {
  //  number: 39,
  //  name: "PROT_CLASS_VARAN",
  //  userFriendlyName: "VARAN"
  //}
  //, {
  //  number: 40,
  //  name: "PROT_CLASS_3S_PLC_HANDLER",
  //  userFriendlyName: "3S PLC Handler"
  //}
];
/* jshint laxcomma: false */

var EnumDataType = [{
    number: 0,
    name: "eUnknownDataType"
  }, {
    number: 1,
    name: "eBit"
  }, {
    number: 2,
    name: "eUnsigned8"
  }, {
    number: 3,
    name: "eUnsigned16"
  }, {
    number: 4,
    name: "eUnsigned24"
  }, {
    number: 5,
    name: "eUnsigned32"
  }, {
    number: 6,
    name: "eUnsigned40"
  }, {
    number: 7,
    name: "eUnsigned48"
  }, {
    number: 8,
    name: "eUnsigned56"
  }, {
    number: 9,
    name: "eUnsigned64"
  }, {
    number: 10,
    name: "eSigned8"
  }, {
    number: 11,
    name: "eSigned16"
  }, {
    number: 12,
    name: "eSigned24"
  }, {
    number: 13,
    name: "eSigned32"
  }, {
    number: 14,
    name: "eSigned40"
  }, {
    number: 15,
    name: "eSigned48"
  }, {
    number: 16,
    name: "eSigned56"
  }, {
    number: 17,
    name: "eSigned64"
  }, {
    number: 18,
    name: "eReal"
  }, {
    number: 19,
    name: "eDouble"
  }, {
    number: 20,
    name: "eAscii"
  }, {
    number: 21,
    name: "eBstr"
  }, {
    number: 22,
    name: "eOctetString"
  }, {
    number: 23,
    name: "eTime"
  }, {
    number: 24,
    name: "eDate"
}];

exports.GetProtClassName = function (protClass, userFriendly) {
  "use strict";
  for (var n = 0; n < EnumProtocolClass.length; n++) {
    if (protClass === EnumProtocolClass[n].number) {
      if (userFriendly === undefined || userFriendly === false) {
        return EnumProtocolClass[n].name;
      } else {
        return EnumProtocolClass[n].userFriendlyName;
      }
    }
  }
  if (userFriendly === undefined || userFriendly === false) {
    return EnumProtocolClass[0].name;
  } else {
    return EnumProtocolClass[0].userFriendlyName;
  }
};
exports.GetProtClassNumber = function (protClassName) {
  "use strict";
  for (var n = 0; n < EnumProtocolClass.length; n++) {
    if (protClassName === EnumProtocolClass[n].name || protClassName === EnumProtocolClass[n].userFriendlyName) {
      return EnumProtocolClass[n].number;
    }
  }
  return -1;
};
exports.GetCommClassName = function (commClass, userFriendly) {
  "use strict";
  for (var n = 0; n < EnumCommClass.length; n++) {
    if (commClass === EnumCommClass[n].number) {
      if (userFriendly === undefined || userFriendly === false) {
        return EnumCommClass[n].name;
      } else {
        return EnumCommClass[n].userFriendlyName;
      }
    }
  }
  if (userFriendly === undefined || userFriendly === false) {
    return EnumCommClass[0].name;
  } else {
    return EnumCommClass[0].userFriendlyName;
  }
};
exports.GetCommClassNumber = function (commClassName) {
  "use strict";
  for (var n = 0; n < EnumCommClass.length; n++) {
    if (commClassName === EnumCommClass[n].name || commClassName === EnumCommClass[n].userFriendlyName) {
      return EnumCommClass[n].number;
    }
  }
  return -1;
};
exports.getChannelTypeName = function (channelType) {
  "use strict";
  for (var n = 0; n < EnumChannelType.length; n++) {
    if (channelType === EnumChannelType[n].number) {
      return EnumChannelType[n].name;
    }
  }
  return undefined;
};
exports.GetDataTypeNumber = function (dataTypeName) {
  "use strict";
  for (var n = 0; n < EnumDataType.length; n++) {
    if (dataTypeName === EnumDataType[n].name) {
      return EnumDataType[n].number;
    }
  }
  return undefined;
};
exports.getDataTypeName = function (dataType) {
  "use strict";
  for (var n = 0; n < EnumDataType.length; n++) {
    if (dataType === EnumDataType[n].number) {
      return EnumDataType[n].name;
    }
  }
  return undefined;
};
exports.GetTimestamp = function () {
  "use strict";
  var date = new Date();
  var ms = date.getUTCMilliseconds();
  var s = date.getUTCSeconds();
  var mi = date.getUTCMinutes();
  var h = date.getUTCHours();
  var d = date.getUTCDate();
  var mo = date.getUTCMonth() + 1;
  var y = date.getUTCFullYear();
  return "UTC[" + mo.toString() + "/" + 
                  d.toString() + "/" + 
                  y.toString() + " " + 
                  h.toString() + ":" + 
                  mi.toString() + ":" + 
                  s.toString() + ":" + 
                  ms.toString() + "] ";
};
var EnumErrorCode = [{
    'Error': 0x80001000,
    'AddDesc': 'The expected firmware (@1) was not found on board: @2. Currently loaded is (@3)',
    'Timestamp': undefined,
    'name': "FirmwareNotFound"
  }, {
    'Error': 0x80001001,
    'AddDesc': 'Board not found(@1)',
    'Timestamp': undefined,
    'name': "BoardNotFound"
  }, {
    'Error': 0x80001002,
    'AddDesc': 'No boards available',
    'Timestamp': undefined,
    'name': "NoBoardAvailable"
  }, {
    'Error': 0x80001003,
    'AddDesc': 'Function call with invalid parameter (@1)',
    'Timestamp': undefined,
    'name': "InvalidParameter"
  }, {
    'Error': 0x80001004,
    'AddDesc': 'The response in function [@1] is [@2]. Expected is [@3]',
    'Timestamp': undefined,
    'name': "ResponseError"
  }, {
    'Error': 0x80001005,
    'AddDesc': 'The signal (@1) is invalid.',
    'Timestamp': undefined,
    'name': "SignalInvalid"
  }, {
    'Error': 0x80001006,
    'AddDesc': "OUT_NODE expects the property 'Value' or 'value' in it's payload. Given is: @1",
    'Timestamp': undefined,
    'name': "ValueInvalid"
  }, {
    'Error': 0x80001007,
    'AddDesc': "Exception caught: @1",
    'Timestamp': undefined,
    'name': "ExceptionCaught"
  }, {
    'Error': 0x80001008,
    'AddDesc': "OUT_NODE expects the property 'payload' as an object",
    'Timestamp': undefined,
    'name': "PayloadError"
  }, {
    'Error': 0x80001009,
    'AddDesc': "An assignment with a valid configuration node is missed",
    'Timestamp': undefined,
    'name': "InvalidConfig"
  }];

exports.GetError = function (name) {
  "use strict";
  for (var n = 0; n < EnumErrorCode.length; n++) {
    if (name === EnumErrorCode[n].name) {
      var ret = JSON.parse(JSON.stringify(EnumErrorCode[n]));
      ret.Timestamp = new Date().getTime();
      return ret;
    }
  }
  return undefined;
};
exports.internalTestID = "+~*'#;:_";
exports.internalTestDevNo = 9192939;
exports.internalTestSerNo = 0;
exports.splitInterfaceName = function (itfName, file, line) {
  var ret = {
    'boardName': undefined,
    'prtName': undefined,
    'className': undefined
  };
  if (itfName) {
    var comp = itfName.split(':');
    if (comp.length) {
      if (comp[0].search('cifX') !== -1) {
        ret.boardName = comp[0].trim();
        ret.prtName = comp[1].trim();
        ret.className = comp[2].trim();
      } else {
        ret.boardName = comp[2].trim();
        ret.prtName = comp[0].trim();
        ret.className = comp[1].trim();
      }
    }
  } else {
    console.log("TOOLBOX:splitInterfaceName called from (" + file + ":" + line + ") with invalid parameter");
  }
  return ret;
};

