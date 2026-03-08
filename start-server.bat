@echo off
cd /d "%~dp0"

if not exist logs mkdir logs

start "uvicorn" cmd /c "uvicorn server:app --host 0.0.0.0 --port 3000 > logs\uvicorn.log 2>&1"
start "ngrok" cmd /c "ngrok start --config ngrok.yml --log logs\ngrok.log --log-format logfmt webhook_node webhook_py"
