#!/bin/bash

xset s noblank
xset s off
xset -dpms

chromium-browser --kiosk  http://localhost
while true; do date +'%l:%M %p'; sleep 5; done | dzen2 -p -h 480 -fn 'DejaVu Sans Mono-160:Bold-Oblique'
