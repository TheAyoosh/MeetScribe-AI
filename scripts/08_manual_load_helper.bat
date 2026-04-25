@echo off
setlocal EnableDelayedExpansion

:: ============================================================
::  MeetScribe AI — Manual Chrome Load Helper
::  If 02_load_extension.bat doesn't work, use this.
::  Opens Chrome and walks you through loading manually.
:: ============================================================

title MeetScribe AI — Manual Load Helper

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
echo %CYAN%%BOLD%  MeetScribe AI — Manual Extension Loader%RESET%
echo %DIM%  ──────────────────────────────────────────%RESET%
echo.
echo %WHITE%  Use this if the automatic loader didn't work.%RESET%
echo.

set "INSTALL_DIR=%USERPROFILE%\MeetScribeAI"
set "SCRIPT_DIR=%~dp0"
set "ROOT_DIR=%SCRIPT_DIR%.."
for %%i in ("%ROOT_DIR%") do set "ROOT_DIR=%%~fi"

set "EXTENSION_DIR=%INSTALL_DIR%\extension"
if not exist "%EXTENSION_DIR%\manifest.json" set "EXTENSION_DIR=%ROOT_DIR%\extension"

if not exist "%EXTENSION_DIR%\manifest.json" (
    echo %RED%  Extension folder not found%RESET%
    pause
    exit /b 1
)

:: Copy path to clipboard for easy pasting
echo %EXTENSION_DIR% | clip

echo %WHITE%  Extension path has been copied to your clipboard:%RESET%
echo.
echo %CYAN%  %EXTENSION_DIR%%RESET%
echo.

:: Find Chrome
set "CHROME_PATH="
if exist "%INSTALL_DIR%\chrome_path.txt" set /p CHROME_PATH=<"%INSTALL_DIR%\chrome_path.txt"
if not exist "%CHROME_PATH%" (
    for %%p in (
        "%ProgramFiles%\Google\Chrome\Application\chrome.exe"
        "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
        "%LocalAppData%\Google\Chrome\Application\chrome.exe"
    ) do if exist "%%~p" if "%CHROME_PATH%"=="" set "CHROME_PATH=%%~p"
)

if not "%CHROME_PATH%"=="" (
    echo %WHITE%  Opening Chrome extensions page...%RESET%
    start "" "%CHROME_PATH%" "chrome://extensions"
)

echo.
echo %YELLOW%%BOLD%  Step-by-step instructions:%RESET%
echo.
echo %WHITE%  1.%RESET% In Chrome, go to:  %CYAN%chrome://extensions%RESET%
echo %WHITE%  2.%RESET% Toggle %CYAN%Developer mode%RESET% ON  (top-right corner)
echo %WHITE%  3.%RESET% Click %CYAN%Load unpacked%RESET%
echo %WHITE%  4.%RESET% Paste the path below into the dialog, then click Select Folder:
echo.
echo %CYAN%     %EXTENSION_DIR%%RESET%
echo.
echo %DIM%  (Path was also copied to your clipboard — just Ctrl+V in the dialog)%RESET%
echo.
echo %WHITE%  5.%RESET% MeetScribe AI will appear in your extension list
echo %WHITE%  6.%RESET% Pin it to the toolbar: click the puzzle piece icon, then pin MeetScribe
echo %WHITE%  7.%RESET% Go to Google Meet and join a meeting
echo %WHITE%  8.%RESET% The MeetScribe panel appears on the right side of the meeting
echo.
echo %DIM%  Press any key when done%RESET%
pause >nul

endlocal
