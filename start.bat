@echo off
rem Starts the project management server at http://localhost:3000 (set PORT to change it).
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  set "PATH=%LOCALAPPDATA%\Programs\node-portable;%PATH%"
)

node server\index.js
