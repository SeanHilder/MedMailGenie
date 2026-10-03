# MedMailGenie

A university team project: a Chrome extension that helps users read and respond to Gmail messages, with a local Python API powered by Gemini.

## What it does

- Summarises the open email and classifies its priority and topic.
- Extracts tasks, deadlines, and meeting details.
- Drafts replies with professional, friendly, concise, or formal tones.
- Supports voice dictation, transcript cleanup, and reading replies aloud.
- Opens Google Calendar event forms for extracted meetings.

Replies stay in the popup until you copy them into Gmail. Approving a reply does **not** send it, and calendar events are only saved after you confirm them in Google Calendar. Thread summarisation is available through the API; the popup currently analyses a single message.

## Get started

You need **Python 3.10+**, **Node.js 22.12+**, Chrome, and a Gemini API key.

1. Follow [SETUP.md](SETUP.md) to start the backend and build the extension.
2. Load `extensions/dist` as an unpacked extension in Chrome.
3. Open a message in Gmail, then open MedMailGenie from the toolbar.

Email content and voice transcripts used for AI features are sent through the local backend to Gemini. Use sample or synthetic emails while developing this university prototype.

## How the project fits together

```text
Gmail page <-> Chrome content script <-> Extension popup
                                              |
                                      Local FastAPI backend
                                              |
                                           Gemini
```

```text
backend/
  main.py                 FastAPI application and middleware
  app/
    routes.py             HTTP endpoints
    schemas.py            Request and response models
    services.py           Email prompts and response parsing
    gemini.py             Gemini client and text generation
    config.py             Environment configuration
  tests/                  API regression tests (no API key needed)
  .env.example            Copy to .env and add your own key
  requirements.txt        Runtime dependencies
  requirements-dev.txt    Test and formatting tools
extensions/
  popup.html              Popup markup
  public/                 Manifest and static assets, copied by Vite
  src/
    content.ts            Page-side message listener
    content/              Gmail reading and speech recognition
    popup/                Popup entry point, analysis, voice, state, and styles
    api.ts                Shared backend HTTP client and URL
    types.ts              Shared API response types
  tests/                  Tests of the built content script
  vite.config.ts          Extension build configuration
```

Start with `extensions/src/popup/index.ts` for popup behaviour, `extensions/src/content/gmail.ts` for reading Gmail, or `backend/app/services.py` for AI prompts. Build output belongs in `extensions/dist`; edit the source files instead.

## Working on the project

See [CONTRIBUTING.md](CONTRIBUTING.md) for local checks, formatting, and where to make common changes. See [SETUP.md](SETUP.md) for troubleshooting and the API endpoint list.

Commit source code, dependency manifests, and `extensions/package-lock.json`. Keep `.env`, virtual environments, `node_modules`, caches, and generated bundles out of Git.

### Repository history cleanup

On 3 October 2026, the history was rewritten to remove previously committed dependency folders, generated bundles, Python caches, and `.env` files. The source-code history was preserved, and a fresh clone's Git pack dropped from about 41 MB to 1.3 MB.

If you cloned before this cleanup, save any uncommitted or unpushed work, keep the old folder as a temporary backup, and clone into a new folder:

```bash
git clone https://github.com/SeanHilder/MedMailGenie.git MedMailGenie-clean
```

Follow [SETUP.md](SETUP.md) to reinstall dependencies and rebuild the extension. Restore local `.env` configuration separately. Copy any unfinished source changes into the new clone and commit them there; do not merge or push the old history back into the repository.

For an even smaller download when you do not need older commits, add `--depth 1` to the clone command. Run `git fetch --unshallow` later if you need the full cleaned history.
