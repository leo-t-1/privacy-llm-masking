#!/usr/bin/env bash
set -e

echo "==> Installing Python dependencies..."
pip install -r requirements.txt

echo "==> Downloading spaCy language model (en_core_web_lg)..."
python -m spacy download en_core_web_lg

echo "==> Setup complete. Run with: uvicorn main:app --reload"
