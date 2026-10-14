const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { getDb } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');
const { isSupabaseConfigured, getSupabase, uploadToSupabaseStorage, listSupabaseFiles, deleteFromSupabaseStorage } = require('../db/supabase');

const router = express.Router();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }
});

// Helper to fairly shuffle and allocate problem statement to a team
function allocateShuffledProblemStatement(db, currentPsId) {
    const activeStatements = db.prepare(`
        SELECT ps.id, COUNT(t.id) as team_count
        FROM problem_statements ps
        LEFT JOIN teams t ON t.problem_statement_id = ps.id AND t.status = 'checked_in'
        WHERE ps.is_active = 1
        GROUP BY ps.id
        ORDER BY team_count ASC
    `).all();

    if (activeStatements.length === 0) return null;

    // Pick among least-allocated problem statements for fair distribution
    const minCount = activeStatements[0].team_count;
    let pool = activeStatements.filter(ps => ps.team_count === minCount);
    if (pool.length > 1 && currentPsId) {
        const filtered = pool.filter(ps => ps.id !== currentPsId);
        if (filtered.length > 0) pool = filtered;
    }
    const chosen = pool[Math.floor(Math.random() * pool.length)];
    return chosen ? chosen.id : activeStatements[0].id;
}

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
            { id: admin.id, email: admin.email, name: admin.name, role: 'admin' },
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
            SELECT ps.ps_number, ps.title, ps.category, COUNT(t.id) as team_count
            FROM problem_statements ps
            LEFT JOIN teams t ON t.problem_statement_id = ps.id AND t.status = 'checked_in'
            WHERE ps.is_active = 1
            GROUP BY ps.id
            ORDER BY team_count DESC, ps.ps_number ASC
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
            SELECT t.*, ps.ps_number, ps.title as problem_statement_title, ps.category as problem_statement_category
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
            conditions.push('(t.team_name LIKE ? OR t.team_lead_email LIKE ? OR t.team_code LIKE ?)');
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }
        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }
        query += ' ORDER BY t.registered_at DESC';

        const teams = db.prepare(query).all(...params);

        // Get members for each team
        const getMembers = db.prepare('SELECT * FROM team_members WHERE team_id = ? ORDER BY is_leader DESC, id ASC');
        const result = teams.map(team => ({
            ...team,
            members: getMembers.all(team.id)
        }));

        res.json(result);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Update team status (with automatic problem statement shuffle on check-in)
