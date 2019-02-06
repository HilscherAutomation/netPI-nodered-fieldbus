#!/bin/sh
### BEGIN INIT INFO
# description: Node-RED daemon
# processname: node-red
### END INIT INFO

DAEMON_PATH="/usr/bin/"

DAEMON=node-red
DAEMONOPTS=""

NAME=node-red
DESC="Node-RED"
PIDFILE=/var/run/$NAME.pid
SCRIPTNAME=/etc/init.d/$NAME


case "$1" in
start)
       if [ "$2" = "netHAT" ]
       then
           echo "Pi with NHAT 52-RTE detected"

           #copy NHAT firmware pool to location where fieldbus node is looking for firmwares
           rm -r /root/.node-red/FWPool
           cp -r /root/.node-red/FWnetHAT /root/.node-red/FWPool

           if [ "$FIELD" = "pns" ]
           then
              firmware="X070D000.nxf"
           elif [ "$FIELD" = "eis" ]
           then
             firmware="X070H000.nxf"
           else
              firmware="X070D000.nxf"
           fi

           #copy NHAT firmware to location where driver will load it from
           if [ ! -f /opt/cifx/deviceconfig/FW/channel0/*.nxf ]
           then
             cp /root/.node-red/FWPool/$firmware /opt/cifx/deviceconfig/FW/channel0/$firmware
           fi

        elif [ "$2" = "netPI" ]
        then
           echo "netPI RTE 3 detected"

           #copy netPI RTE 3 firmware pool to location where fieldbus node is looking for firmwares
           rm -r /root/.node-red/FWPool
           cp -r /root/.node-red/FWnetPI /root/.node-red/FWPool

           if [ "$FIELD" = "pns" ]
           then
              firmware="R160D000.nxf"
           elif [ "$FIELD" = "eis" ]
           then
              firmware="R160H000.nxf"
           else
              firmware="R160D000.nxf"
           fi

           #copy netPI firmware to location where driver will load it from
           if [ ! -f /opt/cifx/deviceconfig/FW/channel0/*.nxf ]; then
             cp /root/.node-red/FWPool/$firmware /opt/cifx/deviceconfig/FW/channel0/$firmware
           fi
        else
           echo "unknown hardware detected, cannot start"
           exit 1
        fi

	printf "%-50s" "Starting $NAME..."
	cd $DAEMON_PATH
	PID=`$DAEMON $DAEMONOPTS > /dev/null 2>&1 & echo $!`
	#echo "Saving PID" $PID " to " $PIDFILE
        if [ -z $PID ]; then
            printf "%s\n" "Fail"
        else
            echo $PID > $PIDFILE
            printf "%s\n" "Ok"
        fi
;;
status)
        printf "%-50s" "Checking $NAME..."
        if [ -f $PIDFILE ]; then
            PID=`cat $PIDFILE`
            if [ -z "`ps axf | grep ${PID} | grep -v grep`" ]; then
                printf "%s\n" "Process dead but pidfile exists"
            else
                echo "Running"
            fi
        else
            printf "%s\n" "Service not running"
        fi
;;
stop)
        printf "%-50s" "Stopping $NAME"
            PID=`cat $PIDFILE`
            cd $DAEMON_PATH
        if [ -f $PIDFILE ]; then
            kill -HUP $PID
            printf "%s\n" "Ok"
            rm -f $PIDFILE
        else
            printf "%s\n" "pidfile not found"
        fi
;;

restart)
  	$0 stop
  	$0 start
;;

*)
        echo "Usage: $0 {status|start|stop|restart}"
        exit 1
esac
:

