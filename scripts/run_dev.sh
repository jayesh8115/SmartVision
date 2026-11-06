#!/usr/bin/env bash
# Run the backend locally: bash scripts/run_dev.sh
set -e
cd "$(dirname "$0")/../backend"
[ -d .venv ] || python -m venv .venv
source .venv/bin/activate 2>/dev/null || source .venv/Scripts/activate
pip install -r requirements.txt
[ -f .env ] || cp .env.example .env
uvicorn app.main:app --reload --port 8000
