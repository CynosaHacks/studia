import { db, nowISO, todayLocal } from "./db";
import { indexDocumentChunks } from "./ingest/analyze";

// Demo dataset: Year 10 student (Alex) with Mathematics/Quadratics, Science/Cell Biology,
// English/Persuasive Writing. All rows flagged is_demo=1 so they can be cleared cleanly.
// Dates are generated relative to *today* so the demo always looks current.

function dateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function tsAgo(days: number, hours = 0): string {
  return new Date(Date.now() - days * 86400000 - hours * 3600000).toISOString();
}

export function clearDemoData() {
  const demoCourseIds = (db.prepare("SELECT id FROM courses WHERE is_demo = 1").all() as Array<{ id: number }>).map((r) => r.id);
  const demoDocIds = (db.prepare("SELECT id FROM documents WHERE is_demo = 1").all() as Array<{ id: number }>).map((r) => r.id);
  db.prepare("DELETE FROM document_chunks_fts WHERE document_id IN (SELECT id FROM documents WHERE is_demo = 1)").run();
  for (const table of [
    "attempts", "questions", "practice_sets", "flashcards", "flashcard_decks",
    "notes", "assessments", "study_sessions", "mastery_records", "mistakes",
  ]) {
    db.prepare(`DELETE FROM ${table} WHERE is_demo = 1`).run();
  }
  db.prepare("DELETE FROM documents WHERE is_demo = 1").run();
  for (const id of demoCourseIds) db.prepare("DELETE FROM courses WHERE id = ?").run(id); // cascades units/topics
  void demoDocIds;
  // Demo tutor conversation
  db.prepare("DELETE FROM ai_messages WHERE conversation_id IN (SELECT id FROM ai_conversations WHERE title LIKE '%[demo]%')").run();
  db.prepare("DELETE FROM ai_conversations WHERE title LIKE '%[demo]%'").run();
  db.prepare("DELETE FROM study_sessions WHERE plan_date >= '2000-01-01' AND is_demo = 1").run();
  db.prepare("DELETE FROM topics WHERE is_demo = 1").run();
  db.prepare("DELETE FROM units WHERE course_id NOT IN (SELECT id FROM courses)").run();
}

