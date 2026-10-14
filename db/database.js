const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, '..', 'data', 'synapse.db');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

let db;

function getDb() {
    if (!db) {
        db = new Database(DB_PATH);
        db.pragma('journal_mode = WAL');
        db.pragma('foreign_keys = ON');
        db.pragma('busy_timeout = 5000');
    }
    return db;
}

// Function to parse problem statements from vsb_hackathon_ps.md
function parseProblemStatementsFromMarkdown() {
    const psFile = path.join(__dirname, '..', 'vsb_hackathon_ps.md');
    if (!fs.existsSync(psFile)) return [];

    const content = fs.readFileSync(psFile, 'utf-8');
    const regex = /#\s*(\d+)(?:\\\.|[\.\-])\s*([^\r\n]+)([\s\S]*?)(?=(?:#\s*\d+(?:\\\.|[\.\-]))|$)/g;
    let match;
    const statements = [];

    const categories = {
        1: { category: 'FinTech & AI', difficulty: 'medium' },
        2: { category: 'FinTech & Cybersecurity', difficulty: 'hard' },
        3: { category: 'FinTech & Personalization', difficulty: 'medium' },
        4: { category: 'Open Banking & API Ecosystems', difficulty: 'medium' },
        5: { category: 'Payments Modernisation', difficulty: 'medium' },
        6: { category: 'InsurTech & Automated Underwriting', difficulty: 'hard' },
        7: { category: 'InsurTech & Claims Processing', difficulty: 'medium' },
        8: { category: 'InsurTech & IoT Telematics', difficulty: 'medium' },
        9: { category: 'InsurTech & Embedded Finance', difficulty: 'medium' },
        10: { category: 'ClimateTech & Catastrophe Risk', difficulty: 'hard' },
        11: { category: 'HealthTech & Prior Authorisation', difficulty: 'hard' },
        12: { category: 'HealthTech & Clinical Speech NLP', difficulty: 'medium' },
        13: { category: 'HealthTech & FHIR Interoperability', difficulty: 'hard' },
        14: { category: 'HealthTech & Predictive AI', difficulty: 'hard' },
        15: { category: 'HealthTech & Value-Based Analytics', difficulty: 'medium' },
        16: { category: 'AI Mesh Networks & Disaster Response', difficulty: 'hard' },
        17: { category: 'Computer Vision & Accessibility (ISL)', difficulty: 'hard' },
        18: { category: 'LegalTech & Contract Risk Copilot', difficulty: 'hard' },
        19: { category: 'Enterprise AI & Multi-Source RAG', difficulty: 'hard' },
        20: { category: 'GovTech & Multilingual Grievance NLP', difficulty: 'medium' },
        21: { category: 'Public Health & Spatial Outbreak Analytics', difficulty: 'hard' },
        22: { category: 'Blockchain & Pharmaceutical Supply Chain', difficulty: 'hard' },
        23: { category: 'Cybersecurity & AI Agent Defense', difficulty: 'hard' },
        24: { category: 'Digital Forensics & Evidence Integrity', difficulty: 'hard' },
        25: { category: 'Smart Mobility & Usage-Based Insurance', difficulty: 'medium' }
    };

    while ((match = regex.exec(content)) !== null) {
        const num = parseInt(match[1]);
        const title = match[2].trim();
        const body = match[3];

        const psMatch = body.match(/##\s*Problem Statement\s*([\s\S]*?)(?=##\s*Problem Faced|$)/i);
        const pfMatch = body.match(/##\s*Problem Faced\s*([\s\S]*?)(?=##\s*Suggested Solution|$)/i);
        const ssMatch = body.match(/##\s*Suggested Solution\s*([\s\S]*?)$/i);

        const meta = categories[num] || { category: 'Artificial Intelligence', difficulty: 'medium' };

        statements.push({
            ps_number: num,
            title,
            description: psMatch ? psMatch[1].trim() : '',
            problem_faced: pfMatch ? pfMatch[1].trim() : '',
            suggested_solution: ssMatch ? ssMatch[1].trim() : '',
            category: meta.category,
            difficulty: meta.difficulty
        });
    }

    return statements;
}

function initializeDatabase() {
    const db = getDb();

    // Create tables
    db.exec(`
        -- Admin users table
        CREATE TABLE IF NOT EXISTS admins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            name TEXT DEFAULT 'Admin',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- Problem statements table
        CREATE TABLE IF NOT EXISTS problem_statements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ps_number INTEGER,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            problem_faced TEXT,
            suggested_solution TEXT,
            category TEXT NOT NULL,
            difficulty TEXT DEFAULT 'medium' CHECK(difficulty IN ('easy', 'medium', 'hard')),
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- Teams table
        CREATE TABLE IF NOT EXISTS teams (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            team_code TEXT UNIQUE,
            team_name TEXT NOT NULL,
            team_lead_email TEXT NOT NULL,
            team_size INTEGER NOT NULL CHECK(team_size >= 2 AND team_size <= 4),
            password TEXT DEFAULT 'Syanp2K26',
            problem_statement_id INTEGER,
            status TEXT DEFAULT 'registered' CHECK(status IN ('registered', 'approved', 'rejected', 'checked_in')),
            registered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            checked_in_at DATETIME,
            project_repo TEXT,
            project_demo TEXT,
            submission_notes TEXT,
            submission_file_url TEXT,
            FOREIGN KEY (problem_statement_id) REFERENCES problem_statements(id)
        );

        -- Team members table
        CREATE TABLE IF NOT EXISTS team_members (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            team_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            phone TEXT NOT NULL,
            year TEXT NOT NULL,
            department TEXT NOT NULL,
            college TEXT NOT NULL,
            is_leader INTEGER DEFAULT 0,
            FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
        );

        -- Announcements table
        CREATE TABLE IF NOT EXISTS announcements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            priority TEXT DEFAULT 'normal' CHECK(priority IN ('low', 'normal', 'high', 'urgent')),
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- Event schedule table
        CREATE TABLE IF NOT EXISTS schedule (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT,
            start_time DATETIME NOT NULL,
            end_time DATETIME,
            location TEXT,
            event_type TEXT DEFAULT 'general' CHECK(event_type IN ('general', 'workshop', 'break', 'judging', 'ceremony')),
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- Event settings table
        CREATE TABLE IF NOT EXISTS event_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
    `);

    // Migrations for existing SQLite database files (safe alter columns)
    const migrations = [
        `ALTER TABLE teams ADD COLUMN team_code TEXT;`,
        `ALTER TABLE teams ADD COLUMN password TEXT DEFAULT 'Syanp2K26';`,
        `ALTER TABLE teams ADD COLUMN checked_in_at DATETIME;`,
        `ALTER TABLE teams ADD COLUMN project_repo TEXT;`,
        `ALTER TABLE teams ADD COLUMN project_demo TEXT;`,
        `ALTER TABLE teams ADD COLUMN submission_notes TEXT;`,
        `ALTER TABLE teams ADD COLUMN submission_file_url TEXT;`,
        `ALTER TABLE problem_statements ADD COLUMN ps_number INTEGER;`,
        `ALTER TABLE problem_statements ADD COLUMN problem_faced TEXT;`,
        `ALTER TABLE problem_statements ADD COLUMN suggested_solution TEXT;`
    ];

    for (const sql of migrations) {
        try {
            db.exec(sql);
        } catch (e) {
            // Column already exists or table has constraint - safe to ignore
        }
    }

    // Backfill team_code for any existing teams
    const teamsWithoutCode = db.prepare("SELECT id FROM teams WHERE team_code IS NULL OR team_code = ''").all();
    const updateTeamCode = db.prepare('UPDATE teams SET team_code = ? WHERE id = ?');
    for (const t of teamsWithoutCode) {
        const code = 'SYN' + String(t.id).padStart(3, '0');
        updateTeamCode.run(code, t.id);
    }

    // Seed default admin
    const adminExists = db.prepare('SELECT COUNT(*) as count FROM admins').get();
    if (adminExists.count === 0) {
        const hashedPassword = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'synapse2026', 10);
        db.prepare('INSERT INTO admins (email, password, name) VALUES (?, ?, ?)').run(
            process.env.ADMIN_EMAIL || 'admin@synapse.com',
            hashedPassword,
            'Super Admin'
        );
    }

    // Seed default event settings
    const settingsExist = db.prepare('SELECT COUNT(*) as count FROM event_settings').get();
    if (settingsExist.count === 0) {
        const defaultSettings = [
            ['event_name', 'SYNAPSE'],
            ['event_tagline', '24-Hour National Level Hackathon'],
            ['event_date', '2026-11-15'],
            ['event_venue', 'V.S.B Engineering College, Karur'],
            ['event_department', 'Department of AI & Data Science'],
            ['registration_open', '1'],
            ['max_teams', '50'],
            ['event_description', 'SYNAPSE is a 24-hour national level hackathon organized by the Department of Artificial Intelligence & Data Science at V.S.B Engineering College, Karur. Push your limits, innovate, and build solutions that matter.'],
            ['contact_email', 'synapse@vsb.edu.in'],
            ['contact_phone', '+91 98765 43210'],
        ];
        const insertSetting = db.prepare('INSERT INTO event_settings (key, value) VALUES (?, ?)');
        for (const [key, value] of defaultSettings) {
            insertSetting.run(key, value);
        }
    }

    // Seed real Problem Statements from vsb_hackathon_ps.md (only on initial setup or if legacy mock statements exist)
    const mockCheck = db.prepare("SELECT COUNT(*) as count FROM problem_statements WHERE title = 'Smart Campus Navigation'").get();
    const psCount = db.prepare('SELECT COUNT(*) as count FROM problem_statements').get().count;

    if (mockCheck.count > 0 || psCount === 0) {
        console.log('🔄 Loading official VSB Hackathon problem statements from vsb_hackathon_ps.md...');
        const parsedPS = parseProblemStatementsFromMarkdown();

        if (parsedPS.length > 0) {
            // Nullify any team references to old mock statements first to satisfy foreign key constraints
            db.prepare(`
                UPDATE teams SET problem_statement_id = NULL 
                WHERE problem_statement_id IN (
                    SELECT id FROM problem_statements 
                    WHERE title IN ('Smart Campus Navigation', 'Student Mental Health Companion', 'Waste Management Optimizer', 'Rural Education Platform', 'Traffic Flow Predictor', 'Crop Disease Detection')
                )
            `).run();

            // Remove old mock statements
            db.prepare("DELETE FROM problem_statements WHERE title IN ('Smart Campus Navigation', 'Student Mental Health Companion', 'Waste Management Optimizer', 'Rural Education Platform', 'Traffic Flow Predictor', 'Crop Disease Detection')").run();

            const insertPS = db.prepare(`
                INSERT INTO problem_statements (ps_number, title, description, problem_faced, suggested_solution, category, difficulty, is_active)
                VALUES (?, ?, ?, ?, ?, ?, ?, 1)
            `);

            const existingTitles = new Set(db.prepare('SELECT title FROM problem_statements').all().map(p => p.title));

            for (const ps of parsedPS) {
                if (!existingTitles.has(ps.title)) {
                    insertPS.run(
                        ps.ps_number,
                        ps.title,
                        ps.description,
                        ps.problem_faced,
                        ps.suggested_solution,
                        ps.category,
                        ps.difficulty
                    );
                } else {
                    // Update existing with rich fields
                    db.prepare(`
                        UPDATE problem_statements 
                        SET ps_number = ?, description = ?, problem_faced = ?, suggested_solution = ?, category = ?, difficulty = ?
                        WHERE title = ?
                    `).run(
                        ps.ps_number,
                        ps.description,
                        ps.problem_faced,
                        ps.suggested_solution,
                        ps.category,
                        ps.difficulty,
                        ps.title
                    );
                }
            }
            console.log(`✅ Loaded ${parsedPS.length} official VSB problem statements!`);
        }
    }

    // Seed sample schedule
    const scheduleExist = db.prepare('SELECT COUNT(*) as count FROM schedule').get();
    if (scheduleExist.count === 0) {
        const sampleSchedule = [
            ['Registration & Check-in Desk', 'Teams arrive at VSB campus, complete badge collection & get assigned problem statement with countdown start', '2026-11-15 08:00', '2026-11-15 09:30', 'Main Auditorium', 'general'],
            ['Inaugural Ceremony', 'Opening ceremony by Department of AI & DS with chief guest address', '2026-11-15 09:30', '2026-11-15 10:00', 'Main Auditorium', 'ceremony'],
            ['Hacking Begins (24-Hour Clock Starts)', 'The 24-hour hackathon timer officially commences for all teams', '2026-11-15 10:00', '2026-11-16 10:00', 'AI & DS Innovation Labs', 'general'],
            ['Mentoring Round 1: Architecture Review', 'Industry mentors and faculty review project architecture and datasets', '2026-11-15 12:30', '2026-11-15 14:00', 'Hackathon Labs', 'workshop'],
            ['Networking Lunch Break', 'Lunch provided for all participants and mentors', '2026-11-15 14:00', '2026-11-15 15:00', 'Campus Cafeteria', 'break'],
            ['Mentoring Round 2: Tech Checkpoint', 'Midway evaluation of model accuracy, UI prototypes, and code repository', '2026-11-15 18:00', '2026-11-15 20:00', 'Hackathon Labs', 'workshop'],
            ['Dinner & Recharge', 'Dinner provided for all participants', '2026-11-15 20:30', '2026-11-15 21:30', 'Campus Cafeteria', 'break'],
            ['Midnight Hack & Energy Fuel', 'Midnight snacks, coffee and energy boosts for overnight hacking', '2026-11-16 00:00', '2026-11-16 01:00', 'Labs & Cafeteria', 'break'],
            ['Breakfast & Final Code Polish', 'Morning refreshments, testing edge cases and preparing presentation pitch', '2026-11-16 07:30', '2026-11-16 08:30', 'Cafeteria', 'break'],
            ['Code Freeze & Submission Deadline', 'All repositories and demo links submitted via the Team Dashboard', '2026-11-16 10:00', '2026-11-16 10:15', 'Team Portal', 'general'],
            ['Grand Jury Presentations & Demos', 'Teams present their working solutions to industry judges', '2026-11-16 10:30', '2026-11-16 13:30', 'Auditorium & Labs', 'judging'],
            ['Valedictory Ceremony & Prize Distribution', 'Announcement of cash prizes, trophies, certificates and closing ceremony', '2026-11-16 14:30', '2026-11-16 16:00', 'Main Auditorium', 'ceremony'],
        ];
        const insertSchedule = db.prepare('INSERT INTO schedule (title, description, start_time, end_time, location, event_type) VALUES (?, ?, ?, ?, ?, ?)');
        for (const s of sampleSchedule) {
            insertSchedule.run(...s);
        }
    }

    console.log('✅ Database initialized successfully');
    return db;
}

module.exports = { getDb, initializeDatabase };
