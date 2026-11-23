@echo off
title AgronIA Desktop - Lanzador de Alto Rendimiento
cd /d "%~dp0"
if exist "release-desktop\AgronIA-win32-x64\AgronIA.exe" (
    echo Iniciando ejecutable nativo AgronIA Desktop...
    start "" "release-desktop\AgronIA-win32-x64\AgronIA.exe"
) else (
    echo Compilando e iniciando AgronIA Desktop con Electron...
    call npm run desktop
)
