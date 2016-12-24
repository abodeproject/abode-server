if [ $(tty) == "/dev/tty1" ]; then
	clear
	echo -n "Clearing Chomium Cache..."
    rm -rf .cache/chromium/Default/Cache
	echo "done"
	echo -n "Upgrading Server..."
    cd abode-server
    git pull && npm install &>/dev/null
	echo "done"
    cd ../abode-ui
	echo -n "Upgrading UI..."
    git pull && npm install &>/dev/null
	echo "done"
	echo -n "Starting Abode UI..."
    while true; do startx -- -nocursor ; echo "crashed ($?)"; echo "Starting Abode UI in 10 Seconds ..."; sleep 10; done
fi