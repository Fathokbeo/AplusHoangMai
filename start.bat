@echo off
echo ========================================
echo   APLUS HOANG MAI - Math Education
echo ========================================
echo.
echo Starting backend server...
start "Backend" cmd /k "cd backend && node src/server.js"
timeout /t 2 /nobreak > nul
echo Starting frontend...
start "Frontend" cmd /k "cd frontend && npm run dev"
echo.
echo ✓ Backend: http://localhost:5000
echo ✓ Frontend: http://localhost:5173
echo.
echo Open http://localhost:5173 in your browser
echo Default login: admin / admin123
echo.
pause
