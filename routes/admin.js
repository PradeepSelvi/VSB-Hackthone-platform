const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Admin Login
router.post('/login', (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }

        const db = getDb();
        const admin = db.prepare('SELECT * FROM admins WHERE email = ?').get(email);

        if (!admin || !bcrypt.compareSync(password, admin.password)) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { id: admin.id, email: admin.email, name: admin.name },
            process.env.JWT_SECRET || 'synapse_hackathon_2026_vsb_secret_key',
            { expiresIn: '24h' }
        );

        res.json({ token, admin: { id: admin.id, email: admin.email, name: admin.name } });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Get Dashboard Stats
router.get('/stats', authenticateToken, (req, res) => {
    try {
        const db = getDb();
        const totalTeams = db.prepare('SELECT COUNT(*) as count FROM teams').get().count;
        const approvedTeams = db.prepare("SELECT COUNT(*) as count FROM teams WHERE status = 'approved'").get().count;
        const pendingTeams = db.prepare("SELECT COUNT(*) as count FROM teams WHERE status = 'registered'").get().count;
        const rejectedTeams = db.prepare("SELECT COUNT(*) as count FROM teams WHERE status = 'rejected'").get().count;
        const checkedInTeams = db.prepare("SELECT COUNT(*) as count FROM teams WHERE status = 'checked_in'").get().count;
        const totalParticipants = db.prepare('SELECT COUNT(*) as count FROM team_members').get().count;
        const totalProblemStatements = db.prepare('SELECT COUNT(*) as count FROM problem_statements WHERE is_active = 1').get().count;

        // Department-wise stats
        const deptStats = db.prepare(`
            SELECT department, COUNT(*) as count 
            FROM team_members 
            GROUP BY department 
            ORDER BY count DESC
        `).all();

        // College-wise stats
        const collegeStats = db.prepare(`
            SELECT college, COUNT(DISTINCT tm.team_id) as teams, COUNT(*) as members
            FROM team_members tm
            GROUP BY college
            ORDER BY teams DESC
        `).all();

        // Year-wise stats
        const yearStats = db.prepare(`
            SELECT year, COUNT(*) as count 
            FROM team_members 
            GROUP BY year 
            ORDER BY year
        `).all();

        // Problem statement selection stats
        const psStats = db.prepare(`
            SELECT ps.title, ps.category, COUNT(t.id) as team_count
            FROM problem_statements ps
            LEFT JOIN teams t ON t.problem_statement_id = ps.id
            WHERE ps.is_active = 1
            GROUP BY ps.id
            ORDER BY team_count DESC
        `).all();

        // Registration timeline (last 30 days)
        const timeline = db.prepare(`
            SELECT DATE(registered_at) as date, COUNT(*) as count
            FROM teams
            WHERE registered_at >= DATE('now', '-30 days')
            GROUP BY DATE(registered_at)
            ORDER BY date
        `).all();

        // Team status breakdown
        const statusBreakdown = db.prepare(`
            SELECT status, COUNT(*) as count
            FROM teams
            GROUP BY status
        `).all();

        res.json({
            totalTeams,
            approvedTeams,
            pendingTeams,
            rejectedTeams,
            checkedInTeams,
            totalParticipants,
            totalProblemStatements,
            deptStats,
            collegeStats,
            yearStats,
            psStats,
            timeline,
            statusBreakdown
        });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Get all teams
router.get('/teams', authenticateToken, (req, res) => {
    try {
        const db = getDb();
        const { status, search } = req.query;

        let query = `
            SELECT t.*, ps.title as problem_statement_title
            FROM teams t
            LEFT JOIN problem_statements ps ON t.problem_statement_id = ps.id
        `;
        const conditions = [];
        const params = [];

        if (status && status !== 'all') {
            conditions.push('t.status = ?');
            params.push(status);
        }
        if (search) {
            conditions.push('(t.team_name LIKE ? OR t.team_lead_email LIKE ?)');
            params.push(`%${search}%`, `%${search}%`);
        }
        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }
        query += ' ORDER BY t.registered_at DESC';

        const teams = db.prepare(query).all(...params);

        // Get members for each team
        const getMembers = db.prepare('SELECT * FROM team_members WHERE team_id = ?');
        const result = teams.map(team => ({
            ...team,
            members: getMembers.all(team.id)
        }));

        res.json(result);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Update team status
router.patch('/teams/:id/status', authenticateToken, (req, res) => {
    try {
        const { status } = req.body;
        if (!['registered', 'approved', 'rejected', 'checked_in'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }
        const db = getDb();
        db.prepare('UPDATE teams SET status = ? WHERE id = ?').run(status, req.params.id);
        res.json({ message: 'Status updated' });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Delete team
router.delete('/teams/:id', authenticateToken, (req, res) => {
    try {
        const db = getDb();
        db.prepare('DELETE FROM teams WHERE id = ?').run(req.params.id);
        res.json({ message: 'Team deleted' });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Problem Statements CRUD
router.get('/problem-statements', authenticateToken, (req, res) => {
    try {
        const db = getDb();
        const ps = db.prepare('SELECT * FROM problem_statements ORDER BY created_at DESC').all();
        res.json(ps);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/problem-statements', authenticateToken, (req, res) => {
    try {
        const { title, description, category, difficulty } = req.body;
        if (!title || !description || !category) {
            return res.status(400).json({ error: 'Title, description, and category are required' });
        }
        const db = getDb();
        const result = db.prepare('INSERT INTO problem_statements (title, description, category, difficulty) VALUES (?, ?, ?, ?)').run(title, description, category, difficulty || 'medium');
        res.json({ id: result.lastInsertRowid, message: 'Problem statement created' });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

router.put('/problem-statements/:id', authenticateToken, (req, res) => {
    try {
        const { title, description, category, difficulty, is_active } = req.body;
        const db = getDb();
        db.prepare('UPDATE problem_statements SET title = ?, description = ?, category = ?, difficulty = ?, is_active = ? WHERE id = ?').run(title, description, category, difficulty, is_active ? 1 : 0, req.params.id);
        res.json({ message: 'Problem statement updated' });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

router.delete('/problem-statements/:id', authenticateToken, (req, res) => {
    try {
        const db = getDb();
        db.prepare('DELETE FROM problem_statements WHERE id = ?').run(req.params.id);
        res.json({ message: 'Problem statement deleted' });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Announcements CRUD
router.get('/announcements', authenticateToken, (req, res) => {
    try {
        const db = getDb();
        const announcements = db.prepare('SELECT * FROM announcements ORDER BY created_at DESC').all();
        res.json(announcements);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/announcements', authenticateToken, (req, res) => {
    try {
        const { title, message, priority } = req.body;
        if (!title || !message) {
            return res.status(400).json({ error: 'Title and message are required' });
        }
        const db = getDb();
        const result = db.prepare('INSERT INTO announcements (title, message, priority) VALUES (?, ?, ?)').run(title, message, priority || 'normal');
        res.json({ id: result.lastInsertRowid, message: 'Announcement created' });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

router.put('/announcements/:id', authenticateToken, (req, res) => {
    try {
        const { title, message, priority, is_active } = req.body;
        const db = getDb();
        db.prepare('UPDATE announcements SET title = ?, message = ?, priority = ?, is_active = ? WHERE id = ?').run(title, message, priority, is_active ? 1 : 0, req.params.id);
        res.json({ message: 'Announcement updated' });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

router.delete('/announcements/:id', authenticateToken, (req, res) => {
    try {
        const db = getDb();
        db.prepare('DELETE FROM announcements WHERE id = ?').run(req.params.id);
        res.json({ message: 'Announcement deleted' });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Schedule CRUD
router.get('/schedule', authenticateToken, (req, res) => {
    try {
        const db = getDb();
        const schedule = db.prepare('SELECT * FROM schedule ORDER BY start_time ASC').all();
        res.json(schedule);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/schedule', authenticateToken, (req, res) => {
    try {
        const { title, description, start_time, end_time, location, event_type } = req.body;
        if (!title || !start_time) {
            return res.status(400).json({ error: 'Title and start time are required' });
        }
        const db = getDb();
        const result = db.prepare('INSERT INTO schedule (title, description, start_time, end_time, location, event_type) VALUES (?, ?, ?, ?, ?, ?)').run(title, description || '', start_time, end_time || null, location || '', event_type || 'general');
        res.json({ id: result.lastInsertRowid, message: 'Schedule event created' });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

router.put('/schedule/:id', authenticateToken, (req, res) => {
    try {
        const { title, description, start_time, end_time, location, event_type, is_active } = req.body;
        const db = getDb();
        db.prepare('UPDATE schedule SET title = ?, description = ?, start_time = ?, end_time = ?, location = ?, event_type = ?, is_active = ? WHERE id = ?').run(title, description, start_time, end_time, location, event_type, is_active ? 1 : 0, req.params.id);
        res.json({ message: 'Schedule updated' });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

router.delete('/schedule/:id', authenticateToken, (req, res) => {
    try {
        const db = getDb();
        db.prepare('DELETE FROM schedule WHERE id = ?').run(req.params.id);
        res.json({ message: 'Schedule event deleted' });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Event Settings
router.get('/settings', authenticateToken, (req, res) => {
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

router.put('/settings', authenticateToken, (req, res) => {
    try {
        const db = getDb();
        const upsert = db.prepare('INSERT INTO event_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?');
        const updateMany = db.transaction((settings) => {
            for (const [key, value] of Object.entries(settings)) {
                upsert.run(key, value, value);
            }
        });
        updateMany(req.body);
        res.json({ message: 'Settings updated' });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Export teams as CSV
router.get('/export/teams', authenticateToken, (req, res) => {
    try {
        const db = getDb();
        const teams = db.prepare(`
            SELECT t.id, t.team_name, t.team_lead_email, t.team_size, t.status, t.registered_at,
                   ps.title as problem_statement
            FROM teams t
            LEFT JOIN problem_statements ps ON t.problem_statement_id = ps.id
            ORDER BY t.registered_at DESC
        `).all();

        const members = db.prepare(`
            SELECT tm.*, t.team_name
            FROM team_members tm
            JOIN teams t ON tm.team_id = t.id
            ORDER BY t.id, tm.is_leader DESC
        `).all();

        // CSV header
        let csv = 'Team Name,Team Lead Email,Team Size,Status,Problem Statement,Registered At,Member Name,Member Email,Member Phone,Member Year,Member Department,Member College,Is Leader\n';

        members.forEach(m => {
            const team = teams.find(t => t.id === m.team_id);
            csv += `"${team.team_name}","${team.team_lead_email}",${team.team_size},"${team.status}","${team.problem_statement || 'Not Selected'}","${team.registered_at}","${m.name}","${m.email}","${m.phone}","${m.year}","${m.department}","${m.college}",${m.is_leader}\n`;
        });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=synapse_teams_export.csv');
        res.send(csv);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
