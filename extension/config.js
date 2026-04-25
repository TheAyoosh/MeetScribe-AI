self.MEETSCRIBE_CONFIG = {

  // ── Groq API Key (Recommended - Fast & Free Tier) ───────────────────────
  // Get yours at: https://console.groq.com/keys
  // One key for both high-speed transcription and AI summaries.
  groqKey: 'YOUR_GROQ_API_KEY',

  // ── Transcription Mode ─────────────────────────────────────────────────
  // 'groq'      → Use Groq Whisper (Blazing fast, needs groqKey)
  // 'hf'        → Use HuggingFace API (needs hfToken)
  // 'webspeech' → Use browser's built-in recognition (Free, YOUR mic only)
  transcriptionMode: 'groq',

  // ── Groq Models ────────────────────────────────────────────────────────
  // Transcription: 'whisper-large-v3-turbo' or 'whisper-large-v3'
  // Intelligence: 'llama-3.3-70b-versatile' or 'llama-3.1-8b-instant'
  groqTranscriptionModel: 'whisper-large-v3-turbo',
  groqChatModel: 'llama-3.3-70b-versatile',

  // ── Legacy / Fallback Keys (Optional) ──────────────────────────────────
  hfToken: 'YOUR_HF_TOKEN',
  geminiKey: 'YOUR_GEMINI_API_KEY',
  hfModel: 'whisper-base',

  // ── Jira Integration (Optional) ───────────────────────────────────────────
  jiraDomain: 'YOUR_JIRA_DOMAIN',
  jiraEmail: 'YOUR_EMAIL',
  jiraToken: 'YOUR_JIRA_TOKEN',

  jiraProjectKey: 'SCRUM', 
  autoCreateTicket: true,  // Fully automated ticket creation enabled

  // ── Backend & Database Integration ────────────────────────────────────────
  backendUrl: 'http://localhost:8000', // Your FastAPI backend URL
  autoSyncToDb: true,                 // Sync meeting data to PostgreSQL automatically

  // ── AI Agent Guest (Experimental) ─────────────────────────────────────────
  aiAgentActive: false               // Whether the AI agent acts as a virtual participant
};
