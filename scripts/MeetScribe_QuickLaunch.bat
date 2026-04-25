@echo off
setlocal EnableDelayedExpansion

:: ============================================================
::  MeetScribe AI — Quick Launch
::  One click: opens Chrome with extension on Google Meet
::  No prompts. Fastest way to start.
:: ============================================================

set "INSTALL_DIR=%USERPROFILE%\MeetScribeAI"
set "SCRIPT_DIR=%~dp0"
set "ROOT_DIR=%SCRIPT_DIR%.."
for %%i in ("%ROOT_DIR%") do set "ROOT_DIR=%%~fi"

set "EXTENSION_DIR=%INSTALL_DIR%\extension"
if not exist "%EXTENSION_DIR%\manifest.json" set "EXTENSION_DIR=%ROOT_DIR%\extension"

set "PROFILE_DIR=%INSTALL_DIR%\chrome-profile"
if not exist "%PROFILE_DIR%" mkdir "%PROFILE_DIR%" >nul 2>&1

:: Find Chrome
set "CHROME_PATH="
if exist "%INSTALL_DIR%\chrome_path.txt" set /p CHROME_PATH=<"%INSTALL_DIR%\chrome_path.txt"
if not exist "%CHROME_PATH%" set "CHROME_PATH="

if "%CHROME_PATH%"=="" (
    for %%p in (
        "%ProgramFiles%\Google\Chrome\Application\chrome.exe"
        "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
        "%LocalAppData%\Google\Chrome\Application\chrome.exe"
    ) do if exist "%%~p" if "%CHROME_PATH%"=="" set "CHROME_PATH=%%~p"
)

if "%CHROME_PATH%"=="" (
    echo Chrome not found. Run 01_install.bat first.
    pause
    exit /b 1
)

if not exist "%EXTENSION_DIR%\manifest.json" (
    echo Extension not found. Run 01_install.bat first.
    pause
    exit /b 1
)

start "" "%CHROME_PATH%" ^
    --load-extension="%EXTENSION_DIR%" ^
    --user-data-dir="%PROFILE_DIR%" ^
    --no-first-run ^
    --no-default-browser-check ^
    --disable-background-timer-throttling ^
    --disable-renderer-backgrounding ^
    --disable-backgrounding-occluded-windows ^
    "https://meet.google.com"

endlocal
