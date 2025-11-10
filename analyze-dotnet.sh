#!/bin/bash

set -e

API_URL="${STATELESSOR_API_URL:-https://statelessor-api.port2aws.pro}"
PROJECT_PATH="${1:-.}"
PROJECT_NAME="${2:-$(basename "$PROJECT_PATH")}"

if [ ! -d "$PROJECT_PATH" ]; then
  echo "Error: Directory $PROJECT_PATH not found"
  exit 1
fi

echo "Analyzing .NET project: $PROJECT_NAME"
echo "Path: $PROJECT_PATH"

TMP_ZIP=$(mktemp -u).zip
trap "rm -f $TMP_ZIP" EXIT

cd "$PROJECT_PATH"
zip -r "$TMP_ZIP" . -x "*/bin/*" "*/obj/*" "*/node_modules/*" "*.git/*" > /dev/null

echo "Uploading project..."
RESPONSE=$(curl -s -X POST "$API_URL/api/analyze/local" \
  -F "file=@$TMP_ZIP" \
  -F "projectName=$PROJECT_NAME" \
  -F "language=csharp")

echo "$RESPONSE" | jq -r '
  if .findings then
    "Analysis complete. Found \(.findings | length) issues:",
    "",
    (.findings[] | "[\(.severity)] \(.title)\n  File: \(.file):\(.line)\n  \(.description)\n")
  else
    "Error: \(.error // .message // "Unknown error")"
  end
'