router.patch('/teams/:id/status', authenticateToken, (req, res) => {
    try {
        const { status } = req.body;
        if (!['registered', 'approved', 'rejected', 'checked_in'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }
        const db = getDb();
        const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(req.params.id);
        if (!team) return res.status(404).json({ error: 'Team not found' });

        let assignedPsId = team.problem_statement_id;
        let checkedInAt = team.checked_in_at;

        if (status === 'checked_in') {
            if (!checkedInAt) {
                checkedInAt = new Date().toISOString();
            }
            if (!assignedPsId) {
                assignedPsId = allocateShuffledProblemStatement(db, null);
            }
        } else {
            // Un-checking in resets checkin timestamp and deallocates the problem statement
            assignedPsId = null;
            checkedInAt = null;
        }

        db.prepare('UPDATE teams SET status = ?, problem_statement_id = ?, checked_in_at = ? WHERE id = ?')
            .run(status, assignedPsId, checkedInAt, req.params.id);

        res.json({
            message: 'Status updated successfully',
            status,
            problem_statement_id: assignedPsId,
            checked_in_at: checkedInAt
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Single-click Check-in for team (with shuffle & timestamp)
router.post('/teams/:id/checkin', authenticateToken, (req, res) => {
    try {
        const db = getDb();
        const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(req.params.id);
        if (!team) return res.status(404).json({ error: 'Team not found' });

        const checkedInAt = new Date().toISOString();
        let assignedPsId = team.problem_statement_id;

        if (!assignedPsId) {
            assignedPsId = allocateShuffledProblemStatement(db, null);
        }

        db.prepare("UPDATE teams SET status = 'checked_in', problem_statement_id = ?, checked_in_at = ? WHERE id = ?")
            .run(assignedPsId, checkedInAt, req.params.id);

        const assignedPS = assignedPsId ? db.prepare('SELECT * FROM problem_statements WHERE id = ?').get(assignedPsId) : null;

        res.json({
            message: `Team ${team.team_code} checked in successfully!`,
            status: 'checked_in',
            checked_in_at: checkedInAt,
            problem_statement: assignedPS
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error during check-in' });
    }
});

// Re-shuffle or assign problem statement to a team
router.post('/teams/:id/shuffle-ps', authenticateToken, (req, res) => {
    try {
        const db = getDb();
        const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(req.params.id);
        if (!team) return res.status(404).json({ error: 'Team not found' });

        const { problem_statement_id } = req.body;
        let newPsId;

        if (problem_statement_id) {
            newPsId = parseInt(problem_statement_id, 10);
            const exists = db.prepare('SELECT id FROM problem_statements WHERE id = ? AND is_active = 1').get(newPsId);
            if (!exists) {
                return res.status(400).json({ error: 'Selected problem statement is invalid or inactive.' });
            }
        } else {
            newPsId = allocateShuffledProblemStatement(db, team.problem_statement_id);
            if (!newPsId) {
                return res.status(400).json({ error: 'No active problem statements available to assign.' });
            }
        }

        db.prepare('UPDATE teams SET problem_statement_id = ? WHERE id = ?').run(newPsId, req.params.id);
        const assignedPS = db.prepare('SELECT * FROM problem_statements WHERE id = ?').get(newPsId);

        res.json({
            message: `Problem statement assigned to team ${team.team_code}!`,
            problem_statement: assignedPS
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error assigning problem statement' });
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
        const ps = db.prepare('SELECT * FROM problem_statements ORDER BY ps_number ASC, created_at DESC').all();
        res.json(ps);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/problem-statements', authenticateToken, (req, res) => {
    try {
        const { title, description, category, difficulty, problem_faced, suggested_solution } = req.body;
        if (!title || !description || !category) {
            return res.status(400).json({ error: 'Title, description, and category are required' });
        }
        const db = getDb();
        const maxNum = db.prepare('SELECT MAX(ps_number) as maxNum FROM problem_statements').get().maxNum || 0;
        const result = db.prepare(`
            INSERT INTO problem_statements (ps_number, title, description, problem_faced, suggested_solution, category, difficulty)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(maxNum + 1, title, description, problem_faced || '', suggested_solution || '', category, difficulty || 'medium');
        res.json({ id: result.lastInsertRowid, message: 'Problem statement created' });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

router.put('/problem-statements/:id', authenticateToken, (req, res) => {
    try {
        const { title, description, category, difficulty, problem_faced, suggested_solution, is_active } = req.body;
        const db = getDb();
        db.prepare(`
            UPDATE problem_statements 
            SET title = ?, description = ?, problem_faced = ?, suggested_solution = ?, category = ?, difficulty = ?, is_active = ? 
            WHERE id = ?
        `).run(title, description, problem_faced || '', suggested_solution || '', category, difficulty, is_active ? 1 : 0, req.params.id);
        res.json({ message: 'Problem statement updated' });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

router.delete('/problem-statements/:id', authenticateToken, (req, res) => {
    try {
        const db = getDb();
        // Nullify foreign keys in teams first
        db.prepare('UPDATE teams SET problem_statement_id = NULL WHERE problem_statement_id = ?').run(req.params.id);
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
            SELECT t.id, t.team_code, t.team_name, t.team_lead_email, t.team_size, t.status, 
                   t.registered_at, t.checked_in_at, t.project_repo, t.project_demo, t.submission_file_url,
                   ps.ps_number, ps.title as problem_statement, ps.category as ps_category
            FROM teams t
            LEFT JOIN problem_statements ps ON t.problem_statement_id = ps.id
            ORDER BY t.registered_at DESC
        `).all();

        const members = db.prepare(`
            SELECT tm.*, t.team_name, t.team_code
            FROM team_members tm
            JOIN teams t ON tm.team_id = t.id
            ORDER BY t.id, tm.is_leader DESC
        `).all();

        function csvEscape(val) {
            if (val === null || val === undefined) return '""';
            let str = String(val).replace(/[\r\n]+/g, ' ');
            // Prevent formula injection in spreadsheet software
            if (/^[=+\-@\t\r]/.test(str)) {
                str = "'" + str;
            }
            return `"${str.replace(/"/g, '""')}"`;
        }

        // CSV header
        let csv = 'Team ID,Team Name,Team Lead Email,Team Size,Status,Problem Statement Number,Problem Statement,Category,Registered At,Checked In At,Project Repo,Project Demo,Submission File URL,Member Name,Member Email,Member Phone,Member Year,Member Department,Member College,Is Leader\n';

        teams.forEach(team => {
            const teamMembers = members.filter(m => m.team_id === team.id);
            if (teamMembers.length === 0) {
                // Team with no members
                csv += [
                    csvEscape(team.team_code || ''),
                    csvEscape(team.team_name),
                    csvEscape(team.team_lead_email),
                    team.team_size || 0,
                    csvEscape(team.status),
                    csvEscape(team.ps_number || ''),
                    csvEscape(team.problem_statement || 'Pending Check-in'),
                    csvEscape(team.ps_category || ''),
                    csvEscape(team.registered_at || ''),
                    csvEscape(team.checked_in_at || ''),
                    csvEscape(team.project_repo || ''),
                    csvEscape(team.project_demo || ''),
                    csvEscape(team.submission_file_url || ''),
                    '""', '""', '""', '""', '""', '""', '""'
                ].join(',') + '\n';
            } else {
                teamMembers.forEach(m => {
                    csv += [
                        csvEscape(team.team_code || ''),
                        csvEscape(team.team_name),
                        csvEscape(team.team_lead_email),
                        team.team_size || 0,
                        csvEscape(team.status),
                        csvEscape(team.ps_number || ''),
                        csvEscape(team.problem_statement || 'Pending Check-in'),
                        csvEscape(team.ps_category || ''),
                        csvEscape(team.registered_at || ''),
                        csvEscape(team.checked_in_at || ''),
                        csvEscape(team.project_repo || ''),
                        csvEscape(team.project_demo || ''),
                        csvEscape(team.submission_file_url || ''),
                        csvEscape(m.name),
                        csvEscape(m.email),
                        csvEscape(m.phone),
                        csvEscape(m.year),
                        csvEscape(m.department),
                        csvEscape(m.college),
                        m.is_leader ? '"Yes"' : '"No"'
                    ].join(',') + '\n';
                });
            }
        });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=synapse_teams_export.csv');
        res.send(csv);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Admin File Upload to Supabase Storage (Materials, Schedule PDF, Guidelines)
router.post('/upload', authenticateToken, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded.' });
        }

        const originalName = req.file.originalname;
        const mimeType = req.file.mimetype || 'application/octet-stream';
        const buffer = req.file.buffer;
        let fileUrl = '';
        let storage = 'local';

        if (isSupabaseConfigured()) {
            try {
                const result = await uploadToSupabaseStorage(buffer, originalName, mimeType);
                if (result && result.publicUrl) {
                    fileUrl = result.publicUrl;
                    storage = 'supabase';
                }
            } catch (err) {
                console.warn('⚠️ Supabase admin upload fallback:', err.message);
            }
        }

        if (!fileUrl) {
            const uploadDir = path.join(__dirname, '..', 'public', 'uploads');
            if (!fs.existsSync(uploadDir)) {
                fs.mkdirSync(uploadDir, { recursive: true });
            }
            const safeName = `${Date.now()}_${originalName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
            fs.writeFileSync(path.join(uploadDir, safeName), buffer);
            fileUrl = `/uploads/${safeName}`;
            storage = 'local';
        }

        res.json({
            message: `File uploaded successfully (${storage})!`,
            fileUrl,
            fileName: originalName,
            storage
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error during upload.' });
    }
});

// Admin list Supabase storage files
router.get('/storage/files', authenticateToken, async (req, res) => {
    try {
        if (!isSupabaseConfigured()) {
            return res.json({ configured: false, files: [] });
        }
        const files = await listSupabaseFiles('submissions');
        res.json({ configured: true, files });
    } catch (err) {
        res.status(500).json({ error: 'Failed to list storage files' });
    }
});

module.exports = router;
