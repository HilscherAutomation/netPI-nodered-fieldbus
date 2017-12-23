## Node-RED + fieldbus nodes

Made for [netPI RTE 3](https://www.netiot.com/netpi/), the Open Edge Connectivity Ecosystem 
*(runs also with Pi + [NHAT 52-RTE](https://www.nethat.net/))*

### Debian with Node-RED and fieldbus nodes to access netX

The image provided hereunder deploys a container with installed Debian, Node-RED and fieldbus nodes to communicate with the onboard Industrial Network Controller netX.

Base of this image builds a tagged version of [debian:jessie](https://hub.docker.com/r/resin/armv7hf-debian/tags/) with installed Internet of Things flow-based programming web-tool [Node-RED](https://nodered.org/), two extra nodes *fieldbus in* and *fieldbus out* and a fieldbus configurator as web server application. The nodes initialize netX as PROFINET device or EtherNet/IP adaptor allowing the exchange of cyclic IO process data with PLCs such as Siemens S7 or Allen Bradley and your flow.

The container checkes whether it runs on a netPI RTE 3 or on a Pi with NHAT 52-RTE on top and adjusts the netX firmware accordingly.

#### Container prerequisites

##### Port mapping

To allow the access to the Node-RED programming over a web browser the container TCP port `1880` needs to be exposed to the host.

To grant access to the containerized fieldbus configurator web server application the container TCP port `9000` needs to be exposed to the host port `9000` fixed.

##### Host network

The container needs the "Host" network stack to be shared with the container.

##### Host device

To grant access to the netX from inside the container the `/dev/spidev0.0` host device needs to be added to the container.
*(If using a Pi make sure the device /dev/spidev0.0 is activated. If not use `raspi-config` tool to enable it.)*

#### Getting started

##### On netPI RTE 3

STEP 1. Open netPI's landing page under `https://<netpi's ip address>`.

STEP 2. Click the Docker tile to open the [Portainer.io](http://portainer.io/) Docker management user interface.

STEP 3. Enter the following parameters under **Containers > Add Container**

* **Image**: `hilschernetpi/netpi-nodered-fieldbus`

* **Port mapping**: `Host "1880" (any unused one) -> Container "1880"`and`Host "9000" -> Container "9000"`

* **Network > Network**: `Host`

* **Restart policy"** : `always`

* **Runtime > Devices > add device**: `Host "/dev/spidev0.0" -> Container "/dev/spidev0.0"`

STEP 4. Press the button **Actions > Start container**

Pulling the image from Docker Hub may take up to 5 minutes.

##### On Pi + NHAT 52-RTE

STEP 1. Establish a [console](https://www.raspberrypi.org/documentation/usage/terminal/README.md) connection to Pi.

STEP 2. [Install](https://www.raspberrypi.org/blog/docker-comes-to-raspberry-pi/) Docker if not already done, else skip. 

STEP 3. Run a container instance of the image using the following command line

`docker run -p 1880:1880 -p 9000:9000 --device=/dev/spidev0.0 --restart=always --network=host hilschernetpi/netpi-nodered-fieldbus`

#### Accessing

The container starts Node-RED automatically.

Open Node-RED in your browser with `http://<netPi ip address>:<mapped host port>` (NOT https://) e.g. `http://192.168.0.1:1880`. Use the two extra nodes *fieldbus in* and *fieldbus out* in the nodes library for exchanging process data with netX in your flow. The nodes' info tab explains how to use the nodes.

Use the electronic data sheets in the folder `electronic-data-sheets` to feed your PLC/master engineering software with device related data.

#### Tags

* **hilscher/netPI-nodered-fieldbus:latest** - non-versioned latest development output of the master branch. Can run on any netPI RTE 3 system software version or Pi with NHAT 52-RE module on top.

#### GitHub sources
The image is built from the GitHub project [netPI-nodered-fieldbus](https://github.com/Hilscher/netPI-nodered-fieldbus). It complies with the [Dockerfile](https://docs.docker.com/engine/reference/builder/) method to build a Docker image [automated](https://docs.docker.com/docker-hub/builds/).

To build the container for an ARM CPU on [Docker Hub](https://hub.docker.com/)(x86 based) the Dockerfile uses the method described here [resin.io](https://resin.io/blog/building-arm-containers-on-any-x86-machine-even-dockerhub/).

[![N|Solid](http://www.hilscher.com/fileadmin/templates/doctima_2013/resources/Images/logo_hilscher.png)](http://www.hilscher.com)  Hilscher Gesellschaft fuer Systemautomation mbH  www.hilscher.com
