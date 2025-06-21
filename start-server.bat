@echo off
echo Starting Diablo RP Server...
echo.
echo Make sure MySQL is running!
echo.
cd /d "%~dp0"
npm install
cmd /k node server.js
