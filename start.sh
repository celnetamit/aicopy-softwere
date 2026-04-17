#!/bin/bash
# Start Manuscript Editor Web App and open in browser
cd "$(dirname "$0")"

echo "Starting Manuscript Editor..."
python3 main.py &

# Wait for server to start
sleep 3

# Open in default browser
if command -v xdg-open &> /dev/null; then
    xdg-open http://localhost:8000
elif command -v open &> /dev/null; then
    open http://localhost:8000
else
    echo "Please open your browser and go to: http://localhost:8000"
fi

echo "Manuscript Editor is running at http://localhost:8000"
echo "Press Ctrl+C to stop the server"

wait