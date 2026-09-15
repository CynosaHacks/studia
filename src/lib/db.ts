import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

// Single local user app: one SQLite file, WAL mode.
const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "studia.db");

function createDb(): DatabaseSync {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA busy_timeout = 5000;");
  db.exec("PRAGMA foreign_keys = ON;");
  migrate(db);
  return db;
}

const globalForDb = globalThis as unknown as { __studiaDb?: DatabaseSync };
export const db: DatabaseSync = globalForDb.__studiaDb ?? createDb();
globalForDb.__studiaDb = db;

function migrate(d: DatabaseSync) {
  d.exec(`
  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS student_profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    name TEXT NOT NULL DEFAULT '',
    grade_level TEXT DEFAULT '',
    school_year TEXT DEFAULT '',
    explanation_detail TEXT DEFAULT 'standard',
    prefer_examples INTEGER DEFAULT 1,
    prefer_visual INTEGER DEFAULT 0,
    notes_style TEXT DEFAULT 'concise',
    difficult_subjects TEXT DEFAULT '[]',
    goals TEXT DEFAULT '',
    study_minutes_per_day INTEGER DEFAULT 45,
    onboarded INTEGER DEFAULT 0,
    created_at TEXT,
    updated_at TEXT
  );
  CREATE TABLE IF NOT EXISTS courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    teacher TEXT DEFAULT '',
    description TEXT DEFAULT '',
    color TEXT DEFAULT 'indigo',
    is_demo INTEGER DEFAULT 0,
    archived INTEGER DEFAULT 0,
    created_at TEXT
  );
  CREATE TABLE IF NOT EXISTS units (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    position INTEGER DEFAULT 0,
    status TEXT DEFAULT 'current'
  );
  CREATE TABLE IF NOT EXISTS topics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    unit_id INTEGER REFERENCES units(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    mastery REAL DEFAULT 0,
    status TEXT DEFAULT 'in_progress',
    last_studied_at TEXT,
    is_demo INTEGER DEFAULT 0,
    created_at TEXT,
    UNIQUE(course_id, name)
  );
  CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER REFERENCES courses(id) ON DELETE SET NULL,
    unit_id INTEGER,
    title TEXT,
    doc_type TEXT DEFAULT 'notes',
    mime_type TEXT,
    file_ext TEXT,
    size INTEGER,
    source TEXT DEFAULT 'upload',
    status TEXT DEFAULT 'processing',
    confidence REAL,
    suggested_course TEXT,
    summary TEXT,
    analysis TEXT,
    extracted_text TEXT,
    image_data TEXT,
    is_demo INTEGER DEFAULT 0,
    created_at TEXT
  );
  CREATE TABLE IF NOT EXISTS document_chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    course_id INTEGER,
    chunk_index INTEGER,
    content TEXT
  );
  CREATE VIRTUAL TABLE IF NOT EXISTS document_chunks_fts USING fts5(content, document_id UNINDEXED, course_id UNINDEXED);
  CREATE TABLE IF NOT EXISTS assessments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    type TEXT DEFAULT 'test',
    due_date TEXT,
    weighting REAL,
    topics TEXT DEFAULT '[]',
    format TEXT,
    required_materials TEXT,
    notes TEXT,
    source_document_id INTEGER,
    is_demo INTEGER DEFAULT 0,
    created_at TEXT
  );
  CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER,
    topic_id INTEGER,
    document_id INTEGER,
    title TEXT NOT NULL,
    kind TEXT DEFAULT 'summary',
    content TEXT DEFAULT '',
    grounding TEXT DEFAULT '[]',
    is_demo INTEGER DEFAULT 0,
    created_at TEXT,
    updated_at TEXT
  );
  CREATE TABLE IF NOT EXISTS flashcard_decks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER,
    topic_id INTEGER,
    title TEXT NOT NULL,
    is_demo INTEGER DEFAULT 0,
    created_at TEXT
  );
  CREATE TABLE IF NOT EXISTS flashcards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    deck_id INTEGER REFERENCES flashcard_decks(id) ON DELETE CASCADE,
    course_id INTEGER,
    topic_id INTEGER,
    front TEXT NOT NULL,
    back TEXT NOT NULL,
    card_type TEXT DEFAULT 'definition',
    bookmarked INTEGER DEFAULT 0,
    ease REAL DEFAULT 2.5,
    interval_days REAL DEFAULT 0,
    reps INTEGER DEFAULT 0,
    lapses INTEGER DEFAULT 0,
    due_at TEXT,
    last_reviewed_at TEXT,
    is_demo INTEGER DEFAULT 0,
    created_at TEXT
  );
  CREATE TABLE IF NOT EXISTS flashcard_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    flashcard_id INTEGER NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE,
    rating TEXT,
    reviewed_at TEXT
  );
  CREATE TABLE IF NOT EXISTS practice_sets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER,
    topic_id INTEGER,
    title TEXT,
    difficulty TEXT DEFAULT 'medium',
    question_types TEXT DEFAULT 'mixed',
    question_count INTEGER DEFAULT 5,
    is_demo INTEGER DEFAULT 0,
    created_at TEXT
  );
  CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    set_id INTEGER REFERENCES practice_sets(id) ON DELETE CASCADE,
    course_id INTEGER,
    topic_id INTEGER,
    type TEXT,
    difficulty TEXT,
    prompt TEXT NOT NULL,
    choices TEXT,
    answer TEXT,
    explanation TEXT,
    hint TEXT,
    misconception TEXT,
    is_demo INTEGER DEFAULT 0,
    created_at TEXT
  );
  CREATE TABLE IF NOT EXISTS attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    course_id INTEGER,
    topic_id INTEGER,
    student_answer TEXT,
    is_correct INTEGER,
    score REAL,
    feedback TEXT,
    attempt_number INTEGER DEFAULT 1,
    is_demo INTEGER DEFAULT 0,
    created_at TEXT
  );
  CREATE TABLE IF NOT EXISTS mistakes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER,
    topic_id INTEGER,
    description TEXT NOT NULL,
    tag TEXT,
    count INTEGER DEFAULT 1,
    is_demo INTEGER DEFAULT 0,
    first_seen_at TEXT,
    last_seen_at TEXT
  );
  CREATE TABLE IF NOT EXISTS study_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER,
    topic_id INTEGER,
    plan_date TEXT,
    activity TEXT,
    kind TEXT DEFAULT 'practice',
    minutes INTEGER DEFAULT 15,
    status TEXT DEFAULT 'planned',
    is_demo INTEGER DEFAULT 0,
    created_at TEXT
  );
  CREATE TABLE IF NOT EXISTS mastery_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    topic_id INTEGER,
    course_id INTEGER,
    value REAL,
    previous REAL,
    reason TEXT,
    source TEXT,
    is_demo INTEGER DEFAULT 0,
    created_at TEXT
  );
  CREATE TABLE IF NOT EXISTS ai_conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT DEFAULT 'New conversation',
    mode TEXT DEFAULT 'standard',
    created_at TEXT,
    updated_at TEXT
  );
  CREATE TABLE IF NOT EXISTS ai_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
    role TEXT,
    content TEXT,
    meta TEXT,
    created_at TEXT
  );
  `);
}

// ---------- small helpers ----------

export function getSetting(key: string): string | null {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row ? row.value : null;
}

export function setSetting(key: string, value: string) {
  db.prepare(
    "INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(key, value);
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function todayLocal(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function getProfile() {
  return db.prepare("SELECT * FROM student_profile WHERE id = 1").get() as
    | (Record<string, unknown> & { id: number })
    | undefined;
}

export function parseJSON<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

export function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  const due = new Date(y, m - 1, d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((due.getTime() - today.getTime()) / 86400000);
}
