@echo off
setlocal EnableDelayedExpansion

:: ============================================================
::  MeetScribe AI — Open Google Meet
::  Launches Chrome with extension and opens Google Meet
:: ============================================================

title MeetScribe AI — Open Google Meet

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
echo %CYAN%%BOLD%  MeetScribe AI — Google Meet%RESET%
echo %DIM%  ────────────────────────────────%RESET%
echo.

set "INSTALL_DIR=%USERPROFILE%\MeetScribeAI"
set "SCRIPT_DIR=%~dp0"
set "ROOT_DIR=%SCRIPT_DIR%.."
for %%i in ("%ROOT_DIR%") do set "ROOT_DIR=%%~fi"

set "EXTENSION_DIR=%INSTALL_DIR%\extension"
if not exist "%EXTENSION_DIR%\manifest.json" set "EXTENSION_DIR=%ROOT_DIR%\extension"

if not exist "%EXTENSION_DIR%\manifest.json" (
    echo %RED%  Extension not found. Run 01_install.bat first.%RESET%
    pause
    exit /b 1
)

set "PROFILE_DIR=%INSTALL_DIR%\chrome-profile"
if not exist "%PROFILE_DIR%" mkdir "%PROFILE_DIR%"

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
    echo %RED%  Chrome not found. Run 01_install.bat first.%RESET%
    pause
    exit /b 1
)

:: Ask for meeting link
echo %WHITE%  Do you have a meeting link?%RESET%
echo.
echo %YELLOW%    1. Open Google Meet home (create or join)%RESET%
echo %YELLOW%    2. Paste a meeting link%RESET%
echo %YELLOW%    3. Open Zoom web%RESET%
echo.
set "CHOICE=1"
set /p "CHOICE=  Choose [1-3, default 1]: "

if "%CHOICE%"=="2" (
    echo.
    set /p "MEET_URL=  Paste meeting URL: "
) else if "%CHOICE%"=="3" (
    set "MEET_URL=https://zoom.us/join"
) else (
    set "MEET_URL=https://meet.google.com"
)

echo.
echo %WHITE%  Opening: !MEET_URL!%RESET%
echo.

start "" "%CHROME_PATH%" ^
    --load-extension="%EXTENSION_DIR%" ^
    --user-data-dir="%PROFILE_DIR%" ^
    --no-first-run ^
    --no-default-browser-check ^
    --disable-background-timer-throttling ^
    --disable-renderer-backgrounding ^
    --disable-backgrounding-occluded-windows ^
    "!MEET_URL!"

echo %GREEN%  Chrome opened with MeetScribe%RESET%
echo.
echo %WHITE%  When in the meeting:%RESET%
echo %YELLOW%    - Look for the MeetScribe tab on the right edge of the screen%RESET%
echo %YELLOW%    - Click it to open the sidebar%RESET%
echo %YELLOW%    - Press "Record" to start transcription%RESET%
echo %YELLOW%    - Transcription starts immediately, words appear as spoken%RESET%
echo.
echo %DIM%  Press any key to close this window%RESET%
pause >nul

endlocal
