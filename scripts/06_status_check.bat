@echo off
setlocal EnableDelayedExpansion

:: ============================================================
::  MeetScribe AI — Status Check
::  Verifies the extension, Chrome, and API keys are all set
:: ============================================================

title MeetScribe AI — Status

set "GREEN=[92m"
set "YELLOW=[93m"
set "RED=[91m"
set "CYAN=[96m"
set "WHITE=[97m"
set "DIM=[90m"
set "RESET=[0m"
set "BOLD=[1m"
set "CHECK=[92m  [OK]  [0m"
set "WARN=[93m  [!]   [0m"
set "FAIL=[91m  [X]   [0m"

cls
echo.
echo %CYAN%%BOLD%  MeetScribe AI — System Status%RESET%
echo %DIM%  ───────────────────────────────%RESET%
echo.

set "INSTALL_DIR=%USERPROFILE%\MeetScribeAI"
set "SCRIPT_DIR=%~dp0"
set "ROOT_DIR=%SCRIPT_DIR%.."
for %%i in ("%ROOT_DIR%") do set "ROOT_DIR=%%~fi"

set "ALL_OK=1"

:: ── Check 1: Extension files ───────────────────────────────────────────────

echo %WHITE%  Extension Files%RESET%
echo %DIM%  ─────────────────%RESET%

set "EXT_DIR=%INSTALL_DIR%\extension"
if not exist "%EXT_DIR%\manifest.json" set "EXT_DIR=%ROOT_DIR%\extension"

if exist "%EXT_DIR%\manifest.json" (
    echo %CHECK%manifest.json found
) else (
    echo %FAIL%manifest.json not found
    set "ALL_OK=0"
)

set "REQUIRED_FILES=content\content.js content\sidebar.css content\audio-interceptor.js content\alert-engine.js background\service-worker.js popup\popup.html dashboard\dashboard.html"

for %%f in (%REQUIRED_FILES%) do (
    if exist "%EXT_DIR%\%%f" (
        echo %CHECK%%%f
    ) else (
        echo %FAIL%%%f — MISSING
        set "ALL_OK=0"
    )
)

echo.

:: ── Check 2: Chrome ────────────────────────────────────────────────────────

echo %WHITE%  Google Chrome%RESET%
echo %DIM%  ──────────────%RESET%

set "CHROME_PATH="
if exist "%INSTALL_DIR%\chrome_path.txt" set /p CHROME_PATH=<"%INSTALL_DIR%\chrome_path.txt"

if exist "%CHROME_PATH%" (
    for %%v in ("%CHROME_PATH%") do echo %CHECK%Chrome found: %%~nxv
    echo %DIM%       Path: %CHROME_PATH%%RESET%
) else (
    :: Try to auto-detect
    for %%p in (
        "%ProgramFiles%\Google\Chrome\Application\chrome.exe"
        "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
        "%LocalAppData%\Google\Chrome\Application\chrome.exe"
    ) do if exist "%%~p" if "%CHROME_PATH%"=="" set "CHROME_PATH=%%~p"

    if "!CHROME_PATH!"=="" (
        echo %FAIL%Google Chrome not found
        echo %DIM%       Install from: https://google.com/chrome%RESET%
        set "ALL_OK=0"
    ) else (
        echo %WARN%Chrome found but not saved — run 01_install.bat
        echo %DIM%       Detected: !CHROME_PATH!%RESET%
    )
)

echo.

:: ── Check 3: Chrome profile ────────────────────────────────────────────────

echo %WHITE%  Chrome Profile%RESET%
echo %DIM%  ───────────────%RESET%

set "PROFILE_DIR=%INSTALL_DIR%\chrome-profile"
if exist "%PROFILE_DIR%" (
    echo %CHECK%Profile dir exists
    echo %DIM%       Path: %PROFILE_DIR%%RESET%
) else (
    echo %WARN%Profile not created yet — run 02_load_extension.bat
)

echo.

:: ── Check 4: Settings / API keys ──────────────────────────────────────────

echo %WHITE%  API Keys%RESET%
echo %DIM%  ─────────%RESET%

set "SETTINGS_FILE=%INSTALL_DIR%\settings.json"
if exist "%SETTINGS_FILE%" (
    echo %CHECK%settings.json found
    :: Read and mask token values
    set "HAS_HF=0"
    set "HAS_GM=0"
    for /f "usebackq tokens=1,2 delims=:," %%a in ("%SETTINGS_FILE%") do (
        set "KEY=%%~a"
        set "VAL=%%~b"
        set "KEY=!KEY: =!"
        set "KEY=!KEY:"=!"
        set "VAL=!VAL: =!"
        set "VAL=!VAL:"=!"
        if "!KEY!"=="hfToken" if not "!VAL!"=="" if not "!VAL!"=="null" (
            set "HAS_HF=1"
            set "HF_PREVIEW=!VAL:~0,8!..."
        )
        if "!KEY!"=="geminiKey" if not "!VAL!"=="" if not "!VAL!"=="null" (
            set "HAS_GM=1"
            set "GM_PREVIEW=!VAL:~0,8!..."
        )
    )
    if "!HAS_HF!"=="1" (
        echo %CHECK%HuggingFace token set (!HF_PREVIEW!)
    ) else (
        echo %WARN%HuggingFace token not configured
        echo %DIM%       Get free token: https://huggingface.co/settings/tokens%RESET%
        echo %DIM%       Then run: 03_configure_keys.bat%RESET%
    )
    if "!HAS_GM!"=="1" (
        echo %CHECK%Gemini API key set (!GM_PREVIEW!)
    ) else (
        echo %WARN%Gemini API key not configured
        echo %DIM%       Get free key: https://aistudio.google.com/app/apikey%RESET%
        echo %DIM%       Then run: 03_configure_keys.bat%RESET%
    )
) else (
    echo %WARN%No settings.json — API keys not configured
    echo %DIM%       Run 03_configure_keys.bat to set up API keys%RESET%
    echo %DIM%       (Extension works without keys via Web Speech API)%RESET%
)

echo.

:: ── Check 5: Network (ping HuggingFace) ───────────────────────────────────

echo %WHITE%  Network Connectivity%RESET%
echo %DIM%  ────────────────────%RESET%

ping -n 1 -w 2000 api-inference.huggingface.co >nul 2>&1
if errorlevel 1 (
    echo %WARN%HuggingFace API unreachable
    echo %DIM%       Check internet connection or firewall%RESET%
) else (
    echo %CHECK%HuggingFace API reachable
)

ping -n 1 -w 2000 generativelanguage.googleapis.com >nul 2>&1
if errorlevel 1 (
    echo %WARN%Gemini API unreachable
    echo %DIM%       Check internet connection or firewall%RESET%
) else (
    echo %CHECK%Gemini API reachable
)

ping -n 1 -w 2000 meet.google.com >nul 2>&1
if errorlevel 1 (
    echo %WARN%Google Meet unreachable
) else (
    echo %CHECK%Google Meet reachable
)

echo.

:: ── Summary ────────────────────────────────────────────────────────────────

echo %DIM%  ───────────────────────────────%RESET%
if "%ALL_OK%"=="1" (
    echo %GREEN%%BOLD%  All checks passed — ready to use%RESET%
    echo.
    echo %WHITE%  Run 04_open_google_meet.bat to start a meeting%RESET%
) else (
    echo %YELLOW%%BOLD%  Some checks failed — run 01_install.bat to fix%RESET%
)

echo.
pause
endlocal
