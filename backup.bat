@echo off
setlocal
cd /d "%~dp0"
if not exist database.db (
  echo database.db nao encontrado.
  pause
  exit /b 1
)
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"') do set TS=%%i
copy /y database.db "backup_%TS%.db" >nul
if errorlevel 1 (
  echo Falha ao criar backup.
) else (
  echo Backup concluido: backup_%TS%.db
)
pause
