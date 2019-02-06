## Node-RED + fieldbus nodes

[![](https://images.microbadger.com/badges/image/hilschernetpi/netpi-nodered-fieldbus.svg)](https://microbadger.com/images/hilschernetpi/netpi-nodered-fieldbus "Node-RED + fieldbus nodes")
[![](https://images.microbadger.com/badges/commit/hilschernetpi/netpi-nodered-fieldbus.svg)](https://microbadger.com/images/hilschernetpi//netpi-nodered-fieldbus "Node-RED + fieldbus nodes")
[![Docker Registry](https://img.shields.io/docker/pulls/hilschernetpi/netpi-nodered-fieldbus.svg)](https://registry.hub.docker.com/u/hilschernetpi/netpi-nodered-fieldbus/)&nbsp;
[![Image last updated](https://img.shields.io/badge/dynamic/json.svg?url=https://api.microbadger.com/v1/images/hilschernetpi/netpi-nodered-fieldbus&label=Image%20last%20updated&query=$.LastUpdated&colorB=007ec6)](http://microbadger.com/images/hilschernetpi/netpi-nodered-fieldbus "Image last updated")&nbsp;

Made for [netPI RTE 3](https://www.netiot.com/netpi/), the Raspberry Pi 3B Architecture based industrial suited Open Edge Connectivity Ecosystem *(runs also on Pi + [NHAT 52-RTE](https://www.nethat.net/))*

### Debian with Node-RED and fieldbus nodes to exchange IO data with Real-Time Ethernet systems

The image provided hereunder deploys a container with installed Debian, Node-RED and two nodes "fieldbus" communicating with netPI RTE 3's onboard Industrial Network Controller netX to exchange cyclic IO process data with Real-Time Ethernet networks.

Base of this image builds [debian](https://www.balena.io/docs/reference/base-images/base-images/) with installed Internet of Things flow-based programming web-tool [Node-RED](https://nodered.org/), two extra nodes *fieldbus in* and *fieldbus out* and a fieldbus IO configurator as web server application. The nodes initialize netX as PROFINET IO device or EtherNet/IP adapter (type of protocol configureable at container start) allowing the exchange of cyclic IO process data with PLCs such as Siemens S7 or Allen Bradley and your flow.

The container checks automatically whether it is running on a netPI RTE 3 or on a standard Pi + NHAT 52-RTE and loads the appropriate netX firmware accordingly.

#### Container prerequisites

##### Port mapping

To allow the access to the Node-RED programming over a web browser the container TCP port `1880` needs to be exposed to the host.

To grant access to the containerized fieldbus configurator web server application the container TCP port `9000` needs to be exposed to the host port `9000` fixed.

##### Host device

To grant access to the netX from inside the container the `/dev/spidev0.0` host device needs to be added to the container.
*(If using a Pi make sure the device /dev/spidev0.0 is activated. If not use `raspi-config` tool to enable it.)*

##### Environment Variables

The type of field network protocol loaded into netX is configured through the following variable

* **FIELD** with value `pns` to load PROFINET IO device or value `eis` to load EtherNet/IP adapter network protocol

#### Getting started

##### On netPI RTE 3

STEP 1. Open netPI's website in your browser (https).

STEP 2. Click the Docker tile to open the [Portainer.io](http://portainer.io/) Docker management user interface.

STEP 3. Enter the following parameters under *Containers > + Add Container*

Parameter | Value | Remark
:---------|:------ |:------
*Image* | **hilschernetpi/netpi-nodered-fieldbus**
*Port mapping* | *host* **1880** -> *container* **1880** | *host*=any unused
*Port mapping* | *host* **9000** -> *container* **9000** | 
*Restart policy* | **always**
*Runtime > Env* | *name* **FIELD** -> *value* **pns** or **eis** |
*Runtime > Devices > +add device* | *Host path* **/dev/spidev0.0** -> *Container path* **/dev/spidev0.0** |

STEP 4. Press the button *Actions > Start/Deploy container*

Pulling the image may take a while (5-10mins). Sometimes it may take too long and a time out is indicated. In this case repeat STEP 4.

##### On Pi + NHAT 52-RTE

STEP 1. Establish a [console](https://www.raspberrypi.org/documentation/usage/terminal/README.md) connection to Pi.

STEP 2. [Install](https://www.raspberrypi.org/blog/docker-comes-to-raspberry-pi/) Docker if not already done, else skip. 

STEP 3. Run a container instance of the image using the following command lines

PROFINET IO slave:   `docker run -p 1880:1880 -p 9000:9000 --device=/dev/spidev0.0 -e "FIELD=pns" --restart=always hilschernetpi/netpi-nodered-fieldbus`

EtherNet/IP adapter: `docker run -p 1880:1880 -p 9000:9000 --device=/dev/spidev0.0 -e "FIELD=eis" --restart=always hilschernetpi/netpi-nodered-fieldbus`

#### Accessing

The container starts Node-RED automatically when started.

Open Node-RED in your browser with `http://<netPi ip address>:<mapped host port>` (NOT https://) e.g. `http://192.168.0.1:1880`. Use the two extra nodes *fieldbus in* and *fieldbus out* in the nodes library for exchanging process IO data with netX and the rest of your flow. The nodes' info tab explains how to use the nodes.

Use the electronic data sheets in the folder `electronic-data-sheets` to feed your PLC/master engineering software with device related data.

In case of PROFINET please keep in mind that a virgin netX needs a PROFINET device name setup over the network as described [here](https://profinetuniversity.com/profinet-basics/dcp/profinet-dcp/). Use your engineering software to assign a corresponding name (e.g."niotenpi351enrepns" which is default).

#### Automated build

The project complies with the scripting based [Dockerfile](https://docs.docker.com/engine/reference/builder/) method to build the image output file. Using this method is a precondition for an [automated](https://docs.docker.com/docker-hub/builds/) web based build process on DockerHub platform.

DockerHub web platform is x86 CPU based, but an ARM CPU coded output file is needed for Raspberry systems. This is why the Dockerfile includes the [balena.io](https://balena.io/blog/building-arm-containers-on-any-x86-machine-even-dockerhub/) steps.

#### License

View the license information for the software in the project. As with all Docker images, these likely also contain other software which may be under other licenses (such as Bash, etc from the base distribution, along with any direct or indirect dependencies of the primary software being contained).
As for any pre-built image usage, it is the image user's responsibility to ensure that any use of this image complies with any relevant licenses for all software contained within.

[![N|Solid](http://www.hilscher.com/fileadmin/templates/doctima_2013/resources/Images/logo_hilscher.png)](http://www.hilscher.com)  Hilscher Gesellschaft fuer Systemautomation mbH  www.hilscher.com
