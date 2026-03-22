# 🎙️ MeetScribe AI

**Real-Time Meeting Intelligence for the Modern Workspace**

MeetScribe AI is a powerful Chrome extension designed to transform your virtual meetings. By leveraging state-of-the-art open-source AI models, it provides real-time transcription, speaker diarization, and tone analysis across major conferencing platforms including **Google Meet**, **Zoom**, and **Microsoft Teams**.

---

## 🚀 Key Features

*   **Real-Time Transcription**: Converts meeting audio to text as it happens using **OpenAI's Whisper** and **NVIDIA's Parakeet** via HuggingFace's Inference API.
*   **Speaker Diarization**: Automatically identifies and tracks different speakers during the session.
*   **Tone & Sentiment Analysis**: Analyzes the emotional subtext of each speech segment using **Google Gemini 1.5 Flash**, providing insights into confidence, energy, and formality.
*   **Intelligent Summarization**: Generates concise, professional meeting summaries highlighting key decisions and action items.
*   **Seamless Sidebar Integration**: A sleek, non-intrusive sidebar that docks within your meeting window for an uninterrupted experience.
*   **Flexible Exports**: Save your meeting transcripts in various formats including **Markdown**, **JSON**, **SRT**, and **Plain Text**.
*   **Privacy First**: No audio is stored permanently, and processing is handled via secure API integrations.

---

## 🛠️ Tech Stack

*   **Core**: Chrome Extension API (Manifest V3)
*   **Audio Capture**: `chrome.offscreen` & `chrome.tabCapture` API
*   **Transcription Logic**: Web Audio API with HuggingFace Inference (Whisper / Parakeet)
*   **IA Engine**: Google Gemini 1.5 Flash (Sentiment/Summarization)
*   **Storage**: Chrome Local Storage for session management
*   **UI/UX**: Custom sidebar with CSS-in-JS patterns for responsiveness

---

## 🏗️ Architecture Overview

MeetScribe AI follows a modular and event-driven architecture to ensure high performance while capturing audio from the browser:

1.  **Content Script**: Injects a custom `alert-engine` and `audio-interceptor` into the meeting window. It also renders the interactive sidebar.
2.  **Service Worker**: Acts as the central hub, managing messages between the content script, offscreen document, and external AI APIs.
3.  **Offscreen Document**: Specifically designed to handle intensive audio processing tasks like tab audio capture and buffering chunked data for transcription.
4.  **AI Layer**: Communicates with HuggingFace (Transcription) and Gemini (Analysis) to provide intelligent real-time feedback.

---

## 📦 Installation & Setup

### Prerequisites
*   A Google Gemini API Key (Free Tier).
*   A HuggingFace API Token.

### Steps
1.  **Clone the Repository**:
    ```bash
    git clone https://github.com/Abhiraj-ux/meet_scribe_ai.git
    ```
2.  **Load into Chrome**:
    - Open Chrome and navigate to `chrome://extensions/`.
    - Enable **Developer mode** (top right).
    - Click **Load unpacked** and select the `extension` folder within the project directory.
3.  **Configure API Keys**:
    - Open the MeetScribe AI popup.
    - Go to **Settings** and enter your HuggingFace Token and Gemini API Key.
4.  **Launch a Meeting**:
    - Open a Google Meet or Zoom link.
    - Click the MeetScribe AI icon or use the sidebar trigger to start recording.

---

## 📋 Roadmap

- [ ] Support for local LLM inference via WebLLM.
- [ ] Integration with Jira/Trello for automatic task creation.
- [ ] Multi-language transcription support (beyond English).
- [ ] Real-time translation overlay for international meetings.

---

## 🤝 Contributing

We welcome contributions! Please check out our [DOCUMENTS.md](./DOCUMENTS.md) for team roles and [WEEKLY_REPORTS.md](./WEEKLY_REPORTS.md) for current development status.

---

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.
