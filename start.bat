@echo off
setlocal
cd /d "%~dp0"
title Chasing Immortality Bot
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao foi encontrado no PATH.
  pause
  exit /b 1
)
echo Iniciando o bot...
node bot.js
pause
