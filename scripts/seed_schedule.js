require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY,
  { auth: { persistSession: false } }
);

// Event dates: Day 1 = Nov 15 2026, Day 2 = Nov 16 2026
// All times IST (UTC+5:30) converted to ISO UTC for TIMESTAMPTZ

function ist(date, h, m) {
  // Returns UTC ISO string from IST date/hour/min
  const totalMin = h * 60 + m - 330; // subtract 330 min (5h30m) to get UTC
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCMinutes(totalMin);
  return d.toISOString();
}

const D1 = "2026-11-15";
const D2 = "2026-11-16";

const scheduleItems = [
  // ── DAY 1 ─────────────────────────────────────────────────────────────────
  {
    title: "Day 1 — Inauguration, Introduction & Programme Briefing",
    description: "Welcome address, event objectives, rules, schedule, judging process, venue instructions, and team confirmation.",
    start_time: ist(D1, 9, 30),
    end_time:   ist(D1, 10, 0),
    location: "Main Hall",
    event_type: "ceremony",
    is_active: 1
  },
  {
    title: "Day 1 — Team Setup & Problem Statement Confirmation",
    description: "Teams settle in, confirm assigned problem statements, set up tools, and clarify requirements.",
    start_time: ist(D1, 10, 0),
    end_time:   ist(D1, 10, 30),
    location: "Main Hall",
    event_type: "general",
    is_active: 1
  },
  {
    title: "Day 1 — Checkpoint 1: Problem Understanding",
    description: "Problem analysis, target users, problem faced, objectives, proposed solution, and core features.",
    start_time: ist(D1, 10, 30),
    end_time:   ist(D1, 11, 15),
    location: "Main Hall",
    event_type: "judging",
    is_active: 1
  },
  {
    title: "Day 1 — Development Sprint 1",
    description: "Teams refine requirements and start solution planning.",
    start_time: ist(D1, 11, 15),
    end_time:   ist(D1, 11, 45),
    location: "Main Hall",
    event_type: "workshop",
    is_active: 1
  },
  {
    title: "Day 1 — Checkpoint 2: System Architecture",
    description: "Architecture diagram, technology stack, component responsibilities, and data flow.",
    start_time: ist(D1, 11, 45),
    end_time:   ist(D1, 12, 30),
    location: "Main Hall",
    event_type: "judging",
    is_active: 1
  },
  {
    title: "Day 1 — Lunch Break",
    description: "Lunch break for students, mentors, and jury.",
    start_time: ist(D1, 12, 30),
    end_time:   ist(D1, 13, 15),
    location: "Cafeteria",
    event_type: "break",
    is_active: 1
  },
  {
    title: "Day 1 — Resume Work & Prepare Design Review",
    description: "Teams finalize design artefacts for the next checkpoint.",
    start_time: ist(D1, 13, 15),
    end_time:   ist(D1, 13, 30),
    location: "Main Hall",
    event_type: "general",
    is_active: 1
  },
  {
    title: "Day 1 — Checkpoint 3: Database & UI/UX Design",
    description: "ER diagram or suitable data model, database structure, data flow, and UI/UX wireframes.",
    start_time: ist(D1, 13, 30),
    end_time:   ist(D1, 14, 15),
    location: "Main Hall",
    event_type: "judging",
    is_active: 1
  },
  {
    title: "Day 1 — Development Sprint 2",
    description: "Begin or continue implementation based on the design.",
    start_time: ist(D1, 14, 15),
    end_time:   ist(D1, 14, 45),
    location: "Main Hall",
    event_type: "workshop",
    is_active: 1
  },
  {
    title: "Day 1 — Checkpoint 4: Technical Implementation",
    description: "Initial backend/core logic, frontend progress, APIs or equivalent interfaces, and early integration.",
    start_time: ist(D1, 14, 45),
    end_time:   ist(D1, 15, 30),
    location: "Main Hall",
    event_type: "judging",
    is_active: 1
  },
  {
    title: "Day 1 — Prepare Progress Submission",
    description: "Update PPT, collect screenshots, list completed features and blockers.",
    start_time: ist(D1, 15, 30),
    end_time:   ist(D1, 16, 0),
    location: "Main Hall",
    event_type: "general",
    is_active: 1
  },
  {
    title: "Day 1 — Checkpoint 5: Day 1 Progress Review & Exit Briefing",
    description: "Demonstrate current progress; verify diagrams, PPT, completed/pending features, and home-improvement plan.",
    start_time: ist(D1, 16, 0),
    end_time:   ist(D1, 16, 30),
    location: "Main Hall",
    event_type: "judging",
    is_active: 1
  },
  {
    title: "Day 1 — Optional Work at Home",
    description: "Teams may improve the prototype, testing, diagrams, and PPT before Day 2.",
    start_time: ist(D1, 16, 30),
    end_time:   null,
    location: "Remote",
    event_type: "general",
    is_active: 1
  },
  // ── DAY 2 ─────────────────────────────────────────────────────────────────
  {
    title: "Day 2 — Arrival & Attendance",
    description: "Teams arrive, confirm attendance, and prepare project/demo access.",
    start_time: ist(D2, 9, 0),
    end_time:   ist(D2, 9, 20),
    location: "Main Hall",
    event_type: "general",
    is_active: 1
  },
  {
    title: "Day 2 — Final Presentation Preparation",
    description: "Final PPT check, demo test, repository/demo links, architecture/database slides, and submission confirmation.",
    start_time: ist(D2, 9, 20),
    end_time:   ist(D2, 9, 45),
    location: "Main Hall",
    event_type: "general",
    is_active: 1
  },
  {
    title: "Day 2 — Final Jury Review",
    description: "Teams present problem, solution, architecture, data model, prototype, testing, impact, and answer jury questions.",
    start_time: ist(D2, 9, 45),
    end_time:   ist(D2, 11, 0),
    location: "Main Hall",
    event_type: "judging",
    is_active: 1
  },
  {
    title: "Day 2 — Jury Score Consolidation",
    description: "Collect score sheets, verify totals, and resolve missing entries.",
    start_time: ist(D2, 11, 0),
    end_time:   ist(D2, 11, 15),
    location: "Jury Room",
    event_type: "judging",
    is_active: 1
  },
  {
    title: "Day 2 — Ranking & Top 25 Selection",
    description: "Rank eligible teams using final scores and applicable tie-break rules.",
    start_time: ist(D2, 11, 15),
    end_time:   ist(D2, 11, 25),
    location: "Jury Room",
    event_type: "judging",
    is_active: 1
  },
  {
    title: "Day 2 — Final Verification",
    description: "Verify team IDs, project titles, and shortlist.",
    start_time: ist(D2, 11, 25),
    end_time:   ist(D2, 11, 30),
    location: "Jury Room",
    event_type: "general",
    is_active: 1
  },
  {
    title: "Day 2 — Top 25 Teams Announcement",
    description: "Official announcement of shortlisted teams.",
    start_time: ist(D2, 11, 30),
    end_time:   ist(D2, 11, 35),
    location: "Main Hall",
    event_type: "ceremony",
    is_active: 1
  },
  {
    title: "Day 2 — Finale Review Preparation",
    description: "Shortlisted teams refine demos, verify PPT, organize team roles, and prepare technical explanations.",
    start_time: ist(D2, 11, 30),
    end_time:   ist(D2, 13, 30),
    location: "Main Hall",
    event_type: "workshop",
    is_active: 1
  },
  {
    title: "Day 2 — Finale Review / Next Programme",
    description: "Proceed according to the organiser's confirmed finale timetable.",
    start_time: ist(D2, 13, 30),
    end_time:   null,
    location: "Main Hall",
    event_type: "ceremony",
    is_active: 1
  }
];

async function seedSchedule() {
  console.log("Clearing existing schedule...");
  const { error: delErr } = await supabase.from("schedule").delete().neq("id", 0);
  if (delErr) { console.error("Delete error:", delErr.message); process.exit(1); }

  console.log("Inserting " + scheduleItems.length + " schedule entries...");
  const { data, error } = await supabase.from("schedule").insert(scheduleItems).select();
  if (error) { console.error("Insert error:", error.message); process.exit(1); }

  console.log("Done! Inserted " + data.length + " schedule items.");
  console.log("  Day 1 entries: " + data.filter(function(r){ return r.title.startsWith("Day 1"); }).length);
  console.log("  Day 2 entries: " + data.filter(function(r){ return r.title.startsWith("Day 2"); }).length);
}

seedSchedule().catch(function(err){ console.error("Fatal:", err.message); process.exit(1); });
