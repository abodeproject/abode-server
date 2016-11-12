if [ $(tty) == "/dev/tty1" ]; then
    rm -rf .cache/chromium/Default/Cache
    while true; do startx -- -nocursor ; echo "Again [$?]..."; sleep 10; done
fi
