# SuperClinic

**AI-powered clinical tool — discharge summaries & differential diagnosis made easy**

---

## What It Does

SuperClinic helps doctors work faster at two things that eat clinical time:

- **Discharge Summaries** — Input patient details, and the AI generates a structured, clean discharge summary ready for review and sign-off. No more copy-pasting templates and fixing formatting.
- **Differential Diagnosis** — Enter signs, symptoms, and findings. The AI generates a ranked list of differentials with reasoning — a second-opinion tool, not a replacement for clinical judgment.

## Why I Built It

As a pediatrics resident handling ward admissions, I spent hours writing discharge summaries that followed the same structure every time. The clinical thinking was the hard part; the document formatting shouldn't have been. So I built a tool to handle the repetitive part and let the doctor focus on the medicine.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + Vite (`clinicalmind/`) |
| AI/LLM | Claude, Gemini, OpenAI or DeepSeek, called from the browser with the doctor's own key |
| Backend | Firebase: Auth (Google + email login) and Firestore (cloud sync of complaints, templates, settings) |
| Hosting | Firebase Hosting |

Backend setup, local testing with the Firebase emulators, and deployment: see [`clinicalmind/FIREBASE.md`](clinicalmind/FIREBASE.md).

## Who It's For

- Resident doctors drowning in paperwork
- Clinicians who want a quick differential checklist against their own reasoning
- Hospitals looking to standardize discharge documentation

## Current Status

**Active development.** Updated regularly.

---

*Built by [Dr. Anuj Yadav](https://github.com/yadavanujaditya) — a pediatrician building clinical AI tools from inside the system.*
