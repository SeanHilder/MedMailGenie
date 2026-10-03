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

### Why a clone may still be large

Earlier commits contain `node_modules`, including large native binaries. Although those dependencies have been removed from the current tree, a normal clone still downloads their history. Adding an ignore rule does not remove files that Git already tracks or erase older commits.

For a smaller first download, use:

```bash
git clone --depth 1 https://github.com/SeanHilder/MedMailGenie.git
```

A shallow clone has limited history. If you later need older commits, run `git fetch --unshallow`. Permanently removing the old dependency files requires a coordinated history rewrite across the team; this cleanup leaves shared history intact.
