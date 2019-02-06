#!/bin/bash +e
# catch signals as PID 1 in a container

# SIGNAL-handler
term_handler() {

  /etc/init.d/nodered.sh stop

  /etc/init.d/webconfig.sh stop

  exit 143; # 128 + 15 -- SIGTERM
}

# on callback, stop all started processes in term_handler
trap 'kill ${!}; term_handler' SIGINT SIGKILL SIGTERM SIGQUIT SIGTSTP SIGSTOP SIGHUP

# run applications in the background
/opt/cifx/checkdevicetype | xargs /etc/init.d/nodered.sh start

/etc/init.d/webconfig.sh start

# wait forever not to exit the container
while true
do
  tail -f /dev/null & wait ${!}
done

exit 0
