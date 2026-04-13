@echo off
echo Booting Gacha Operations Backend (FastAPI)...
start http://127.0.0.1:8000
uvicorn server:app --port 8000 --reload