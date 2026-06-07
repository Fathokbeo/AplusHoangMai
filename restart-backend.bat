@echo off
echo Dung backend cu...
taskkill /F /IM node.exe /T 2>nul
timeout /t 2 /nobreak > nul
echo Khoi dong lai backend...
cd backend
node src/server.js
