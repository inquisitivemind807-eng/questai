@echo off
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :1420 ^| findstr LISTENING') do (
    echo Found process with PID %%a on port 1420
    taskkill /PID %%a /F
)
