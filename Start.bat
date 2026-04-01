@echo off
REM Copyright (c) 2026 Olo Labs
REM SPDX-License-Identifier: Apache-2.0
cd /d "%~dp0"
echo Starting Olo UI (olo-chat)...
echo Installing dependencies...
call npm install
if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
)
echo Starting dev server...
call npm run dev
pause
