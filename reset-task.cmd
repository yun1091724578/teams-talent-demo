@echo off
setlocal EnableExtensions
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js 24 with npm, then reopen this launcher.
  exit /b 1
)
node scripts\reset-task.mjs %*
exit /b %errorlevel%
