@echo off
title AgronIA Local GPU + Web Server
echo ============================================================
echo   AgronIA - Modo Local Acelerado por GPU (CUDA / RTX)
echo ============================================================
echo.
echo 1. Iniciando Backend AgroVision AI (FastAPI + GPU CUDA) en http://localhost:8000
start "AgronIA GPU Backend (Puerto 8000)" cmd /k "cd /d %~dp0backend && python -m uvicorn app:app --host 127.0.0.1 --port 8000"

timeout /t 2 /nobreak >nul
echo 2. Iniciando Frontend AgronIA (Vite) en http://localhost:5173
start "AgronIA Web Frontend (Puerto 5173)" cmd /k "cd /d %~dp0 && npm run dev -- --open"

echo.
echo Ambos servicios se estan iniciando. La web usara tu GPU local automaticamente.
pause
