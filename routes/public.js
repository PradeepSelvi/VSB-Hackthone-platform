const express = require('express');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { getDb } = require('../db/database');
const { authenticateTeamToken } = require('../middleware/auth');
const { isSupabaseConfigured, getSupabase, uploadToSupabaseStorage } = require('../db/supabase');

const router = express.Router();

// Multer upload config (50MB memory storage for cloud/local pipe)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }
});

// Get active problem statements (public)
router.get('/problem-statements', (req, res) => {
    try {
        const db = getDb();
        const ps = db.prepare('SELECT * FROM problem_statements WHERE is_active = 1 ORDER BY ps_number ASC, category, title').all();
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
router.post('/register', async (req, res) => {
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

        // Check for duplicate emails within team
        const emails = members.map(m => m.email.trim().toLowerCase());
        const uniqueEmails = [...new Set(emails)];
        if (uniqueEmails.length !== emails.length) {
            return res.status(400).json({ error: 'Duplicate email addresses in team members.' });
        }

        // Check if any member email is already registered in DB
        const checkEmail = db.prepare('SELECT COUNT(*) as count FROM team_members WHERE LOWER(email) = ?');
        for (const email of emails) {
            if (checkEmail.get(email).count > 0) {
                return res.status(400).json({ error: `Email ${email} is already registered with another team.` });
            }
        }

        // Check duplicate team name
        const checkTeamName = db.prepare('SELECT COUNT(*) as count FROM teams WHERE LOWER(team_name) = ?').get(team_name.trim().toLowerCase());
        if (checkTeamName.count > 0) {
            return res.status(400).json({ error: 'Team name already taken. Please choose a different name.' });
        }

        // Generate sequential Team Code like SYN001, SYN002, etc.
        const maxIdRow = db.prepare('SELECT MAX(id) as maxId FROM teams').get();
        const nextNum = (maxIdRow && maxIdRow.maxId ? maxIdRow.maxId : 0) + 1;
        const teamCode = 'SYN' + String(nextNum).padStart(3, '0');
        const defaultPassword = 'Syanp2K26';

        // Find the leader (first member is leader by default)
        const leader = members.find(m => m.is_leader) || members[0];

        // Insert team with team_code and default password
        const insertTeam = db.prepare(`
            INSERT INTO teams (team_code, team_name, team_lead_email, team_size, password, problem_statement_id, status)
            VALUES (?, ?, ?, ?, ?, ?, 'registered')
        `);
        const teamResult = insertTeam.run(
            teamCode,
            team_name.trim(),
            leader.email.trim(),
            members.length,
            defaultPassword,
            problem_statement_id || null
        );
        const teamId = teamResult.lastInsertRowid;

        // Insert members
        const insertMember = db.prepare(`
            INSERT INTO team_members (team_id, name, email, phone, year, department, college, is_leader)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const m of members) {
            insertMember.run(
                teamId,
                m.name.trim(),
                m.email.trim(),
                m.phone.trim(),
                m.year.trim(),
                m.department.trim(),
                m.college.trim(),
                m.email.trim().toLowerCase() === leader.email.trim().toLowerCase() ? 1 : 0
            );
        }

        // Sync with Supabase if configured
        if (isSupabaseConfigured()) {
            try {
                const supabase = getSupabase();
                if (supabase) {
                    const { data: supaTeam, error: teamErr } = await supabase.from('teams').insert({
                        team_code: teamCode,
                        team_name: team_name.trim(),
                        team_lead_email: leader.email.trim(),
                        team_size: members.length,
                        password: defaultPassword,
                        problem_statement_id: problem_statement_id || null,
                        status: 'registered'
                    }).select().single();

                    if (!teamErr && supaTeam && supaTeam.id) {
                        const supaMembers = members.map(m => ({
                            team_id: supaTeam.id,
                            name: m.name.trim(),
                            email: m.email.trim(),
                            phone: m.phone.trim(),
                            year: m.year.trim(),
                            department: m.department.trim(),
                            college: m.college.trim(),
                            is_leader: m.email.trim().toLowerCase() === leader.email.trim().toLowerCase() ? 1 : 0
                        }));
                        await supabase.from('team_members').insert(supaMembers);
                    }
                }
            } catch (supaErr) {
                console.warn('⚠️ Supabase registration sync skipped/error:', supaErr.message);
            }
        }

        res.status(201).json({
            message: 'Team registered successfully!',
            teamId: teamId,
            teamCode: teamCode,
            teamName: team_name.trim(),
            defaultPassword: defaultPassword
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error during registration. Please try again.' });
    }
});

// ====== Team Leader Login ======
router.post('/team/login', (req, res) => {
    try {
        const { team_code, password } = req.body;
        if (!team_code || !password) {
            return res.status(400).json({ error: 'Team ID (e.g., SYN001) and password are required.' });
        }

        const db = getDb();
        const codeClean = team_code.trim().toUpperCase();
        const team = db.prepare('SELECT * FROM teams WHERE UPPER(team_code) = ?').get(codeClean);

        if (!team) {
            return res.status(401).json({ error: 'Team ID not found. Please verify your SYN ID.' });
        }

        // Validate password (common password "Syanp2K26", with case flexibility)
        const validPassword = team.password || 'Syanp2K26';
        if (password !== validPassword && password.toLowerCase() !== validPassword.toLowerCase()) {
            return res.status(401).json({ error: 'Invalid password. Common team password is Syanp2K26.' });
        }

        const token = jwt.sign(
            { teamId: team.id, teamCode: team.team_code, teamName: team.team_name, role: 'team' },
            process.env.JWT_SECRET || 'synapse_hackathon_2026_vsb_secret_key',
            { expiresIn: '48h' }
        );

        res.json({
            token,
            team: {
                id: team.id,
                team_code: team.team_code,
                team_name: team.team_name,
                status: team.status
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error during team login.' });
    }
});

// ====== Team Leader Dashboard Data ======
router.get('/team/dashboard', authenticateTeamToken, (req, res) => {
    try {
        const db = getDb();
        const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(req.team.teamId);

        if (!team) {
            return res.status(404).json({ error: 'Team not found.' });
        }

        const members = db.prepare('SELECT * FROM team_members WHERE team_id = ? ORDER BY is_leader DESC, id ASC').all(team.id);

        let problemStatement = null;
        // The problem statement is unlocked ONLY AFTER check-in by admin!
        if (team.status === 'checked_in') {
            if (!team.problem_statement_id) {
                // Fair shuffled allocation if missing for checked-in team
                const activePS = db.prepare(`
                    SELECT ps.id, COUNT(t.id) as team_count
                    FROM problem_statements ps
                    LEFT JOIN teams t ON t.problem_statement_id = ps.id
                    WHERE ps.is_active = 1
                    GROUP BY ps.id
                    ORDER BY team_count ASC
                `).all();

                if (activePS.length > 0) {
                    const minCount = activePS[0].team_count;
                    const pool = activePS.filter(p => p.team_count === minCount);
                    const chosen = pool[Math.floor(Math.random() * pool.length)] || activePS[0];
                    const checkinTime = team.checked_in_at || new Date().toISOString();
                    db.prepare("UPDATE teams SET problem_statement_id = ?, checked_in_at = ? WHERE id = ?")
                        .run(chosen.id, checkinTime, team.id);
                    team.problem_statement_id = chosen.id;
                    team.checked_in_at = checkinTime;
                }
            }

            if (team.problem_statement_id) {
                problemStatement = db.prepare('SELECT * FROM problem_statements WHERE id = ?').get(team.problem_statement_id);
            }
        }

        const announcements = db.prepare('SELECT * FROM announcements WHERE is_active = 1 ORDER BY created_at DESC LIMIT 10').all();
        const schedule = db.prepare('SELECT * FROM schedule WHERE is_active = 1 ORDER BY start_time ASC').all();
        const settingsRows = db.prepare('SELECT * FROM event_settings').all();
        const settings = {};
        settingsRows.forEach(s => { settings[s.key] = s.value; });

        const totalTeams = db.prepare('SELECT COUNT(*) as count FROM teams').get().count;
        const checkedInTeams = db.prepare("SELECT COUNT(*) as count FROM teams WHERE status = 'checked_in'").get().count;

        res.json({
            team: {
                id: team.id,
                team_code: team.team_code,
                team_name: team.team_name,
                team_lead_email: team.team_lead_email,
                team_size: team.team_size,
                status: team.status,
                registered_at: team.registered_at,
                checked_in_at: team.checked_in_at,
                project_repo: team.project_repo,
                project_demo: team.project_demo,
                submission_notes: team.submission_notes,
                submission_file_url: team.submission_file_url
            },
            members,
            problem_statement: problemStatement,
            isCheckedIn: team.status === 'checked_in',
            announcements,
            schedule,
            settings,
            event_stats: {
                totalTeams,
                checkedInTeams
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error loading team dashboard.' });
    }
});

// ====== Team File Upload (Supabase Storage with local fallback) ======
router.post('/team/upload', authenticateTeamToken, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file received. Please choose a file (PDF, PPT, ZIP, max 50MB).' });
        }

        const originalName = req.file.originalname;
        const mimeType = req.file.mimetype || 'application/octet-stream';
        const buffer = req.file.buffer;
        let fileUrl = '';
        let storageProvider = 'local';

        // 1. Try uploading to Supabase Storage if configured
        if (isSupabaseConfigured()) {
            try {
                const uploadResult = await uploadToSupabaseStorage(buffer, originalName, mimeType);
                if (uploadResult && uploadResult.publicUrl) {
                    fileUrl = uploadResult.publicUrl;
                    storageProvider = 'supabase';
                }
            } catch (supaErr) {
                console.error('⚠️ Supabase storage upload failed, falling back to local storage:', supaErr.message);
            }
        }

        // 2. Local fallback if Supabase not configured or encountered error
        if (!fileUrl) {
            const uploadDir = path.join(__dirname, '..', 'public', 'uploads');
            if (!fs.existsSync(uploadDir)) {
                fs.mkdirSync(uploadDir, { recursive: true });
            }
            const safeName = `${Date.now()}_${originalName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
            const targetPath = path.join(uploadDir, safeName);
            fs.writeFileSync(targetPath, buffer);
            fileUrl = `/uploads/${safeName}`;
            storageProvider = 'local';
        }

        // Update database for the team
        const db = getDb();
        db.prepare('UPDATE teams SET submission_file_url = ? WHERE id = ?').run(fileUrl, req.team.teamId);

        // Sync to Supabase DB if configured
        if (isSupabaseConfigured()) {
            try {
                const supabase = getSupabase();
                if (supabase) {
                    await supabase.from('teams').update({ submission_file_url: fileUrl }).eq('id', req.team.teamId);
                }
            } catch (supaSyncErr) {
                console.warn('⚠️ Supabase DB update failed for upload:', supaSyncErr.message);
            }
        }

        res.json({
            message: `File successfully uploaded to ${storageProvider === 'supabase' ? 'Supabase Storage' : 'local storage'}!`,
            fileUrl,
            fileName: originalName,
            storage: storageProvider
        });
    } catch (err) {
        console.error('Upload Error:', err);
        res.status(500).json({ error: 'Failed to process file upload: ' + (err.message || 'Unknown error') });
    }
});

// ====== Team Project Submission ======
router.post('/team/submit', authenticateTeamToken, async (req, res) => {
    try {
        const { project_repo, project_demo, submission_notes, submission_file_url } = req.body;
        const db = getDb();

        db.prepare(`
            UPDATE teams 
            SET project_repo = ?, project_demo = ?, submission_notes = ?, submission_file_url = COALESCE(?, submission_file_url)
            WHERE id = ?
        `).run(project_repo || null, project_demo || null, submission_notes || null, submission_file_url || null, req.team.teamId);

        // Sync with Supabase if configured
        if (isSupabaseConfigured()) {
            try {
                const supabase = getSupabase();
                if (supabase) {
                    const updatePayload = {
                        project_repo: project_repo || null,
                        project_demo: project_demo || null,
                        submission_notes: submission_notes || null
                    };
                    if (submission_file_url) {
                        updatePayload.submission_file_url = submission_file_url;
                    }
                    await supabase.from('teams').update(updatePayload).eq('id', req.team.teamId);
                }
            } catch (supaErr) {
                console.warn('⚠️ Supabase submit sync error:', supaErr.message);
            }
        }

        res.json({ message: 'Project submission updated successfully!' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error saving submission.' });
    }
});

// ====== Storage Status (Supabase status check) ======
router.get('/storage/status', (req, res) => {
    res.json({
        supabaseConfigured: isSupabaseConfigured(),
        storageBucket: process.env.SUPABASE_STORAGE_BUCKET || 'hackathon-files',
        maxUploadSizeMB: 50
    });
});

module.exports = router;
