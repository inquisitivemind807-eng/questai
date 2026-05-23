#!/bin/bash
# Ensure corpus-rag is running. Call this before any bot run.
# Usage: bash scripts/corpus-rag-ensure.sh

API_URL="${1:-http://localhost:3000}"

# Quick health check
if curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/auth/refresh" -X POST -H "Content-Type: application/json" -d '{}' 2>/dev/null | grep -q "200\|success"; then
  echo "✅ corpus-rag is running"
  exit 0
fi

# Try root
if curl -s -o /dev/null -w "%{http_code}" "$API_URL/" 2>/dev/null | grep -q "200"; then
  echo "✅ corpus-rag is running (root OK)"
  exit 0
fi

echo "🔴 corpus-rag is DOWN — starting..."
cd "$HOME/inquisitive_mind/corpus-rag" || { echo "❌ corpus-rag directory not found"; exit 1; }
npm run dev > /tmp/corpus-rag.log 2>&1 &

# Wait for it
for i in $(seq 1 15); do
  sleep 2
  if curl -s -o /dev/null -w "%{http_code}" "$API_URL/" 2>/dev/null | grep -q "200"; then
    echo "✅ corpus-rag started (took ${i}s)"
    exit 0
  fi
  echo "   waiting... (${i}/15)"
done

echo "⚠️ corpus-rag did not start within 30s — check /tmp/corpus-rag.log"
exit 1
