@echo off
cd /d "%~dp0"

if not exist logs mkdir logs

start "uvicorn" cmd /k "uvicorn server:app --host 0.0.0.0 --port 3000"
start "ngrok" cmd /k "ngrok start --config ngrok.yml --log stdout --log-format logfmt webhook_node webhook_py"
