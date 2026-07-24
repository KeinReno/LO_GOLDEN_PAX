@echo off
chcp 65001 >nul
cd /d "%~dp0"
title GMap — карта для игроков
echo.
echo  Запускаю редактор карты...
echo  В панели слева нажми «Открыть для игроков» и скопируй ссылку.
echo.
call npm run dev
pause
