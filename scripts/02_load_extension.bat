@echo off
setlocal EnableDelayedExpansion

:: ============================================================
::  MeetScribe AI — Load Extension in Chrome
::  Opens Chrome with the extension loaded (developer mode)
::  No Chrome Web Store needed — works unpacked
:: ============================================================

title MeetScribe AI — Launch Chrome

set "GREEN=[92m"
set "YELLOW=[93m"
set "RED=[91m"
set "CYAN=[96m"
set "WHITE=[97m"
set "DIM=[90m"
set "RESET=[0m"
set "BOLD=[1m"

cls
echo.
echo %CYAN%%BOLD%  MeetScribe AI — Loading Extension%RESET%
echo %DIM%  ─────────────────────────────────────%RESET%
echo.

:: ── Locate files ──────────────────────────────────────────────────────────

set "SCRIPT_DIR=%~dp0"
set "ROOT_DIR=%SCRIPT_DIR%.."
for %%i in ("%ROOT_DIR%") do set "ROOT_DIR=%%~fi"

:: Check if installed to user profile (from 01_install.bat)
set "INSTALL_DIR=%USERPROFILE%\MeetScribeAI"
set "EXTENSION_DIR=%INSTALL_DIR%\extension"

:: Fall back to local folder if not installed
if not exist "%EXTENSION_DIR%\manifest.json" (
    set "EXTENSION_DIR=%ROOT_DIR%\extension"
)

if not exist "%EXTENSION_DIR%\manifest.json" (
    echo %RED%  ERROR: Extension not found.%RESET%
    echo %YELLOW%  Please run 01_install.bat first, or make sure you are%RESET%
    echo %YELLOW%  running this from the MeetScribe folder.%RESET%
    echo.
    pause
    exit /b 1
)

echo %DIM%  Extension : %EXTENSION_DIR%%RESET%

:: ── Chrome profile ────────────────────────────────────────────────────────

set "PROFILE_DIR=%INSTALL_DIR%\chrome-profile"
if not exist "%PROFILE_DIR%" mkdir "%PROFILE_DIR%"

:: ── Find Chrome ───────────────────────────────────────────────────────────

set "CHROME_PATH="

:: Read saved path if available
if exist "%INSTALL_DIR%\chrome_path.txt" (
    set /p CHROME_PATH=<"%INSTALL_DIR%\chrome_path.txt"
)

:: Verify it still exists
if not exist "%CHROME_PATH%" set "CHROME_PATH="

:: Re-detect if needed
if "%CHROME_PATH%"=="" (
    for %%p in (
        "%ProgramFiles%\Google\Chrome\Application\chrome.exe"
        "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
        "%LocalAppData%\Google\Chrome\Application\chrome.exe"
        "%LocalAppData%\Chromium\Application\chrome.exe"
    ) do (
        if exist "%%~p" if "%CHROME_PATH%"=="" set "CHROME_PATH=%%~p"
    )
)

if "%CHROME_PATH%"=="" (
    echo %RED%  ERROR: Google Chrome not found.%RESET%
    echo.
    echo %YELLOW%  Please enter the full path to chrome.exe:%RESET%
    set /p "CHROME_PATH=  chrome.exe path: "
    if not exist "!CHROME_PATH!" (
        echo %RED%  File not found. Aborting.%RESET%
        pause
        exit /b 1
    )
    echo !CHROME_PATH!> "%INSTALL_DIR%\chrome_path.txt"
)

echo %DIM%  Chrome    : %CHROME_PATH%%RESET%
echo.

:: ── Close existing MeetScribe Chrome instance if running ──────────────────

echo %WHITE%  Checking for existing Chrome instances...%RESET%

:: We use a unique profile dir so it's isolated from the user's normal Chrome
:: Just proceed — Chrome handles multiple instances fine

:: ── Build Chrome flags ────────────────────────────────────────────────────

set "FLAGS=--load-extension="%EXTENSION_DIR%""
set "FLAGS=%FLAGS% --user-data-dir="%PROFILE_DIR%""
set "FLAGS=%FLAGS% --no-first-run"
set "FLAGS=%FLAGS% --no-default-browser-check"
set "FLAGS=%FLAGS% --disable-extensions-except="%EXTENSION_DIR%""

:: Allow mic access without prompt in the isolated profile
set "FLAGS=%FLAGS% --use-fake-ui-for-media-stream=0"

:: Reduce background processing overhead for lower latency
set "FLAGS=%FLAGS% --disable-background-timer-throttling"
set "FLAGS=%FLAGS% --disable-renderer-backgrounding"
set "FLAGS=%FLAGS% --disable-backgrounding-occluded-windows"

:: Start URL
set "START_URL=https://meet.google.com"

echo %WHITE%  Launching Chrome with MeetScribe extension...%RESET%
echo.

start "" "%CHROME_PATH%" %FLAGS% "%START_URL%"

if errorlevel 1 (
    echo %RED%  ERROR: Failed to launch Chrome%RESET%
    pause
    exit /b 1
)

:: ── Instructions ──────────────────────────────────────────────────────────

timeout /t 3 /nobreak >nul

echo %GREEN%  Chrome launched successfully%RESET%
echo.
echo %CYAN%%BOLD%  What to do next:%RESET%
echo.
echo %WHITE%  Inside Chrome:%RESET%
echo %YELLOW%    1. You should see MeetScribe icon in the toolbar (top right)%RESET%
echo %YELLOW%    2. If you don't see it — click the puzzle piece icon and pin MeetScribe%RESET%
echo %YELLOW%    3. Join a Google Meet meeting%RESET%
echo %YELLOW%    4. The MeetScribe panel slides in from the right automatically%RESET%
echo %YELLOW%    5. Click "Record" to start live transcription%RESET%
echo.
echo %WHITE%  If the extension icon is not showing:%RESET%
echo %DIM%    - Go to chrome://extensions%RESET%
echo %DIM%    - Enable "Developer mode" (top right toggle)%RESET%
echo %DIM%    - Click "Load unpacked" → select: %EXTENSION_DIR%%RESET%
echo.
echo %DIM%  Press any key to close this window (Chrome stays open)%RESET%
pause >nul

endlocal
