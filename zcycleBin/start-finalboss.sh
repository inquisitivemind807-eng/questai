#!/bin/bash
# Start finalboss on the correct port

cd /Users/admin/extratech/inquisitive-mind/finalboss

echo "🚀 Starting finalboss on port 1420..."
echo "📍 URL will be: http://localhost:1420"
echo ""

# Use bun to run on specific port
~/.bun/bin/bun --bun vite dev --port 1420 --host

