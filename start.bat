@echo off
REM Clanker — Start Script for Windows
REM Run this to launch the assistant. It opens in your default browser automatically.

cd /d "%~dp0"

echo Starting Clanker...
echo Visit http://localhost:7842 when ready.
echo.

start "" http://localhost:7842
venv\Scripts\python.exe run.py

pause
