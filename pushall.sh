#!/bin/bash
set -e

if [ -z "$1" ]; then
  echo "Usage: $0 \"commit message\""
  exit 1
fi

cp index.html db2json.html
git add .
git commit -m "$1"
git push