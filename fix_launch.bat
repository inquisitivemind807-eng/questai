@echo off
set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
echo Environment fixed. Launching Tauri dev...
bun run tauri dev
