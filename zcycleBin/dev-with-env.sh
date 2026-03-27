#!/bin/bash
# Load environment variables and start dev server

# Load .env file
if [ -f .env ]; then
  set -a # automatically export all variables
  source .env
  set +a # stop automatically exporting
  echo "✅ Environment variables loaded from .env"
  echo "📍 API_BASE_URL: $API_BASE_URL"
else
  echo "❌ .env file not found!"
  exit 1
fi

# Start vite dev server
echo ""
echo "🚀 Starting Vite dev server on port 1420..."
~/.bun/bin/bun --bun vite dev

