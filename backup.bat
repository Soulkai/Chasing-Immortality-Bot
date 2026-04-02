@echo off
copy database.db backup_%date:~0,2%%date:~3,2%%date:~6,4%.db
echo Backup concluído.
pause
