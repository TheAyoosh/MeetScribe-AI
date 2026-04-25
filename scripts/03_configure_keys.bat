@echo off
setlocal EnableDelayedExpansion

:: ============================================================
::  MeetScribe AI — Configure API Keys (2026 Edition)
::  Sets Groq, Jira, HF, and Gemini keys into the extension
:: ============================================================

title MeetScribe AI — Configure API Keys

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
echo %CYAN%%BOLD%  MeetScribe AI — Global Configuration%RESET%
echo %DIM%  ─────────────────────────────────────────%RESET%
echo.
echo %WHITE%  Configure your automation and intelligence keys below.%RESET%
echo %WHITE%  Leave blank to keep existing values or skip.%RESET%
echo.

:: ── Groq API Key ──────────────────────────────────────────────────────────

echo %CYAN%  [1] Groq API Key (Fastest AI)%RESET%
echo %DIM%  Used for: Instant Whisper transcription + Llama 3 summaries%RESET%
echo %DIM%  Get free key at: https://console.groq.com/keys%RESET%
echo.

set "GROQ_KEY="
set /p "GROQ_KEY=  Paste Groq Key: "

echo.

:: ── Jira Configuration ──────────────────────────────────────────────────────

echo %CYAN%  [2] Jira Automation%RESET%
echo %DIM%  Used for: Automated ticket creation and MoM syncing%RESET%
echo.

set "JIRA_DOMAIN="
set /p "JIRA_DOMAIN=  Jira Domain (e.g. company.atlassian.net): "

set "JIRA_EMAIL="
set /p "JIRA_EMAIL=  Atlassian Email: "

set "JIRA_TOKEN="
set /p "JIRA_TOKEN=  Jira API Token (Get at: id.atlassian.com/manage-profile/security/api-tokens): "

set "JIRA_PROJECT="
set /p "JIRA_PROJECT=  Default Project Key (e.g. SCRUM): "

echo.

:: ── Optional Legacy Keys ───────────────────────────────────────────────────

echo %CYAN%  [3] Optional Fallback Keys%RESET%
echo %DIM%  HuggingFace (Whisper fallback) and Gemini (Tone Analysis)%RESET%
echo.

set "HF_TOKEN="
set /p "HF_TOKEN=  Paste HF Token (Optional): "

set "GEMINI_KEY="
set /p "GEMINI_KEY=  Paste Gemini Key (Optional): "

echo.

:: ── Write config.js ───────────────────────────────────────────────────────

echo %WHITE%  Updating extension/config.js...%RESET%

set "CONFIG_FILE=..\extension\config.js"

:: We create a temp config and then overwrite
(
echo const MEETSCRIBE_CONFIG = {
echo   groqKey: '!GROQ_KEY!',
echo   transcriptionMode: 'groq',
echo   groqTranscriptionModel: 'whisper-large-v3-turbo',
echo   groqChatModel: 'llama-3.3-70b-versatile',
echo   hfToken: '!HF_TOKEN!',
echo   geminiKey: '!GEMINI_KEY!',
echo   hfModel: 'whisper-base',
echo   jiraDomain: '!JIRA_DOMAIN!',
echo   jiraEmail: '!JIRA_EMAIL!',
echo   jiraToken: '!JIRA_TOKEN!',
echo   jiraProjectKey: '!JIRA_PROJECT!',
echo   autoCreateTicket: true,
echo   backendUrl: 'http://localhost:8000',
echo   autoSyncToDb: true,
echo   aiAgentActive: false
echo };
) > "%CONFIG_FILE%"

echo %GREEN%  Configuration updated successfully!%RESET%
echo.
echo %YELLOW%  Next Steps:%RESET%
echo %DIM%  1. Go to chrome://extensions%RESET%
echo %DIM%  2. Click the 'Reload' icon on MeetScribe AI%RESET%
echo %DIM%  3. Open the Dashboard to verify keys are active%RESET%
echo.
pause
endlocal
