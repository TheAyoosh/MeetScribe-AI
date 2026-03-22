# 📄 Team Contributions & Documents

Welcome to the MeetScribe AI documentation page. This document tracks the contributions of each team member and links to key design and implementation details.

---

## 👥 Team Members

| Name | Role | Primary Responsibilities |
| :--- | :--- | :--- |
| **Abhiraj** | **Lead Architect / UX-UI** | Core extension logic, sidebar design, and AI integration. |
| **[Team Member 2]** | **Frontend Engineer** | Popup UI, settings management, and dashboard implementation. |
| **[Team Member 3]** | **Backend / AI Specialist** | HuggingFace Inference integration & Gemini 1.5 logic. |
| **[Team Member 4]** | **QA & DevOps** | Testing for cross-platform support (Zoom/Teams) & deployment. |

---

## 📝 Document Ownership

### 1. **Core Extension Implementation**
*   **Managed By**: Abhiraj
*   **Focus**: `manifest.json`, `service-worker.js`, and `offscreen.js`.
*   **Key Achievement**: Sucessfully implemented `tabCapture` via offscreen documents in Manifest V3.

### 2. **AI Logic & Integration**
*   **Managed By**: [Team Member 3]
*   **Focus**: Transcription engines and tone analysis processors.
*   **Key Achievement**: Integrated HugingFace Inference with Whisper-base for real-time transcription.

### 3. **UI/UX & Responsive Sidebar**
*   **Managed By**: Abhiraj
*   **Focus**: `content.js` and `sidebar.css`.
*   **Key Achievement**: Designed a docked sidebar that doesn't obstruct meeting controls.

### 4. **Storage & Session Reliability**
*   **Managed By**: [Team Member 2]
*   **Focus**: Local storage logic and meeting export features (JSON/MD/SRT).
*   **Key Achievement**: Implemented robust session recovery for accidental tab closes.

---

## 🔗 Internal Links

*   **[API Configuration Guide](./docs/API_CONFIG.md)**: Steps to obtain keys.
*   **[Style Guide](./docs/STYLE_GUIDE.md)**: UI/UX design tokens and CSS patterns.
*   **[Testing Protocol](./docs/TESTING.md)**: Manual and automated test cases.

---

*Last Updated: 2026-03-24*
