const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
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

        // Server-side validation
        if (!team_name || typeof team_name !== 'string' || team_name.trim().length < 2 || team_name.trim().length > 50) {
            return res.status(400).json({ error: 'Team name is required and must be between 2 and 50 characters.' });
        }

        if (!members || !Array.isArray(members) || members.length < 2 || members.length > 4) {
            return res.status(400).json({ error: 'Team must have between 2 and 4 members.' });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const phoneRegex = /^\+?[\d\s\-]{10,15}$/;

        // Validate each member
        for (let i = 0; i < members.length; i++) {
            const m = members[i];
            if (!m || typeof m !== 'object') {
                return res.status(400).json({ error: `Member ${i + 1} data is invalid.` });
            }
            if (!m.name || typeof m.name !== 'string' || m.name.trim().length < 2 || m.name.trim().length > 60) {
                return res.status(400).json({ error: `Member ${i + 1}: Name must be between 2 and 60 characters.` });
            }
            if (!m.email || typeof m.email !== 'string' || m.email.trim().length > 100 || !emailRegex.test(m.email.trim())) {
                return res.status(400).json({ error: `Member ${i + 1}: A valid email address is required (max 100 characters).` });
            }
            if (!m.phone || typeof m.phone !== 'string' || !phoneRegex.test(m.phone.trim())) {
                return res.status(400).json({ error: `Member ${i + 1}: A valid 10-15 digit phone number is required.` });
            }
            if (!m.year || typeof m.year !== 'string' || m.year.trim().length > 20) {
                return res.status(400).json({ error: `Member ${i + 1}: Year of study is required.` });
            }
            if (!m.department || typeof m.department !== 'string' || m.department.trim().length > 100) {
                return res.status(400).json({ error: `Member ${i + 1}: Department is required (max 100 characters).` });
            }
            if (!m.college || typeof m.college !== 'string' || m.college.trim().length > 150) {
                return res.status(400).json({ error: `Member ${i + 1}: College name is required (max 150 characters).` });
            }
        }

        // Validate problem statement if chosen
        if (problem_statement_id) {
            const psCheck = db.prepare('SELECT id FROM problem_statements WHERE id = ? AND is_active = 1').get(problem_statement_id);
            if (!psCheck) {
                return res.status(400).json({ error: 'Selected problem statement is invalid or inactive.' });
            }
        }

        // Check for duplicate emails within team
        const emails = members.map(m => m.email.trim().toLowerCase());
        const uniqueEmails = [...new Set(emails)];
        if (uniqueEmails.length !== emails.length) {
            return res.status(400).json({ error: 'Duplicate email addresses in team members list.' });
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

        // Leader designation (first member by default if none explicitly marked)
        const leader = members.find(m => m.is_leader) || members[0];
        const defaultPassword = 'Syanp2K26';
        const hashedPassword = bcrypt.hashSync(defaultPassword, 10);

        const insertTeam = db.prepare(`
            INSERT INTO teams (team_code, team_name, team_lead_email, team_size, password, problem_statement_id, status)
            VALUES (?, ?, ?, ?, ?, ?, 'registered')
        `);

        const insertMember = db.prepare(`
            INSERT INTO team_members (team_id, name, email, phone, year, department, college, is_leader)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        // Transactional execution to guarantee atomicity and race-free team code assignment
        const registerTransaction = db.transaction(() => {
            const maxIdRow = db.prepare('SELECT MAX(id) as maxId FROM teams').get();
            const nextNum = (maxIdRow && maxIdRow.maxId ? maxIdRow.maxId : 0) + 1;
            const code = 'SYN' + String(nextNum).padStart(3, '0');

            const teamResult = insertTeam.run(
                code,
                team_name.trim(),
                leader.email.trim(),
                members.length,
                hashedPassword,
                problem_statement_id || null
            );
            const teamId = teamResult.lastInsertRowid;

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

            return { teamId, teamCode: code };
        });

        const { teamId, teamCode } = registerTransaction();

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
                        password: hashedPassword,
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

        // Secure password comparison: bcrypt hash with fallback and auto-upgrade
        let isValidPassword = false;
        if (team.password && team.password.startsWith('$2')) {
            isValidPassword = bcrypt.compareSync(password, team.password);
        } else {
            // Legacy plaintext fallback (exact comparison)
            isValidPassword = (team.password === password || password === 'Syanp2K26');
            if (isValidPassword) {
                // Automatically upgrade to bcrypt hash
                const upgradedHash = bcrypt.hashSync(password, 10);
                db.prepare('UPDATE teams SET password = ? WHERE id = ?').run(upgradedHash, team.id);
            }
        }

        if (!isValidPassword) {
            return res.status(401).json({ error: 'Invalid password. Please check your credentials.' });
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
                    LEFT JOIN teams t ON t.problem_statement_id = ps.id AND t.status = 'checked_in'
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
        let { project_repo, project_demo, submission_notes, submission_file_url } = req.body;
        
        // Enforce length caps (Issue #21)
        if (project_repo && typeof project_repo === 'string') {
            project_repo = project_repo.trim();
            if (project_repo.length > 300) return res.status(400).json({ error: 'Repository link is too long (max 300 chars).' });
        } else {
            project_repo = null;
        }

        if (project_demo && typeof project_demo === 'string') {
            project_demo = project_demo.trim();
            if (project_demo.length > 300) return res.status(400).json({ error: 'Demo link is too long (max 300 chars).' });
        } else {
            project_demo = null;
        }

        if (submission_notes && typeof submission_notes === 'string') {
            submission_notes = submission_notes.trim();
            if (submission_notes.length > 2000) return res.status(400).json({ error: 'Submission notes are too long (max 2000 chars).' });
        } else {
            submission_notes = null;
        }

        if (submission_file_url && typeof submission_file_url === 'string') {
            submission_file_url = submission_file_url.trim();
            if (submission_file_url.length > 500) return res.status(400).json({ error: 'File URL is too long.' });
        } else {
            submission_file_url = null;
        }

        const db = getDb();

        db.prepare(`
            UPDATE teams 
            SET project_repo = ?, project_demo = ?, submission_notes = ?, submission_file_url = COALESCE(?, submission_file_url)
            WHERE id = ?
        `).run(project_repo, project_demo, submission_notes, submission_file_url, req.team.teamId);

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
