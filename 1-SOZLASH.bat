@echo off
chcp 65001 >nul
title WAFA EDO
start "" wscript.exe "%~dp0EDO-START.vbs"
exit /b 0
