#!/bin/bash
# Emergency Chrome Kill Script
# Use this if Chrome goes into an infinite loop

echo "🛑 Killing all Chrome and ChromeDriver processes..."

# Kill all Chrome processes
pkill -9 chrome
pkill -9 google-chrome
pkill -9 google-chrome-stable

# Kill all ChromeDriver processes
pkill -9 chromedriver

# Kill any Selenium processes
pkill -9 selenium

# Kill any remaining Chrome helper processes
pkill -9 "Chrome"
pkill -9 "nacl_helper"

echo "✅ All Chrome processes killed!"
echo "💡 Run 'ps aux | grep chrome' to verify"
