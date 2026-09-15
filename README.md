# Studia — Your AI Study Companion

Studia is a personal AI school assistant, tutor, study planner and long-term academic
memory. Import your school material — syllabuses, worksheets, test notifications, class
notes, photos of handwritten work — and Studia continuously builds an understanding of
what you're learning, what you struggle with, and what to study next.

## Quick start

**macOS app (recommended):** double-click **`Studia.app`** on the Desktop. It starts the
server if it isn't running (installing/building on first launch if needed), then opens
Studia in a standalone app window (Chrome/Brave/Edge app-mode, falling back to your
default browser). The server keeps running in the background; its log is
`Studia/.launcher.log`. To stop it: kill the process on port 3456, e.g.
`lsof -ti :3456 | xargs kill`.

```bash
npm install
npm run build
npm start          # → http://localhost:3456  (or PORT=xxxx npm start)
```

For development: `npm run dev`.

On first launch an onboarding wizard sets up your profile, subjects and learning
preferences. Choose **Load demo data** on the welcome screen to explore immediately with
a fully populated Year 10 student (Mathematics · Quadratics, Science · Cell Biology,
English · Persuasive Writing) — every sample item is labelled `demo` and can be cleared
in Settings at any time.

## Connecting your AI

Settings → **AI provider** accepts any OpenAI-compatible endpoint:

| Field | Example |
| --- | --- |
| Base URL | `https://api.openai.com/v1`, `https://openrouter.ai/api/v1`, `http://localhost:11434/v1` (Ollama) |
| API key | `sk-…` (stored locally in the on-device database, never sent anywhere except your provider) |
| Model | `gpt-4o-mini`, `claude-sonnet-4…`, `gemini-2.0-flash`, `llama3`, … |

**Test connection** verifies the endpoint and surfaces useful errors (bad key, wrong
model, rate limits). AI features gracefully degrade without a key: documents are still
stored and searchable, practice is graded deterministically, and demo data lets you see
the full experience.

## What's inside

- **Dashboard** — today's priorities, upcoming assessments with AI-estimated readiness,
  continue-studying card, per-course mastery overview.
- **Documents** — upload (PDF, DOCX, PPTX, TXT, MD, images/screenshots) or paste text.
  AI analysis detects document type, course, unit, topics, key concepts, formulas,
  definitions, dates; **syllabuses** propose a full curriculum you can apply with one
  click; **assessment notifications** automatically create tests/assignments with dates,
  weighting and topic lists. Low-confidence course matches ask you to confirm.
- **Notes** — 10 generation modes (summary, exam notes, cheat sheet, worked examples…)
  grounded in your own material, with "From your material" / "Additional explanation"
  markers and source links. Everything is editable.
- **Flashcards** — generate decks (10/25/50/custom, six card types), flip-and-rate
  review (Didn't know / Hard / Know it / Easy), bookmarking and a lightweight SM-2
  spaced-repetition scheduler.
- **Practice** — question generator (difficulty, type, count) grounded in your
  curriculum. Wrong answers get a **misconception analysis and a hint first** — never an
  instant answer dump — then a full explanation on retry, a "try a similar problem"
  generator, and automatic mistake + mastery updates.
- **Tests & Assignments** — list and calendar views, per-topic readiness bars,
  recommended study plans you can push into the planner.
- **Study Planner** — generates balanced daily plans from deadlines, weak topics, due
  flashcards and available time (deterministic baseline, AI-refined when connected).
- **AI Tutor** — persistent chat that knows your courses, mastery, recurring mistakes
  and deadlines, with six explanation modes (Explain Simply → Teach Me) and citations to
  your uploaded documents. ⌘K global search covers courses, topics, documents (full-text
  with snippets), notes, flashcards and questions.
- **Progress** — study stats, mastery-over-time chart, per-topic mastery, assessment
  readiness and a recurring-mistake feed.

## Architecture

- **Next.js 15 (App Router) + React 19 + TypeScript + Tailwind CSS 4** — dark/light
  mode, responsive down to mobile (bottom tab bar), keyboard accessible.
- **SQLite** via Node's built-in `node:sqlite` (WAL) — zero native dependencies, stored
  at `data/studia.db`. Structured relational schema (profile, courses, units, topics,
  documents + chunks + FTS5 index, assessments, notes, decks/cards/reviews, practice
  sets/questions/attempts, mistakes, study sessions, mastery history, tutor
  conversations) — not one big JSON blob.
- **Structured AI memory** — every AI call assembles only the relevant context slices
  (profile, course + topic mastery, recent mistakes, upcoming assessments) plus
  FTS5-retrieved document chunks. The whole database is never sent.
- **Server-side AI client** (`src/lib/ai/`) — OpenAI-compatible chat completions with
  JSON-mode retry, friendly error mapping and optional vision for images. The API key
  lives only in the local database and is never exposed to the client (masked in
  settings responses).
- **Mastery is a study signal, not a grade** — an exponential blend of practice results
  (weighted by difficulty and attempt number), flashcard performance and recency decay,
  always labelled "AI-estimated".

## Privacy

All data stays in `data/studia.db` on your device. Settings → **Privacy & data** offers
full JSON export, reset of AI-derived memory (conversations, mastery, mistakes), demo
load/clear and complete deletion. The only outbound traffic is chat-completion calls to
the AI provider you configure.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server (Turbopack) |
| `npm run build` / `npm start` | Production build / serve |
| `npm run lint` | ESLint |
