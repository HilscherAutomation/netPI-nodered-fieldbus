#use latest armv7hf compatible debian version from group resin.io as base image
FROM resin/armv7hf-debian:jessie

#enable building ARM container on x86 machinery on the web (comment out next line if built on Raspberry) 
RUN [ "cross-build-start" ]

#labeling
LABEL maintainer="netpi@hilscher.com" \ 
      version="V0.9.1.0" \
      description="Node-RED with Fieldbus Nodes for netPI RTE 3 (and Pi 3 + NHAT 52-RTE)"

#version
ENV HILSCHERNETPI_NODERED_FB_VERSION 0.9.1.0

#copy files
COPY "./init.d/*" /etc/init.d/
COPY "./node-red-contrib-fieldbus/*" "./node-red-contrib-fieldbus/lib/*" "./firmwares/*" "./driver/*" "./web-configurator-fieldbus/*" /tmp/

#do installation
RUN apt-get update  \
    && apt-get install curl libboost-filesystem1.55-dev libboost-date-time1.55-dev libjansson-dev p7zip-full build-essential \
#install node.js
    && curl -sL https://deb.nodesource.com/setup_6.x | sudo -E bash -  \
    && apt-get install -y nodejs  \
#install Node-RED
    && npm install -g --unsafe-perm node-red \
#install netx driver
    && dpkg -i /tmp/netx-drv-1.1.0.deb \
#compile program checking whether we are running on netPI RTE 3 or on Pi with NHAT 52-RTE
    && mv /tmp/checkdevicetype.c /opt/cifx \
    && gcc /opt/cifx/checkdevicetype.c -o /opt/cifx/checkdevicetype -I /usr/include/cifx -lcifx \
    && chmod +x /opt/cifx/checkdevicetype \
#install fieldbus web configurator
    && 7z -t7z -r -v: x "/tmp/WebConfigurator_V1.0200.725.7z" -o/usr/lib/node_modules \
    && mv "/usr/lib/node_modules/WebConfigurator V1.0200.725" "/usr/lib/node_modules/WebConfigurator" \
    && cd /usr/lib/node_modules/WebConfigurator/ServerContent/ \
    && npm install \
    && sed -i -e 's;"uiHost":"127.0.0.1";\"uiHost":"";' ServerSettings.json \
    && sed -i -e 's;"configuration-file-path":"/opt/node-red/.userdir";\"configuration-file-path":"/root/.node-red/";' ServerSettings.json \
    && sed -i -e 's;"platform":"";\"platform":"npi3";' ServerSettings.json \
#install nodes
    && mkdir /root/.node-red \
    && mv /tmp/fieldbusSettings.json /root/.node-red \
    && mkdir /usr/lib/node_modules/node-red/nodes/hilscher /usr/lib/node_modules/node-red/nodes/hilscher/fieldbus /usr/lib/node_modules/node-red/nodes/hilscher/fieldbus/lib \
    && mv /tmp/10-fieldbus.html /tmp/10-fieldbus.js /tmp/package.json -t /usr/lib/node_modules/node-red/nodes/hilscher/fieldbus \
    && mv /tmp/fieldbusConnectionPool.js /tmp/fieldbusHandler.js /tmp/fieldbus.node /tmp/HilscherLog.js /tmp/HilscherToolBox.js  /usr/lib/node_modules/node-red/nodes/hilscher/fieldbus/lib \
    && cd /usr/lib/node_modules/node-red/nodes/hilscher/fieldbus \
    && npm install \
#install netx firmwares
    && mkdir /opt/cifx/deviceconfig/FW /opt/cifx/deviceconfig/FW/channel0 \
    && 7z -tzip -r -v: x "/tmp/FWPool.zip" -o/root/.node-red \
#clean up
    && rm -rf /tmp/* \
    && apt-get remove p7zip-full curl \
    && apt-get -yqq autoremove \
    && apt-get -y clean \
    && rm -rf /var/lib/apt/lists/* 

#set the entrypoint
ENTRYPOINT ["/etc/init.d/entrypoint.sh"]

#Node-RED and fieldbus web configurator ports
EXPOSE 1880 9000

#set STOPSGINAL
STOPSIGNAL SIGTERM

#stop processing ARM emulation (comment out next line if built on Raspberry)
RUN [ "cross-build-end" ]
