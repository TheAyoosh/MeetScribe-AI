@echo off 
cd /d "%~dp0"
title MeetScribe AI 
set /p CHROME=<chrome_path.txt
start "" "%CHROME%" --load-extension="%~dp0extension" --user-data-dir="%~dp0chrome-profile" --no-first-run --no-default-browser-check "https://meet.google.com" 
