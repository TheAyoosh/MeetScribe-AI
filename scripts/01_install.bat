@echo off
setlocal EnableDelayedExpansion

:: ============================================================
::  MeetScribe AI — Install Script
::  Extracts the extension and loads it into Chrome
:: ============================================================

title MeetScribe AI — Installer

:: Colors
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
echo %CYAN%%BOLD%  ╔══════════════════════════════════════════╗%RESET%
echo %CYAN%%BOLD%  ║         MeetScribe AI  —  Installer      ║%RESET%
echo %CYAN%%BOLD%  ╚══════════════════════════════════════════╝%RESET%
echo.

:: ── Step 1: Find script location ──────────────────────────────────────────

set "SCRIPT_DIR=%~dp0"
set "ROOT_DIR=%SCRIPT_DIR%.."
for %%i in ("%ROOT_DIR%") do set "ROOT_DIR=%%~fi"
set "EXTENSION_DIR=%ROOT_DIR%\extension"
set "INSTALL_DIR=%USERPROFILE%\MeetScribeAI"

echo %DIM%  Script dir : %SCRIPT_DIR%%RESET%
echo %DIM%  Root dir   : %ROOT_DIR%%RESET%
echo %DIM%  Extension  : %EXTENSION_DIR%%RESET%
echo.

:: ── Step 2: Check extension folder ────────────────────────────────────────

echo %WHITE%  [1/5] Checking extension files...%RESET%

if not exist "%EXTENSION_DIR%\manifest.json" (
    echo %RED%  ERROR: manifest.json not found at:%RESET%
    echo %RED%         %EXTENSION_DIR%%RESET%
    echo.
    echo %YELLOW%  Make sure you extracted the zip and are running this%RESET%
    echo %YELLOW%  from inside the MeetScribe folder.%RESET%
    echo.
    pause
    exit /b 1
)

echo %GREEN%  OK — Extension files found%RESET%
echo.

:: ── Step 3: Copy to stable install location ────────────────────────────────

echo %WHITE%  [2/5] Installing to: %INSTALL_DIR%%RESET%

if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

xcopy /E /I /Y /Q "%EXTENSION_DIR%" "%INSTALL_DIR%\extension" >nul 2>&1

if errorlevel 1 (
    echo %RED%  ERROR: Could not copy extension files%RESET%
    echo %RED%         Check you have write permission to %USERPROFILE%%RESET%
    pause
    exit /b 1
)

echo %GREEN%  OK — Copied to install location%RESET%
echo.

:: ── Step 4: Detect Chrome ─────────────────────────────────────────────────

echo %WHITE%  [3/5] Locating Google Chrome...%RESET%

set "CHROME_PATH="

:: Check common Chrome locations
for %%p in (
    "%ProgramFiles%\Google\Chrome\Application\chrome.exe"
    "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
    "%LocalAppData%\Google\Chrome\Application\chrome.exe"
    "%ProgramFiles%\Google\Chrome Beta\Application\chrome.exe"
    "%LocalAppData%\Chromium\Application\chrome.exe"
) do (
    if exist "%%~p" (
        set "CHROME_PATH=%%~p"
        goto :chrome_found
    )
)

echo %YELLOW%  WARNING: Chrome not found in standard locations%RESET%
echo %YELLOW%  Please enter the full path to chrome.exe:%RESET%
echo.
set /p "CHROME_PATH=  Path: "

if not exist "%CHROME_PATH%" (
    echo %RED%  ERROR: File not found: %CHROME_PATH%%RESET%
    pause
    exit /b 1
)

:chrome_found
echo %GREEN%  OK — Chrome found: %CHROME_PATH%%RESET%
echo.

:: Save Chrome path for other scripts
echo %CHROME_PATH%> "%INSTALL_DIR%\chrome_path.txt"

:: ── Step 5: Create profile for extension ──────────────────────────────────

echo %WHITE%  [4/5] Preparing Chrome profile...%RESET%

set "PROFILE_DIR=%INSTALL_DIR%\chrome-profile"
if not exist "%PROFILE_DIR%" mkdir "%PROFILE_DIR%"

echo %GREEN%  OK — Profile directory ready%RESET%
echo.

:: ── Step 6: Write shortcut launcher ───────────────────────────────────────

echo %WHITE%  [5/5] Creating launch shortcuts...%RESET%

:: Write the run script content into the install dir
echo @echo off > "%INSTALL_DIR%\Launch.bat"
echo title MeetScribe AI >> "%INSTALL_DIR%\Launch.bat"
echo set "CHROME=" >> "%INSTALL_DIR%\Launch.bat"
echo set /p CHROME=<"%INSTALL_DIR%\chrome_path.txt" >> "%INSTALL_DIR%\Launch.bat"
echo start "" "!CHROME!" --load-extension="%INSTALL_DIR%\extension" --user-data-dir="%PROFILE_DIR%" --no-first-run --no-default-browser-check "https://meet.google.com" >> "%INSTALL_DIR%\Launch.bat"

echo %GREEN%  OK — Shortcuts created%RESET%
echo.

:: ── Done ──────────────────────────────────────────────────────────────────

echo %CYAN%%BOLD%  ╔══════════════════════════════════════════╗%RESET%
echo %CYAN%%BOLD%  ║          Installation Complete!          ║%RESET%
echo %CYAN%%BOLD%  ╚══════════════════════════════════════════╝%RESET%
echo.
echo %WHITE%  Extension installed to:%RESET%
echo %DIM%  %INSTALL_DIR%\extension%RESET%
echo.
echo %WHITE%  Next steps:%RESET%
echo %YELLOW%    1. Run  02_load_extension.bat  to open Chrome with MeetScribe loaded%RESET%
echo %YELLOW%    2. Run  03_configure_keys.bat  to set your API keys%RESET%
echo %YELLOW%    3. Run  04_open_google_meet.bat  to start a meeting%RESET%
echo.
pause
endlocal
