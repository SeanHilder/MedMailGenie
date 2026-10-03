# Contributing

Keep changes small enough for another teammate to understand and review. Describe what changed and how you checked it in your pull request.

## Where to make changes

| Change | Start here |
| --- | --- |
| Popup layout or colours | `extensions/popup.html`, `extensions/src/popup/styles.css` |
| Popup buttons and startup | `extensions/src/popup/index.ts` |
| AI analysis and reply display | `extensions/src/popup/analysis.ts` |
| Popup voice controls | `extensions/src/popup/voice.ts` |
| Gmail selectors | `extensions/src/content/gmail.ts` |
| Browser speech recognition | `extensions/src/content/speech.ts` |
| Backend URL or HTTP handling | `extensions/src/api.ts` |
| AI prompts and output parsing | `backend/app/services.py` |
| HTTP endpoints or data models | `backend/app/routes.py`, `backend/app/schemas.py` |
| Gemini client or environment settings | `backend/app/gemini.py`, `backend/app/config.py` |
| Extension permissions and metadata | `extensions/public/manifest.json` |

The content script runs inside Gmail; the popup has its own short-lived state. They communicate using Chrome messages. Keep Gmail DOM access in the content modules and backend requests in the popup's API client. Shared runtime imports between the popup and content entry points can create JavaScript chunks that Chrome content scripts cannot load; the bundle tests help catch this.

## Before opening a pull request

From `extensions/`:

```bash
npm ci
npm run format:check
npm run build
npm test
```

Use `npm run format` to apply formatting. `npm test` exercises the generated content script, so build first. `npm run type-check` is also available separately.

From `backend/`, using the virtual environment created in [SETUP.md](SETUP.md):

```powershell
# Windows
.venv\Scripts\python.exe -m ruff check .
.venv\Scripts\python.exe -m ruff format --check .
.venv\Scripts\python.exe -m unittest discover -s tests -v
```

On macOS / Linux, replace `.venv\Scripts\python.exe` with `.venv/bin/python`. Use `python -m ruff format .` with your virtual environment's Python to format backend files.

Tests use mocked Gemini responses and browser APIs: no key, account, or paid API calls are needed. Also check affected features manually in Chrome, especially voice input and Gmail extraction. Automated checks cannot verify microphone permissions or Gmail's current page structure.

## Dependencies and generated files

- Use `npm install` when intentionally adding or updating a dependency, and commit both `package.json` and `package-lock.json`.
- Put Python runtime packages in `backend/requirements.txt` and development tools in `backend/requirements-dev.txt`. Runtime dependencies remain unpinned from the original project; a full Python lockfile is a separate improvement.
- Commit `.env.example` with placeholders; keep real keys in ignored `.env` files.
- Never add `node_modules`, virtual environments, caches, logs, or `dist` to commits. Build the extension locally after cloning.
- Check `git status --short` before committing. Use `git ls-files -ci --exclude-standard` to find tracked files that match ignore rules; ideally it prints nothing.

## Current limitations

Gmail extraction uses page selectors and may need updates when Gmail changes. Thread summaries are API-only. The Gemini SDK and model default are retained from the existing app; changing providers or SDKs should be reviewed separately. The backend is a local development service with permissive CORS, not a deployed multi-user service.
