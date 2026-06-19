@echo off
title Discord Bot Launcher
echo ===================================================
echo   Discord Bot Web Dashboard and Launcher
echo ===================================================
echo.

cd /d "%~dp0"

:: Check if Node.js is installed
where node >nul 2>nul
if errorlevel 1 (
    echo [Launcher Error] Node.js is not installed or not in your PATH.
    echo Please download and install Node.js from: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: Check if node_modules folder exists
if not exist node_modules (
    echo [Launcher] Installing dependencies, this may take a minute...
    call npm.cmd install
    if errorlevel 1 (
        echo.
        echo [Launcher Error] Failed to install dependencies.
        pause
        exit /b 1
    )
)

echo [Launcher] Starting dashboard server on http://localhost:3000...

:: Wait 2 seconds using ping and open the browser using explorer
start /b cmd /c "ping 127.0.0.1 -n 3 >nul && explorer http://localhost:3000"

:: Run the server in the current window
node launcher.js

echo.
echo [Launcher] Dashboard server stopped.
pause
