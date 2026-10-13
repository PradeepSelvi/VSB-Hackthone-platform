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
    }
    return db;
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

        -- Teams table
        CREATE TABLE IF NOT EXISTS teams (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            team_name TEXT NOT NULL,
            team_lead_email TEXT NOT NULL,
            team_size INTEGER NOT NULL CHECK(team_size >= 2 AND team_size <= 4),
            problem_statement_id INTEGER,
            status TEXT DEFAULT 'registered' CHECK(status IN ('registered', 'approved', 'rejected', 'checked_in')),
            registered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
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

        -- Problem statements table
        CREATE TABLE IF NOT EXISTS problem_statements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            category TEXT NOT NULL,
            difficulty TEXT DEFAULT 'medium' CHECK(difficulty IN ('easy', 'medium', 'hard')),
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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

    // Seed sample problem statements
    const psExist = db.prepare('SELECT COUNT(*) as count FROM problem_statements').get();
    if (psExist.count === 0) {
        const samplePS = [
            ['Smart Campus Navigation', 'Build an AI-powered campus navigation system that helps students and visitors find classrooms, labs, and facilities using indoor positioning.', 'AI/ML', 'medium'],
            ['Student Mental Health Companion', 'Create a conversational AI chatbot that provides mental health support, stress management tips, and connects students with counselors.', 'Healthcare', 'hard'],
            ['Waste Management Optimizer', 'Develop a smart waste management system using IoT data to optimize collection routes and promote recycling in urban areas.', 'Sustainability', 'medium'],
            ['Rural Education Platform', 'Design an offline-first educational platform that delivers quality learning content to students in areas with limited internet connectivity.', 'Education', 'easy'],
            ['Traffic Flow Predictor', 'Build a real-time traffic prediction system using historical data and live feeds to suggest optimal routes and reduce congestion.', 'Smart City', 'hard'],
            ['Crop Disease Detection', 'Develop a mobile application that uses computer vision to identify crop diseases from leaf images and suggest treatments.', 'Agriculture', 'medium'],
        ];
        const insertPS = db.prepare('INSERT INTO problem_statements (title, description, category, difficulty) VALUES (?, ?, ?, ?)');
        for (const ps of samplePS) {
            insertPS.run(...ps);
        }
    }

    // Seed sample schedule
    const scheduleExist = db.prepare('SELECT COUNT(*) as count FROM schedule').get();
    if (scheduleExist.count === 0) {
        const sampleSchedule = [
            ['Registration & Check-in', 'Teams arrive and complete registration', '2026-11-15 08:00', '2026-11-15 09:00', 'Main Auditorium', 'general'],
            ['Inaugural Ceremony', 'Opening ceremony with chief guest address', '2026-11-15 09:00', '2026-11-15 10:00', 'Main Auditorium', 'ceremony'],
            ['Hacking Begins!', 'The 24-hour hackathon officially starts', '2026-11-15 10:00', '2026-11-16 10:00', 'Innovation Lab', 'general'],
            ['Mentoring Session 1', 'Industry mentors available for guidance', '2026-11-15 12:00', '2026-11-15 13:00', 'Seminar Hall', 'workshop'],
            ['Lunch Break', 'Lunch provided for all participants', '2026-11-15 13:00', '2026-11-15 14:00', 'Cafeteria', 'break'],
            ['Mentoring Session 2', 'Technical mentoring and code reviews', '2026-11-15 17:00', '2026-11-15 18:00', 'Seminar Hall', 'workshop'],
            ['Dinner Break', 'Dinner provided for all participants', '2026-11-15 20:00', '2026-11-15 21:00', 'Cafeteria', 'break'],
            ['Midnight Snacks', 'Energy boost for late-night hackers', '2026-11-16 00:00', '2026-11-16 00:30', 'Cafeteria', 'break'],
            ['Submission Deadline', 'All projects must be submitted', '2026-11-16 10:00', '2026-11-16 10:30', 'Innovation Lab', 'general'],
            ['Project Presentations', 'Teams present their solutions to judges', '2026-11-16 10:30', '2026-11-16 13:00', 'Main Auditorium', 'judging'],
            ['Valedictory & Prize Distribution', 'Closing ceremony and winner announcements', '2026-11-16 14:00', '2026-11-16 15:30', 'Main Auditorium', 'ceremony'],
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
