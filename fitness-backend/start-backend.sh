#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if command -v python3 >/dev/null 2>&1; then
  PYTHON_BIN="python3"
elif command -v python >/dev/null 2>&1; then
  PYTHON_BIN="python"
elif command -v py >/dev/null 2>&1; then
  PYTHON_BIN="py"
else
  echo "Python command not found. Install Python 3 and make sure python3, python, or py is available in Bash."
  exit 1
fi

if ! "$PYTHON_BIN" -c "import fastapi, uvicorn, sqlalchemy" >/dev/null 2>&1; then
  echo "Installing backend dependencies from requirements.txt..."
  "$PYTHON_BIN" -m pip install -r requirements.txt
fi

echo "Starting backend at http://localhost:8000"
"$PYTHON_BIN" -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
