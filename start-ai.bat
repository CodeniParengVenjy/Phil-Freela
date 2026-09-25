@echo off
rem Starts PhilFreela's AI service and shares it through ngrok, so the live
rem website (phil-freela.pages.dev) can use it for identity verification.
rem Two windows open. Keep both open while presenting; close both to stop.
rem (ngrok must be installed and logged in once: ngrok config add-authtoken ...)
title PhilFreela - ngrok link
cd /d "%~dp0ai-service"
set TF_CPP_MIN_LOG_LEVEL=2
start "PhilFreela - AI service" cmd /k .venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
ngrok http 8000
