#!/bin/bash

# Emergency Chrome cleanup script
# Use this if the bot spawned too many Chrome instances and your PC is frozen

echo "🔥 EMERGENCY: Killing all Chrome processes..."

if [[ "$OSTYPE" == "linux-gnu"* ]] || [[ "$OSTYPE" == "darwin"* ]]; then
    # Linux or macOS
    pkill -9 chrome 2>/dev/null
    pkill -9 chromium 2>/dev/null
    pkill -9 chromedriver 2>/dev/null
    echo "✅ Chrome processes killed (Linux/Mac)"
elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "win32" ]]; then
    # Windows (Git Bash or similar)
    taskkill //F //IM chrome.exe //T 2>/dev/null
    taskkill //F //IM chromedriver.exe //T 2>/dev/null
    echo "✅ Chrome processes killed (Windows)"
else
    echo "❌ Unsupported OS: $OSTYPE"
    exit 1
fi

echo ""
echo "📊 Checking for remaining Chrome processes..."
if command -v pgrep &> /dev/null; then
    CHROME_COUNT=$(pgrep -c chrome 2>/dev/null || echo "0")
    echo "Remaining Chrome processes: $CHROME_COUNT"
else
    echo "⚠️ Cannot check process count (pgrep not available)"
fi

echo ""
echo "✅ Cleanup complete!"
echo "💡 You can now run the bot again with: bun bot_starter.ts seek"
