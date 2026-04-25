@echo off
setlocal EnableDelayedExpansion

:: ============================================================
::  MeetScribe AI — Update Extension
::  Copies latest extension files to the install location
::  Then prompts to reload in Chrome
:: ============================================================

title MeetScribe AI — Update

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
echo %CYAN%%BOLD%  MeetScribe AI — Update%RESET%
echo %DIM%  ──────────────────────────%RESET%
echo.

set "SCRIPT_DIR=%~dp0"
set "ROOT_DIR=%SCRIPT_DIR%.."
for %%i in ("%ROOT_DIR%") do set "ROOT_DIR=%%~fi"

set "SOURCE_DIR=%ROOT_DIR%\extension"
set "INSTALL_DIR=%USERPROFILE%\MeetScribeAI"
set "DEST_DIR=%INSTALL_DIR%\extension"

if not exist "%SOURCE_DIR%\manifest.json" (
    echo %RED%  ERROR: Source extension not found at: %SOURCE_DIR%%RESET%
    pause
    exit /b 1
)

echo %WHITE%  Source : %SOURCE_DIR%%RESET%
echo %WHITE%  Dest   : %DEST_DIR%%RESET%
echo.

:: Backup current version
if exist "%DEST_DIR%" (
    echo %WHITE%  Backing up current version...%RESET%
    if exist "%INSTALL_DIR%\extension_backup" rd /s /q "%INSTALL_DIR%\extension_backup"
    xcopy /E /I /Y /Q "%DEST_DIR%" "%INSTALL_DIR%\extension_backup" >nul 2>&1
    echo %GREEN%  Backup saved to: %INSTALL_DIR%\extension_backup%RESET%
    echo.
)

:: Copy new files
echo %WHITE%  Copying updated files...%RESET%
if not exist "%DEST_DIR%" mkdir "%DEST_DIR%"
xcopy /E /I /Y /Q "%SOURCE_DIR%" "%DEST_DIR%" >nul 2>&1

if errorlevel 1 (
    echo %RED%  ERROR: Failed to copy files%RESET%
    echo %YELLOW%  Attempting to restore backup...%RESET%
    if exist "%INSTALL_DIR%\extension_backup" (
        xcopy /E /I /Y /Q "%INSTALL_DIR%\extension_backup" "%DEST_DIR%" >nul 2>&1
        echo %GREEN%  Backup restored%RESET%
    )
    pause
    exit /b 1
)

echo %GREEN%  Files updated successfully%RESET%
echo.

:: Show what changed
echo %WHITE%  Updated files:%RESET%
for /r "%DEST_DIR%" %%f in (*.js *.css *.html *.json) do (
    echo %DIM%    %%~nxf%RESET%
)
echo.

:: Prompt to reload in Chrome
echo %CYAN%  To apply the update in Chrome:%RESET%
echo.
echo %YELLOW%    1. Open Chrome → chrome://extensions%RESET%
echo %YELLOW%    2. Find "MeetScribe AI"%RESET%
echo %YELLOW%    3. Click the refresh/reload button (circular arrow)%RESET%
echo %YELLOW%    4. Rejoin your meeting%RESET%
echo.
echo %WHITE%  Or run 02_load_extension.bat to relaunch Chrome with the update.%RESET%
echo.

set "RELAUNCH=n"
set /p "RELAUNCH=  Relaunch Chrome now? [y/N]: "

if /i "%RELAUNCH%"=="y" (
    echo.
    call "%SCRIPT_DIR%02_load_extension.bat"
)

echo.
echo %GREEN%  Update complete.%RESET%
echo.
pause
endlocal
