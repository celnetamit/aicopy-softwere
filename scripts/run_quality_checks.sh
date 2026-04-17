#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[1/3] Python compile checks"
python3 -m py_compile main.py webapp.py document_processor.py chicago_editor.py

echo "[2/3] Frontend syntax checks"
node --check web/app.js
node --check web/eel_web_bridge.js

echo "[3/3] Regression tests"
python3 -m unittest discover -s tests -p "test_*.py" -v

echo "All quality checks passed."
