@echo off
setlocal EnableDelayedExpansion

:: ============================================================
::  MeetScribe AI — Uninstall
::  Removes the extension install directory cleanly
:: ============================================================

title MeetScribe AI — Uninstall

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
echo %CYAN%%BOLD%  MeetScribe AI — Uninstall%RESET%
echo %DIM%  ──────────────────────────%RESET%
echo.

set "INSTALL_DIR=%USERPROFILE%\MeetScribeAI"

echo %WHITE%  This will remove:%RESET%
echo %DIM%    - %INSTALL_DIR%%RESET%
echo %DIM%    - Chrome profile used by MeetScribe%RESET%
echo %DIM%    - All saved settings and API keys%RESET%
echo.
echo %YELLOW%  Meeting transcripts and recordings are NOT deleted%RESET%
echo %DIM%  (they live in Chrome's local storage, cleared when you remove the extension)%RESET%
echo.

set "CONFIRM=n"
set /p "CONFIRM=  Are you sure? [y/N]: "

if /i not "%CONFIRM%"=="y" (
    echo.
    echo %DIM%  Uninstall cancelled%RESET%
    echo.
    pause
    exit /b 0
)

echo.
echo %WHITE%  Uninstalling...%RESET%
echo.

:: Remove install dir
if exist "%INSTALL_DIR%" (
    rd /s /q "%INSTALL_DIR%"
    if errorlevel 1 (
        echo %RED%  ERROR: Could not remove %INSTALL_DIR%%RESET%
        echo %YELLOW%  Try closing Chrome first, then run this again%RESET%
    ) else (
        echo %GREEN%  Removed: %INSTALL_DIR%%RESET%
    )
) else (
    echo %DIM%  Nothing to remove at: %INSTALL_DIR%%RESET%
)

echo.
echo %WHITE%  To fully remove from Chrome:%RESET%
echo %YELLOW%    1. Open Chrome → chrome://extensions%RESET%
echo %YELLOW%    2. Find "MeetScribe AI" and click Remove%RESET%
echo.
echo %GREEN%  Uninstall complete%RESET%
echo.
pause
endlocal