export function loadDemoData() {
  clearDemoData();

  // ---- profile ----
  db.prepare(
    `INSERT INTO student_profile (id, name, grade_level, school_year, explanation_detail, prefer_examples, prefer_visual, notes_style, difficult_subjects, goals, study_minutes_per_day, onboarded, created_at, updated_at)
     VALUES (1, 'Alex', 'Year 10', '2026', 'standard', 1, 1, 'concise', '["Mathematics","Science"]', 'Get an A in end-of-year Maths; keep Science above 85%.', 45, 1, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name='Alex', grade_level='Year 10', school_year='2026', explanation_detail='standard', prefer_examples=1, prefer_visual=1, notes_style='concise', difficult_subjects='[\"Mathematics\",\"Science\"]', goals='Get an A in end-of-year Maths; keep Science above 85%.', study_minutes_per_day=45, onboarded=1, updated_at=excluded.updated_at`
  ).run(tsAgo(60), nowISO());

  // ---- courses ----
  const math = db.prepare("INSERT INTO courses (name, teacher, description, color, is_demo, created_at) VALUES ('Mathematics','Mr. Okafor','Advanced Year 10 mathematics with a focus on algebra and quadratics this term.','indigo',1,?)").run(tsAgo(58)).lastInsertRowid as number;
  const sci = db.prepare("INSERT INTO courses (name, teacher, description, color, is_demo, created_at) VALUES ('Science','Ms. Nguyen','Year 10 science — biology unit: cells, respiration and genetics.','emerald',1,?)").run(tsAgo(58)).lastInsertRowid as number;
  const eng = db.prepare("INSERT INTO courses (name, teacher, description, color, is_demo, created_at) VALUES ('English','Mrs. Clarke','Persuasive writing, rhetoric and text response.','rose',1,?)").run(tsAgo(58)).lastInsertRowid as number;

  // ---- units & topics with mastery ----
  const topics: Array<[number, string, string, number, string, number]> = [
    // courseId, unit, topic, mastery, status, lastStudiedDaysAgo
    [math, "Unit 1: Algebra revision", "Linear equations", 88, "completed", 9],
    [math, "Unit 1: Algebra revision", "Factorising", 91, "completed", 4],
    [math, "Unit 1: Algebra revision", "Simultaneous equations", 79, "completed", 12],
    [math, "Unit 2: Quadratics", "Quadratic equations", 72, "in_progress", 3],
    [math, "Unit 2: Quadratics", "Quadratic formula", 68, "in_progress", 2],
    [math, "Unit 2: Quadratics", "Quadratic graphs", 61, "in_progress", 1],
    [math, "Unit 2: Quadratics", "Completing the square", 38, "in_progress", 1],
    [math, "Unit 2: Quadratics", "Quadratic word problems", 42, "in_progress", 2],
    [sci, "Unit 1: Cells", "Cell structure", 84, "completed", 8],
    [sci, "Unit 1: Cells", "Cell transport", 77, "completed", 6],
    [sci, "Unit 2: Cellular processes", "Photosynthesis", 80, "completed", 5],
    [sci, "Unit 2: Cellular processes", "Cellular respiration", 58, "in_progress", 2],
    [sci, "Unit 2: Cellular processes", "Mitosis and meiosis", 51, "in_progress", 4],
    [eng, "Unit 1: Persuasive Writing", "Persuasive devices", 86, "completed", 7],
    [eng, "Unit 1: Persuasive Writing", "Essay structure (TEEL)", 83, "completed", 6],
    [eng, "Unit 1: Persuasive Writing", "Rhetorical appeals", 74, "in_progress", 5],
    [eng, "Unit 2: Text response", "Analytical vocabulary", 70, "in_progress", 9],
  ];
  const topicIds: Record<string, number> = {};
  const unitIds: Record<string, number> = {};
  for (const [courseId, unit, name, mastery, status, ago] of topics) {
    const unitKey = `${courseId}:${unit}`;
    if (!unitIds[unitKey]) {
      unitIds[unitKey] = db
        .prepare("INSERT INTO units (course_id, name, position, status) VALUES (?, ?, ?, ?)")
        .run(courseId, unit, Object.keys(unitIds).filter((k) => k.startsWith(`${courseId}:`)).length, "current").lastInsertRowid as number;
    }
    topicIds[name] = db
      .prepare("INSERT INTO topics (course_id, unit_id, name, mastery, status, last_studied_at, is_demo, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)")
      .run(courseId, unitIds[unitKey], name, mastery, status, tsAgo(ago), tsAgo(58)).lastInsertRowid as number;
  }

  // mastery history for charts (weeks of practice)
  const mrec = db.prepare("INSERT INTO mastery_records (topic_id, course_id, value, previous, reason, source, is_demo, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)");
  for (const [, , name, mastery, , ] of topics) {
    let cur = Math.max(5, mastery - 34);
    for (let w = 5; w >= 0; w--) {
      const step = w === 0 ? mastery : cur;
      mrec.run(topicIds[name], null, Math.round(step), Math.round(cur), w === 0 ? "Latest practice" : "Weekly practice", "practice", tsAgo(w * 7));
      cur = Math.min(mastery, cur + (mastery - cur) / 2 + 4);
    }
  }

  // ---- documents ----
  const insDoc = db.prepare(
    `INSERT INTO documents (course_id, unit_id, title, doc_type, mime_type, file_ext, size, source, status, confidence, summary, analysis, extracted_text, is_demo, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
  );
  const syllabusText = `YEAR 10 MATHEMATICS — COURSE OUTLINE (Semester 2)
Teacher: Mr. Okafor
Unit 1: Algebra revision
- Linear equations and inequalities
- Factorising (common factors, trinomials, difference of two squares)
- Simultaneous equations (substitution and elimination)
Unit 2: Quadratics
- Quadratic equations (solving by factorising)
- Completing the square
- The quadratic formula and the discriminant
- Quadratic graphs: vertex form, axis of symmetry, transformations
- Quadratic word problems (projectiles, area, optimisation)
Unit 3: Trigonometry (later this semester)
Assessment schedule: Topic test on Quadratics in Week 8; Semester exam Week 17.`;
  const mathSyllabus = insDoc.run(
    math, unitIds[`${math}:Unit 2: Quadratics`], "Year 10 Maths Course Outline (Semester 2)", "syllabus", "application/pdf", "pdf", 91342, "upload", "ready", 0.97,
    "Semester 2 outline for Year 10 Mathematics covering algebra revision, quadratics and upcoming trigonometry, plus the assessment schedule.",
    JSON.stringify({
      docType: "syllabus", title: "Year 10 Maths Course Outline (Semester 2)",
      course: { name: "Mathematics", confidence: 0.97, isNew: false, teacher: "Mr. Okafor" },
      unit: "Unit 2: Quadratics",
      topics: ["Quadratic equations", "Completing the square", "Quadratic formula", "Quadratic graphs", "Quadratic word problems"],
      subtopics: ["Discriminant", "Vertex form", "Axis of symmetry"],
      summary: "Semester 2 outline for Year 10 Mathematics covering algebra revision, quadratics and upcoming trigonometry, plus the assessment schedule.",
      keyConcepts: ["Solving quadratics three ways", "Linking graphs to equations", "Word-problem modelling"],
      formulas: ["x = (-b ± √(b² - 4ac)) / 2a", "(a + b)² = a² + 2ab + b²"],
      definitions: [], dates: [{ date: "", what: "Topic test on Quadratics (Week 8)" }],
      objectives: [], tasks: [], examTopics: ["Completing the square", "Quadratic word problems"],
      assessment: null, curriculum: [
        { unit: "Unit 1: Algebra revision", topics: ["Linear equations", "Factorising", "Simultaneous equations"] },
        { unit: "Unit 2: Quadratics", topics: ["Quadratic equations", "Completing the square", "Quadratic formula", "Quadratic graphs", "Quadratic word problems"] },
        { unit: "Unit 3: Trigonometry", topics: ["Trigonometric ratios", "Solving triangles"] },
      ],
      uncertainty: "",
    } satisfies object),
    syllabusText, tsAgo(50)
  ).lastInsertRowid as number;

  const testNoticeText = `NORTHFIELD HIGH — ASSESSMENT NOTIFICATION
Subject: Mathematics (Year 10)
Task: Topic Test — Quadratics
Date: ${dateOffset(6)} (Week 8, Tuesday, Period 2)
Weighting: 15% of semester grade
Format: 45 minutes, calculator allowed, 5 short-answer + 2 extended-response questions
Topics covered:
- Factorising quadratics
- Completing the square
- Quadratic formula and discriminant
- Sketching quadratic graphs
- Quadratic word problems
Required materials: calculator, ruler, pen. Formula sheet will NOT be provided for completing the square.
Note from Mr. Okafor: "Expect at least one word problem. Show all working — method marks are awarded."`;
  const testNotice = insDoc.run(
    math, unitIds[`${math}:Unit 2: Quadratics`], "Maths Test Notification — Quadratics", "assessment_notification", "application/pdf", "pdf", 41230, "upload", "ready", 0.98,
    "Notification for the Year 10 Quadratics topic test: date, weighting, format, topics and required materials.",
    JSON.stringify({
      docType: "assessment_notification", title: "Maths Test Notification — Quadratics",
      course: { name: "Mathematics", confidence: 0.98, isNew: false },
      unit: "Unit 2: Quadratics",
      topics: ["Completing the square", "Quadratic formula", "Quadratic graphs", "Quadratic word problems"],
      subtopics: [], summary: "Notification for the Year 10 Quadratics topic test: date, weighting, format, topics and required materials.",
      keyConcepts: [], formulas: [], definitions: [],
      dates: [{ date: dateOffset(6), what: "Quadratics topic test" }],
      objectives: [], tasks: [], examTopics: ["Quadratic word problems"],
      assessment: { name: "Quadratics Topic Test", type: "test", date: dateOffset(6), weighting: 15, topics: ["Factorising", "Completing the square", "Quadratic formula", "Quadratic graphs", "Quadratic word problems"], format: "45 min, 5 short-answer + 2 extended response, calculator allowed", materials: "Calculator, ruler, pen", confidence: 0.95 },
      curriculum: null, uncertainty: "",
    } satisfies object),
    testNoticeText, tsAgo(12)
  ).lastInsertRowid as number;

  const respirationNotes = `Class Notes — Cellular Respiration (Ms. Nguyen, Science)
Learning intention: explain how cells release energy from glucose.
Key points:
1. Cellular respiration is the process cells use to break down glucose to release energy (ATP).
2. Aerobic respiration: glucose + oxygen → carbon dioxide + water + ATP. Occurs in the mitochondria.
3. Equation: C6H12O6 + 6O2 → 6CO2 + 6H2O + energy (ATP)
4. Anaerobic respiration (fermentation): occurs without oxygen, produces lactic acid in animals / ethanol+CO2 in yeast, releases MUCH less ATP.
5. Mitochondria = site of aerobic respiration; folded inner membrane (cristae) increases surface area.
6. Respiration is NOT "breathing" — breathing supplies the oxygen; respiration happens inside cells.
Common exam traps:
- Confusing respiration with photosynthesis (opposite reactants/products).
- Saying respiration "creates" energy — it TRANSFERS energy from glucose to ATP.
- Mixing up aerobic vs anaerobic products.`;
  const respDoc = insDoc.run(
    sci, unitIds[`${sci}:Unit 2: Cellular processes`], "Class Notes — Cellular Respiration", "class_notes", "text/plain", "txt", 2140, "paste", "ready", 0.9,
    "Mrs. Nguyen's class notes on cellular respiration: aerobic vs anaerobic, the equations, mitochondria structure and common exam traps.",
    JSON.stringify({
      docType: "class_notes", title: "Class Notes — Cellular Respiration",
      course: { name: "Science", confidence: 0.95, isNew: false },
      unit: "Unit 2: Cellular processes",
      topics: ["Cellular respiration"], subtopics: ["Aerobic respiration", "Anaerobic respiration", "Mitochondria"],
      summary: "Mrs. Nguyen's class notes on cellular respiration: aerobic vs anaerobic, the equations, mitochondria structure and common exam traps.",
      keyConcepts: ["Glucose breakdown to ATP", "Aerobic vs anaerobic", "Mitochondria structure"],
      formulas: ["C6H12O6 + 6O2 → 6CO2 + 6H2O + ATP"],
      definitions: [{ term: "ATP", meaning: "Adenosine triphosphate — the energy currency of cells." }, { term: "Cristae", meaning: "Folds of the inner mitochondrial membrane that increase surface area." }],
      dates: [], objectives: ["Explain how cells release energy from glucose"], tasks: [], examTopics: ["Aerobic vs anaerobic products", "Respiration vs photosynthesis"],
      assessment: null, curriculum: null, uncertainty: "",
    } satisfies object),
    respirationNotes, tsAgo(9)
  );

  const assignmentText = `SCIENCE ASSIGNMENT — Cell Processes Report
Due: ${dateOffset(3)}
Weighting: 10%
Task: Write a 600–800 word report comparing photosynthesis and cellular respiration. Include:
- Word and symbol equations for both processes
- A diagram of energy flow (hand-drawn or digital)
- One real-world example of anaerobic respiration
Submission: printed copy in class AND upload to the portal.
Marking: accuracy of equations (40%), explanations (40%), presentation (20%).`;
  const assignDoc = insDoc.run(
    sci, unitIds[`${sci}:Unit 2: Cellular processes`], "Science Assignment — Cell Processes Report", "assignment", "application/pdf", "pdf", 33210, "upload", "ready", 0.93,
    "Assignment brief: compare photosynthesis and cellular respiration in a 600–800 word report due in three days.",
    JSON.stringify({
      docType: "assignment", title: "Science Assignment — Cell Processes Report",
      course: { name: "Science", confidence: 0.95, isNew: false },
      unit: "Unit 2: Cellular processes",
      topics: ["Cellular respiration", "Photosynthesis"], subtopics: [],
      summary: "Assignment brief: compare photosynthesis and cellular respiration in a 600–800 word report due in three days.",
      keyConcepts: ["Comparing processes", "Energy flow diagrams"], formulas: [], definitions: [],
      dates: [{ date: dateOffset(3), what: "Cell Processes Report due" }],
      objectives: [], tasks: ["Write 600–800 word report", "Include both equations", "Draw energy flow diagram", "Give one anaerobic example"],
      examTopics: [], assessment: { name: "Cell Processes Report", type: "assignment", date: dateOffset(3), weighting: 10, topics: ["Cellular respiration", "Photosynthesis"], format: "Written report 600–800 words", materials: "Printed copy + portal upload", confidence: 0.9 },
      curriculum: null, uncertainty: "",
    } satisfies object),
    assignmentText, tsAgo(4)
  );

  const worksheetText = `Completing the Square — Practice Worksheet (Maths, Mr. Okafor)
1. Rewrite y = x² + 6x + 5 in the form (x + h)² + k.
2. Solve x² − 8x + 12 = 0 by completing the square.
3. Express f(x) = 2x² + 12x − 7 in vertex form, and state the vertex.
4. Hence sketch the graph of f(x) in Q3, labelling the vertex and y-intercept.
5. CHALLENGE: A ball's height is h(t) = −5t² + 20t + 1. Find the maximum height by completing the square.`;
  const worksheetDoc = insDoc.run(
    math, unitIds[`${math}:Unit 2: Quadratics`], "Worksheet — Completing the Square", "worksheet", "application/pdf", "pdf", 25431, "upload", "ready", 0.92,
    "Five practice questions on completing the square, from basic re-writing to a projectile challenge problem.",
    JSON.stringify({
      docType: "worksheet", title: "Worksheet — Completing the Square",
      course: { name: "Mathematics", confidence: 0.95, isNew: false },
      unit: "Unit 2: Quadratics",
      topics: ["Completing the square", "Quadratic graphs"], subtopics: ["Vertex form"],
      summary: "Five practice questions on completing the square, from basic re-writing to a projectile challenge problem.",
      keyConcepts: ["Vertex form", "Turning points"], formulas: [], definitions: [],
      dates: [], objectives: [], tasks: ["Q1–Q5 worksheet questions"], examTopics: ["Completing the square"],
      assessment: null, curriculum: null, uncertainty: "",
    } satisfies object),
    worksheetText, tsAgo(2)
  );

  // ---- assessments (auto-detected ones above get created here explicitly) ----
  const insAssess = db.prepare(
    "INSERT INTO assessments (course_id, title, type, due_date, weighting, topics, format, required_materials, notes, source_document_id, is_demo, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)"
  );
  insAssess.run(math, "Quadratics Topic Test", "test", dateOffset(6), 15,
    JSON.stringify(["Factorising", "Completing the square", "Quadratic formula", "Quadratic graphs", "Quadratic word problems"]),
    "45 min, 5 short-answer + 2 extended response, calculator allowed", "Calculator, ruler, pen",
    "Detected automatically from 'Maths Test Notification — Quadratics'.", testNotice, tsAgo(12));
  insAssess.run(sci, "Cell Processes Report", "assignment", dateOffset(3), 10,
    JSON.stringify(["Cellular respiration", "Photosynthesis"]), "Written report 600–800 words", "Printed copy + portal upload",
    "Detected automatically from 'Science Assignment — Cell Processes Report'.", null, tsAgo(4));
  insAssess.run(eng, "Persuasive Speech", "assignment", dateOffset(13), 20,
    JSON.stringify(["Persuasive devices", "Rhetorical appeals", "Essay structure (TEEL)"]), "3–4 minute spoken speech + written draft", "Printed cue cards",
    "", null, tsAgo(2));

  // ---- notes ----
  const insNote = db.prepare(
    "INSERT INTO notes (course_id, topic_id, document_id, title, kind, content, grounding, is_demo, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)"
  );
  insNote.run(math, topicIds["Completing the square"], null, "Completing the Square — Study Guide", "study_guide",
`# Completing the Square — Study Guide

**Goal:** rewrite any quadratic $y = ax^2 + bx + c$ in vertex form $(x+h)^2 + k$ to read off the turning point.

## The method (a = 1)
1. Take half of $b$: that's your $h$.
2. Square it and subtract: $k = c - (b/2)^2$.
3. Result: $(x + b/2)^2 + k$.

## Example
$x^2 + 6x + 5$
- Half of 6 is **3** → $(x+3)^2$
- $(x+3)^2 = x^2+6x+9$, but we need $+5$, so subtract 4:
- **$y = (x+3)^2 - 4$** → vertex $(-3, -4)$

## When a ≠ 1
Factor $a$ out of the first two terms first: $2x^2+12x-7 = 2(x^2+6x)-7$, complete the square inside, multiply back out carefully.

## Common mistakes
- Forgetting to **subtract** the square you added (breaks the equation)
- Not halving $b$ before squaring
- Dropping the $a$ factor when $a \\neq 1$

> From your material: this method follows Mr. Okafor's worksheet (Q1–Q3) and is tested on your Week 8 test.`,
    JSON.stringify([{ documentId: null, title: "Worksheet — Completing the Square" }]), tsAgo(2), tsAgo(2));
  insNote.run(sci, topicIds["Cellular respiration"], null, "Cellular Respiration — Quick Summary", "summary",
`# Cellular Respiration — Quick Summary

**One sentence:** cells break down glucose (with oxygen) to transfer energy into ATP.

## Aerobic (with oxygen)
$$C_6H_{12}O_6 + 6O_2 \\rightarrow 6CO_2 + 6H_2O + \\text{ATP}$$
- Site: **mitochondria** (cristae ↑ surface area)
- Lots of ATP

## Anaerobic (no oxygen)
- Animals → **lactic acid** (+ little ATP)
- Yeast → **ethanol + CO₂** (fermentation)
- Little ATP

## Exam traps (from class notes)
1. Respiration ≠ breathing
2. Respiration **transfers** energy, doesn't create it
3. Don't mix up photosynthesis reactants/products

> From your material: based on Ms. Nguyen's class notes and relevant to the Cell Processes Report.`,
    JSON.stringify([{ documentId: null, title: "Class Notes — Cellular Respiration" }]), tsAgo(3), tsAgo(3));
  insNote.run(eng, topicIds["Rhetorical appeals"], null, "Rhetorical Appeals — Cheat Sheet", "cheat_sheet",
`# Rhetorical Appeals — Cheat Sheet

| Appeal | Meaning | Quick example |
|---|---|---|
| **Ethos** | Credibility | "As a doctor with 20 years' experience…" |
| **Pathos** | Emotion | "Imagine a child going hungry…" |
| **Logos** | Logic/evidence | "Studies show a 40% reduction…" |

**Kairos** = urgency/timing. **Counter-argument + rebuttal** = strongest paragraph in any persuasive piece.

Use in your speech: open with pathos, build with logos, close with ethos.`,
    "[]", tsAgo(5), tsAgo(5));

  // ---- flashcards ----
  const deckMath = db.prepare("INSERT INTO flashcard_decks (course_id, topic_id, title, is_demo, created_at) VALUES (?, ?, ?, 1, ?)").run(math, topicIds["Completing the square"], "Completing the Square — Core", tsAgo(8)).lastInsertRowid as number;
  const deckSci = db.prepare("INSERT INTO flashcard_decks (course_id, topic_id, title, is_demo, created_at) VALUES (?, ?, ?, 1, ?)").run(sci, topicIds["Cellular respiration"], "Cellular Respiration", tsAgo(7)).lastInsertRowid as number;
  const insCard = db.prepare(
    "INSERT INTO flashcards (deck_id, course_id, topic_id, front, back, card_type, ease, interval_days, reps, lapses, due_at, last_reviewed_at, is_demo, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)"
  );
  const mkCard = (deck: number, course: number, topic: string, front: string, back: string, type: string, dueInDays: number, interval: number, reps: number, ease: number) =>
    insCard.run(
      deck, course, topicIds[topic], front, back, type, ease, interval, reps, 0,
      new Date(Date.now() + dueInDays * 86400000).toISOString(),
      reps > 0 ? tsAgo(1) : null, tsAgo(7)
    );
  mkCard(deckMath, math, "Completing the square", "Complete the square: x² + 10x + 9", "(x + 5)² − 16", "application", 0, 0, 0, 2.5);
  mkCard(deckMath, math, "Completing the square", "What do you do with b when completing the square?", "Halve it: the squared bracket is (x + b/2)²", "definition", -1, 1, 2, 2.35);
  mkCard(deckMath, math, "Quadratic formula", "Write the quadratic formula", "x = (−b ± √(b² − 4ac)) / 2a", "formula", 0, 0, 0, 2.5);
  mkCard(deckMath, math, "Quadratic formula", "What does the discriminant b² − 4ac tell you?", "Number of real roots: >0 two, =0 one, <0 none", "definition", 2, 3, 3, 2.6);
  mkCard(deckMath, math, "Quadratic graphs", "Vertex form of a parabola?", "y = a(x − h)² + k, vertex at (h, k)", "definition", -1, 1, 1, 2.4);
  mkCard(deckSci, sci, "Cellular respiration", "Word equation for aerobic respiration", "Glucose + oxygen → carbon dioxide + water + ATP", "definition", 0, 0, 0, 2.5);
  mkCard(deckSci, sci, "Cellular respiration", "Where does aerobic respiration occur?", "In the mitochondria (cristae increase surface area)", "definition", 1, 2, 2, 2.55);
  mkCard(deckSci, sci, "Cellular respiration", "Product of anaerobic respiration in animals?", "Lactic acid (and much less ATP)", "definition", -1, 1, 3, 2.3);
  mkCard(deckSci, sci, "Cellular respiration", "Why is respiration NOT breathing?", "Breathing moves air in/out of lungs; respiration releases energy inside cells", "question_answer", 3, 4, 2, 2.7);

  // ---- practice ----
  const setMath = db.prepare("INSERT INTO practice_sets (course_id, topic_id, title, difficulty, question_types, question_count, is_demo, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)").run(math, topicIds["Completing the square"], "Completing the Square — Mixed Practice", "medium", "mixed", 4, tsAgo(3)).lastInsertRowid as number;
  const insQ = db.prepare(
    "INSERT INTO questions (set_id, course_id, topic_id, type, difficulty, prompt, choices, answer, explanation, hint, misconception, is_demo, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)"
  );
  insQ.run(setMath, math, topicIds["Completing the square"], "short_answer", "medium",
    "Rewrite y = x² + 8x + 3 in the form (x + h)² + k. State h and k.",
    null, "h = 4, k = −13 → y = (x + 4)² − 13",
    "Half of 8 is 4, so (x+4)². But (x+4)² expands to x²+8x+16, and we only have +3, so k = 3 − 16 = −13.",
    "Take half of the coefficient of x, square it, then work out what you must subtract.",
    "Forgetting to subtract the squared term", tsAgo(3));
  insQ.run(setMath, math, topicIds["Completing the square"], "multiple_choice", "medium",
    "Which is x² − 6x + 5 in completed-square form?",
    JSON.stringify(["(x − 3)² − 4", "(x − 3)² + 4", "(x − 6)² − 31", "(x + 3)² − 4"]),
    "(x − 3)² − 4",
    "(x−3)² = x² − 6x + 9; to get +5 you subtract 4.",
    "Halve −6 → −3. Then fix the constant.",
    "Sign error when halving b", tsAgo(3));
  insQ.run(setMath, math, topicIds["Completing the square"], "calculation", "hard",
    "Express f(x) = 2x² + 12x − 7 in vertex form and state the vertex.",
    null, "f(x) = 2(x + 3)² − 25, vertex (−3, −25)",
    "Factor 2 out of the x-terms: 2(x²+6x) − 7 = 2((x+3)² − 9) − 7 = 2(x+3)² − 18 − 7 = 2(x+3)² − 25.",
    "Factor the 2 out FIRST, complete the square inside the bracket, then multiply the subtracted square back by 2.",
    "Dropping the a-factor when expanding back", tsAgo(3));
  insQ.run(setMath, math, topicIds["Quadratic word problems"], "problem_solving", "exam",
    "A ball's height is h(t) = −5t² + 20t + 1 metres. Use completing the square to find the maximum height and when it occurs.",
    null, "h(t) = −5(t − 2)² + 21 → max height 21 m at t = 2 s",
    "−5(t² − 4t) + 1 = −5((t−2)² − 4) + 1 = −5(t−2)² + 20 + 1. The square is ≥ 0, so the max is when (t−2)² = 0.",
    "Take −5 out as a common factor first; watch what happens to the sign inside the bracket.",
    "Sign error when factorising a negative a", tsAgo(3));

  const setSci = db.prepare("INSERT INTO practice_sets (course_id, topic_id, title, difficulty, question_types, question_count, is_demo, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)").run(sci, topicIds["Cellular respiration"], "Cellular Respiration — Quick Quiz", "medium", "mixed", 3, tsAgo(5)).lastInsertRowid as number;
  insQ.run(setSci, sci, topicIds["Cellular respiration"], "true_false", "easy",
    "True or false: cellular respiration and breathing are the same thing.",
    JSON.stringify(["True", "False"]), "False",
    "Breathing ventilates the lungs; respiration is the chemical energy-transfer process inside cells.",
    "Think about WHERE each process happens.", "Confusing respiration with breathing", tsAgo(5));
  insQ.run(setSci, sci, topicIds["Cellular respiration"], "short_answer", "medium",
    "State the products of anaerobic respiration in yeast.",
    null, "Ethanol and carbon dioxide (fermentation), with much less ATP than aerobic respiration",
    "Yeast ferments sugar to ethanol + CO₂ — the basis of brewing and bread-making.",
    "It's different from animals (lactic acid).", "Mixing up aerobic and anaerobic products", tsAgo(5));
  insQ.run(setSci, sci, topicIds["Cellular respiration"], "short_answer", "medium",
    "Write the balanced symbol equation for aerobic respiration.",
    null, "C6H12O6 + 6O2 → 6CO2 + 6H2O (+ ATP)",
    "Glucose (C₆H₁₂O₆) plus six oxygen molecules yield six carbon dioxide and six water molecules.",
    "Count atoms on both sides to check balancing.", "Unbalanced equation", tsAgo(5));

  // ---- attempts ----
  const insAttempt = db.prepare(
    "INSERT INTO attempts (question_id, course_id, topic_id, student_answer, is_correct, score, feedback, attempt_number, is_demo, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)"
  );
  const q1 = db.prepare("SELECT id, course_id, topic_id FROM questions WHERE prompt LIKE 'Rewrite y = x² + 8x + 3%'").get() as { id: number; course_id: number; topic_id: number };
  const q2 = db.prepare("SELECT id, course_id, topic_id FROM questions WHERE prompt LIKE 'A ball%'").get() as { id: number; course_id: number; topic_id: number };
  insAttempt.run(q1.id, q1.course_id, q1.topic_id, "(x+8)² − 61", 0, 20, "Not quite — halve the coefficient of x first (8 → 4), so the bracket is (x+4)², then subtract 4² = 16 and adjust.", 1, tsAgo(3));
  insAttempt.run(q1.id, q1.course_id, q1.topic_id, "(x + 4)² − 13", 1, 100, "Correct — you halved b, squared it and adjusted the constant properly.", 2, tsAgo(3));
  insAttempt.run(q2.id, q2.course_id, q2.topic_id, "Max height 21 m at t = 2", 1, 95, "Correct — good factoring of −5 and clean completion of the square.", 1, tsAgo(1));

  // ---- mistakes ----
  const insMistake = db.prepare(
    "INSERT INTO mistakes (course_id, topic_id, description, tag, count, is_demo, first_seen_at, last_seen_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)"
  );
  insMistake.run(math, topicIds["Completing the square"], "Forgets to subtract the squared constant when completing the square", "missing-subtraction", 4, tsAgo(10), tsAgo(1));
  insMistake.run(math, topicIds["Completing the square"], "Sign error when halving a negative coefficient of x", "sign-error", 3, tsAgo(9), tsAgo(2));
  insMistake.run(math, topicIds["Quadratic word problems"], "Doesn't factor out negative 'a' before completing the square in projectile problems", "negative-a", 2, tsAgo(8), tsAgo(1));
  insMistake.run(sci, topicIds["Cellular respiration"], "Confuses aerobic and anaerobic products", "terminology", 2, tsAgo(6), tsAgo(2));

  // ---- study sessions (today's plan, demo) ----
  const today = todayLocal();
  const insSess = db.prepare(
    "INSERT INTO study_sessions (course_id, topic_id, plan_date, activity, kind, minutes, status, is_demo, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)"
  );
  insSess.run(math, topicIds["Completing the square"], today, "Mathematics — Completing the square: targeted practice", "practice", 25, "planned", tsAgo(0));
  insSess.run(math, topicIds["Completing the square"], today, "Mathematics — Review study guide notes", "review", 5, "planned", tsAgo(0));
  insSess.run(sci, topicIds["Cellular respiration"], today, "Science — Cellular respiration: notes + flashcards", "review", 20, "planned", tsAgo(0));

  // ---- a demo tutor conversation ----
  const conv = db.prepare("INSERT INTO ai_conversations (title, mode, created_at, updated_at) VALUES ('Quadratics test prep [demo]', 'exam', ?, ?)").run(tsAgo(1), tsAgo(1)).lastInsertRowid as number;
  const insMsg = db.prepare("INSERT INTO ai_messages (conversation_id, role, content, meta, created_at) VALUES (?, ?, ?, ?, ?)");
  insMsg.run(conv, "user", "I don't know what to study.", null, tsAgo(1));
  insMsg.run(conv, "assistant",
    "You have your **Quadratics Topic Test in 6 days** (worth 15%). Based on your practice history, your weakest tested topics are:\n\n1. **Completing the square (38%)** — you've made the \"forgot to subtract the square\" mistake 4 times recently\n2. **Quadratic word problems (42%)**\n\nYou also have the Cell Processes Report due in 3 days, and you haven't reviewed cellular respiration since Tuesday.\n\nMy recommendation for right now: **25 minutes of completing-the-square practice**, starting with a refresher on the method from your study guide, then 4 targeted questions. Want me to set that up?", null, tsAgo(1));

  // index document text for search (same pipeline as runtime uploads)
  for (const [docId, courseId, text] of [
    [mathSyllabus, math, syllabusText],
    [testNotice, math, testNoticeText],
    [respDoc.lastInsertRowid as number, sci, respirationNotes],
    [assignDoc.lastInsertRowid as number, sci, assignmentText],
    [worksheetDoc.lastInsertRowid as number, math, worksheetText],
  ] as Array<[number, number, string]>) {
    indexDocumentChunks(docId, courseId, text);
  }

  db.prepare("INSERT INTO app_settings (key, value) VALUES ('demo.active', '1') ON CONFLICT(key) DO UPDATE SET value = '1'").run();
  db.prepare("INSERT INTO app_settings (key, value) VALUES ('demo.loaded_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(nowISO());
}
