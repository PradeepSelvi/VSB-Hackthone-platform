const express = require('express');
const { getDb } = require('../db/database');

const router = express.Router();

// Get active problem statements (public)
router.get('/problem-statements', (req, res) => {
    try {
        const db = getDb();
        const ps = db.prepare('SELECT * FROM problem_statements WHERE is_active = 1 ORDER BY category, title').all();
        res.json(ps);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Get active announcements (public)
router.get('/announcements', (req, res) => {
    try {
        const db = getDb();
        const announcements = db.prepare('SELECT * FROM announcements WHERE is_active = 1 ORDER BY created_at DESC LIMIT 20').all();
        res.json(announcements);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Get event schedule (public)
router.get('/schedule', (req, res) => {
    try {
        const db = getDb();
        const schedule = db.prepare('SELECT * FROM schedule WHERE is_active = 1 ORDER BY start_time ASC').all();
        res.json(schedule);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Get event settings (public)
router.get('/settings', (req, res) => {
    try {
        const db = getDb();
        const settings = db.prepare('SELECT * FROM event_settings').all();
        const settingsObj = {};
        settings.forEach(s => { settingsObj[s.key] = s.value; });
        res.json(settingsObj);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Get registration stats (public - limited)
router.get('/stats', (req, res) => {
    try {
        const db = getDb();
        const totalTeams = db.prepare('SELECT COUNT(*) as count FROM teams').get().count;
        const totalParticipants = db.prepare('SELECT COUNT(*) as count FROM team_members').get().count;
        const totalPS = db.prepare('SELECT COUNT(*) as count FROM problem_statements WHERE is_active = 1').get().count;
        const settings = db.prepare('SELECT * FROM event_settings').all();
        const settingsObj = {};
        settings.forEach(s => { settingsObj[s.key] = s.value; });

        res.json({
            totalTeams,
            totalParticipants,
            totalProblemStatements: totalPS,
            maxTeams: parseInt(settingsObj.max_teams) || 50,
            registrationOpen: settingsObj.registration_open === '1'
        });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Register a team (public)
router.post('/register', (req, res) => {
    try {
        const db = getDb();

        // Check if registration is open
        const regOpen = db.prepare("SELECT value FROM event_settings WHERE key = 'registration_open'").get();
        if (!regOpen || regOpen.value !== '1') {
            return res.status(400).json({ error: 'Registration is currently closed.' });
        }

        // Check max teams
        const maxTeams = db.prepare("SELECT value FROM event_settings WHERE key = 'max_teams'").get();
        const currentTeams = db.prepare('SELECT COUNT(*) as count FROM teams').get().count;
        if (maxTeams && currentTeams >= parseInt(maxTeams.value)) {
            return res.status(400).json({ error: 'Maximum number of teams reached. Registration is full.' });
        }

        const { team_name, problem_statement_id, members } = req.body;

        if (!team_name || !members || !Array.isArray(members)) {
            return res.status(400).json({ error: 'Team name and members are required.' });
        }

        if (members.length < 2 || members.length > 4) {
            return res.status(400).json({ error: 'Team must have 2-4 members.' });
        }

        // Validate all members
        for (const m of members) {
            if (!m.name || !m.email || !m.phone || !m.year || !m.department || !m.college) {
                return res.status(400).json({ error: 'All member fields are required.' });
            }
        }

        // Check for duplicate emails
        const emails = members.map(m => m.email);
        const uniqueEmails = [...new Set(emails)];
        if (uniqueEmails.length !== emails.length) {
            return res.status(400).json({ error: 'Duplicate email addresses in team members.' });
        }

        // Check if any member email is already registered
        const checkEmail = db.prepare('SELECT COUNT(*) as count FROM team_members WHERE email = ?');
        for (const email of emails) {
            if (checkEmail.get(email).count > 0) {
                return res.status(400).json({ error: `Email ${email} is already registered with another team.` });
            }
        }

        // Check duplicate team name
        const checkTeamName = db.prepare('SELECT COUNT(*) as count FROM teams WHERE team_name = ?').get(team_name);
        if (checkTeamName.count > 0) {
            return res.status(400).json({ error: 'Team name already taken. Please choose a different name.' });
        }

        // Find the leader (first member is leader by default)
        const leader = members.find(m => m.is_leader) || members[0];

        // Insert team
        const insertTeam = db.prepare('INSERT INTO teams (team_name, team_lead_email, team_size, problem_statement_id) VALUES (?, ?, ?, ?)');
        const teamResult = insertTeam.run(team_name, leader.email, members.length, problem_statement_id || null);
        const teamId = teamResult.lastInsertRowid;

        // Insert members
        const insertMember = db.prepare('INSERT INTO team_members (team_id, name, email, phone, year, department, college, is_leader) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        for (const m of members) {
            insertMember.run(teamId, m.name, m.email, m.phone, m.year, m.department, m.college, m.email === leader.email ? 1 : 0);
        }

        res.status(201).json({
            message: 'Team registered successfully!',
            teamId: teamId,
            teamName: team_name
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error. Please try again.' });
    }
});

module.exports = router;
