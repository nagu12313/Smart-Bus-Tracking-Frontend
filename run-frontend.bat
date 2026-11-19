@echo off
title EduTrack - Smart Bus Tracking System
echo ====================================================
echo Starting EduTrack Frontend UI...
echo ====================================================

cd /d "%~dp0"
npm run dev
pause
