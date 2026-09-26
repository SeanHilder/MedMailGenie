# MedMail Genie — Local Setup Guide

This guide gets the project running on your machine from a fresh clone.

## Prerequisites

- Python 3.x with `pip`
- Node.js (LTS version) — https://nodejs.org/
- A Gemini API key (free) — https://aistudio.google.com/apikey

## 1. Clone the repository

```bash
git clone https://github.com/SeanHilder/MedMailGenie.git
cd MedMailGenie
```

## 2. Backend setup

```bash
cd backend
pip install -r requirements.txt
```

Create a file named `.env` inside the `backend/` folder with this content:GOOGLE_API_KEY=your_gemini_api_key_here


**Never commit this file.** It's already excluded via `.gitignore`.

### Start the backend (keep this terminal open while testing)

```bash
uvicorn main:app --reload
```

You should see:INFO: Uvicorn running on http://127.0.0.1:8000
INFO: Application startup complete.

Verify it's working by visiting http://127.0.0.1:8000/docs in your browser.

## 3. Frontend (Chrome extension) setup

Open a **new terminal** (don't close the one running the backend).

```bash
cd extensions
npm install
npm run build
```

This generates the `dist/` folder, which is the built extension.

## 4. Load the extension into Chrome

1. Open `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `extensions/dist` folder
5. The MedMailGenie icon should appear in your Chrome toolbar

## 5. Test it

1. Make sure the backend terminal from Step 2 is still running
2. Open Gmail, open any email
3. Click the MedMailGenie extension icon
4. The popup should show an AI-generated summary, priority, extracted tasks, and a suggested reply based on the currently open email

## Troubleshooting

- **"Could not load summary" / "Could not load tasks"** → The backend isn't running. Go back to Step 2 and restart `uvicorn`.
- **Extension shows old content after code changes** → Run `npm run build` again, then click the refresh icon on the extension card in `chrome://extensions/`.
- **`vite: Permission denied` during build** → Run `chmod +x node_modules/.bin/vite` once, then retry `npm run build`.

## Re-running after your computer restarts

Every time you want to test the extension, you need to:
1. Start the backend (`uvicorn main:app --reload` from the `backend/` folder)
2. Keep that terminal open
3. Then use the extension in Chrome
