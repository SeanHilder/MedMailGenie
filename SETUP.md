# Local setup

Run backend commands from `backend/` and extension commands from `extensions/`. Keep the backend running while using the extension.

## 1. Prerequisites

- Python 3.10 or newer, with pip.
- Node.js 22.12 or newer, with npm.
- Google Chrome.
- A Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey).

Clone the repository and open it in your editor:

```bash
git clone https://github.com/SeanHilder/MedMailGenie.git
cd MedMailGenie
```

Use `git clone --depth 1` for a smaller download if you do not need the full commit history.

## 2. Set up the backend

Create a virtual environment so project packages stay separate from your system Python.

**Windows PowerShell** (from the repository root):

```powershell
cd backend
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
Copy-Item .env.example .env
```

**macOS / Linux** (from the repository root):

```bash
cd backend
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-dev.txt
cp .env.example .env
```

Edit `backend/.env` and replace `your_gemini_api_key_here` with your key. The file is ignored by Git. Environment variables already set in your terminal take precedence over `.env`.

`GEMINI_MODEL` keeps the project's existing default, `gemini-3.5-flash-lite`. If that model is unavailable to your key, set this value to a model your account supports. The local tests do not verify model availability.

Start the API:

```powershell
# Windows, from backend/
.venv\Scripts\python.exe -m uvicorn main:app --reload
```

```bash
# macOS / Linux, from backend/
.venv/bin/python -m uvicorn main:app --reload
```

Open [the health endpoint](http://127.0.0.1:8000/) or [interactive API docs](http://127.0.0.1:8000/docs). Both work without an API key; AI endpoints need a valid key and network access.

## 3. Build and load the extension

Open a second terminal at the repository root:

```bash
cd extensions
npm ci
npm run build
```

`npm ci` installs the versions recorded in the lockfile. The build type-checks the source and generates `extensions/dist`.

1. Open `chrome://extensions/` in Chrome.
2. Enable **Developer mode**.
3. Select **Load unpacked** and choose `extensions/dist`.
4. Open or refresh Gmail, then open an email.
5. Click the MedMailGenie toolbar icon.

After source changes, rebuild and click **Reload** on the extension card. Refresh Gmail too when changing page-side code. `npm run dev` rebuilds automatically when source files change, but Chrome still needs to reload the extension.

The source manifest is `extensions/public/manifest.json`. Vite copies it and `public/assets` into `dist`; do not edit generated files.

## 4. Check the main flows

Use a sample email to check summary, priority, topic, tasks, and reply generation. Change the tone and regenerate a reply. Try editing, approval, copying, voice input, and reading aloud. An extracted meeting should open a Google Calendar form with its title and times filled in.

The popup must stay open during voice input. Allow microphone access if Chrome requests it. Review and edit a draft, then click **Approve**. The extension opens Reply for the analysed message and inserts the text above any signature and quoted history. Review the result in Gmail and click **Send** yourself. No Gmail API setup is required; Gmail may autosave the inserted draft.

To test approval, use a sample conversation with no existing reply text. Confirm that approval opens a reply, preserves line breaks, and does not send it. Repeat with an existing handwritten draft: insertion should stop and preserve your text. If the conversation changes after loading, reopen MedMailGenie to analyse it again. The popup analyses the last expanded, visible message. Reply-button detection currently uses Gmail's English labels; changed layouts or other languages may require opening Reply manually or using **Copy Reply**.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| AI fields fail to load | Keep the backend terminal open; check its error output and `backend/.env`. |
| API reports a missing key or unavailable model | Set `GOOGLE_API_KEY` and, if needed, `GEMINI_MODEL`; restart the backend after editing `.env`. |
| No email detected | Open a message in Gmail, reload the extension, refresh Gmail, then reopen the popup. Gmail selectors live in `src/content/gmail.ts`. |
| Old UI after changes | Run `npm run build`, reload the extension in Chrome, and refresh Gmail. |
| Approval cannot insert a reply | Refresh Gmail after reloading the extension. Close unrelated reply editors, preserve any existing draft, and try again. Use Copy Reply if Gmail's layout is unsupported. |
| `npm` scripts are blocked in PowerShell | Use `npm.cmd` instead of `npm`; no execution-policy change is needed. |
| Node engine error | Check `node --version` and use Node 22.12+ or a newer supported release. |
| Port 8000 is already in use | Stop the other local server, or change the API port and `extensions/src/api.ts` together, then rebuild. |

## API reference

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/` | Health check |
| POST | `/summarize/email` | Summarise one email |
| POST | `/summarize/thread` | Summarise an ordered list of messages |
| POST | `/draft/generate` | Generate a reply using the selected tone |
| POST | `/classify/priority` | Classify priority |
| POST | `/classify/category` | Classify topic |
| POST | `/extract/tasks` | Extract tasks, deadlines, meetings, and calendar events |
| POST | `/voice/cleanup` | Add formatting to a voice transcript |

Request and response shapes are defined in `backend/app/schemas.py` and shown at `/docs` while the backend is running.
