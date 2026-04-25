@echo off
setlocal EnableDelayedExpansion

:: ============================================================
::  MeetScribe AI — START HERE
::  Run this first after unzipping
:: ============================================================

title MeetScribe AI

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
echo %CYAN%%BOLD%  ╔════════════════════════════════════════════════╗%RESET%
echo %CYAN%%BOLD%  ║                                                ║%RESET%
echo %CYAN%%BOLD%  ║           MeetScribe AI  v1.0                  ║%RESET%
echo %CYAN%%BOLD%  ║     Real-Time Meeting Transcription            ║%RESET%
echo %CYAN%%BOLD%  ║                                                ║%RESET%
echo %CYAN%%BOLD%  ╚════════════════════════════════════════════════╝%RESET%
echo.
echo %WHITE%  Transcription  · Speaker ID  · Tone Analysis%RESET%
echo %WHITE%  Action Items   · AI Summary  · Export%RESET%
echo.
echo %DIM%  ────────────────────────────────────────────────%RESET%
echo.

:MENU
echo %WHITE%  What would you like to do?%RESET%
echo.
echo %CYAN%    1.%RESET% %YELLOW%First-time setup%RESET% %DIM%(install + configure)%RESET%
echo %CYAN%    2.%RESET% %YELLOW%Launch Chrome with MeetScribe%RESET% %DIM%(already installed)%RESET%
echo %CYAN%    3.%RESET% %YELLOW%Configure API keys%RESET% %DIM%(HuggingFace + Gemini)%RESET%
echo %CYAN%    4.%RESET% %YELLOW%Open Google Meet%RESET% %DIM%(with extension loaded)%RESET%
echo %CYAN%    5.%RESET% %YELLOW%Check status%RESET% %DIM%(verify everything is working)%RESET%
echo %CYAN%    6.%RESET% %YELLOW%Manual load helper%RESET% %DIM%(if auto-load didn't work)%RESET%
echo %CYAN%    7.%RESET% %YELLOW%Quick launch%RESET% %DIM%(one click, no prompts)%RESET%
echo %CYAN%    8.%RESET% %YELLOW%Update extension%RESET% %DIM%(after getting new files)%RESET%
echo %CYAN%    9.%RESET% %YELLOW%Uninstall%RESET%
echo %CYAN%    0.%RESET% %DIM%Exit%RESET%
echo.

set "CHOICE="
set /p "CHOICE=  Enter choice [0-9]: "

echo.

if "%CHOICE%"=="1" goto :INSTALL
if "%CHOICE%"=="2" goto :LOAD
if "%CHOICE%"=="3" goto :KEYS
if "%CHOICE%"=="4" goto :MEET
if "%CHOICE%"=="5" goto :STATUS
if "%CHOICE%"=="6" goto :MANUAL
if "%CHOICE%"=="7" goto :QUICK
if "%CHOICE%"=="8" goto :UPDATE
if "%CHOICE%"=="9" goto :UNINSTALL
if "%CHOICE%"=="0" goto :EXIT

echo %RED%  Invalid choice. Please enter 0-9.%RESET%
echo.
goto :MENU

:INSTALL
call "%~dp0scripts\01_install.bat"
echo.
goto :MENU

:LOAD
call "%~dp0scripts\02_load_extension.bat"
echo.
goto :MENU

:KEYS
call "%~dp0scripts\03_configure_keys.bat"
echo.
goto :MENU

:MEET
call "%~dp0scripts\04_open_google_meet.bat"
echo.
goto :MENU

:STATUS
call "%~dp0scripts\06_status_check.bat"
echo.
goto :MENU

:MANUAL
call "%~dp0scripts\08_manual_load_helper.bat"
echo.
goto :MENU

:QUICK
call "%~dp0scripts\MeetScribe_QuickLaunch.bat"
goto :EXIT

:UPDATE
call "%~dp0scripts\05_update.bat"
echo.
goto :MENU

:UNINSTALL
call "%~dp0scripts\07_uninstall.bat"
echo.
goto :MENU

:EXIT
echo %DIM%  Goodbye.%RESET%
echo.
endlocal
