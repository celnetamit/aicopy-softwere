#!/bin/bash
# Run Manuscript Editor
cd "$(dirname "$0")"

# Use Wayland platform for Qt
export QT_QPA_PLATFORM=wayland

python3 main.py