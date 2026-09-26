@echo off
setlocal
cd /d "%~dp0"
title Luminary

where node >nul 2>nul
if errorlevel 1 goto nonode

if exist node_modules goto installed
echo Setting up Luminary - first time only, this takes a minute...
call npm install
if errorlevel 1 goto failed
:installed

set "LUMINARY_OPEN=1"
if exist .env goto real

echo.
echo  To get real answers, paste your Anthropic API key and press Enter.
echo  (Get one at https://console.anthropic.com - it starts with sk-ant-)
echo  Or just press Enter to try the demo with sample answers.
echo.
set "KEY="
set /p "KEY=API key: "
if "%KEY%"=="" goto demo
> .env echo ANTHROPIC_API_KEY=%KEY%
echo Key saved. To change it later, delete the file named .env in this folder.

:real
call npm start
goto end

:demo
call npm run demo
goto end

:nonode
echo.
echo  Node.js is not installed yet.
echo  Opening the download page: install the "LTS" version, then double-click this file again.
echo.
start "" https://nodejs.org
goto end

:failed
echo.
echo  Setup failed. Check your internet connection and try again.

:end
echo.
pause
