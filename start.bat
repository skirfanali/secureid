@echo off
REM Starts SecureID (frontend + backend, one process, one port).
REM Usage: double-click start.bat, or run it from a terminal.

cd /d "%~dp0"

if not exist node_modules (
  echo Installing dependencies ^(first run only^)...
  call npm install
)

if not exist backend\.env (
  copy backend\.env.example backend\.env
  echo Created backend\.env from the example file.
)

echo.
echo Starting SecureID...
echo Once you see "SecureID running at ...", open that URL (default http://localhost:4001)
echo.
call npm start
pause
