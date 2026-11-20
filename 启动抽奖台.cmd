@echo off
cd /d "%~dp0"
node scripts\rehearse.mjs --open
if errorlevel 1 pause
