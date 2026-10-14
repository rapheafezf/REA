@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js est introuvable. Installez-le depuis https://nodejs.org puis relancez. & pause & exit /b 1)
if not exist cle-api.txt goto lancer
set /p ANTHROPIC_API_KEY=<cle-api.txt
:lancer
if "%PORT%"=="" set PORT=3000
start "" http://localhost:%PORT%
node server.js
pause
