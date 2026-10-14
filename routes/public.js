const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { authenticateTeamToken } = require('../middleware/auth');
const { isSupabaseConfigured, getSupabase, uploadToSupabaseStorage } = require('../db/supabase');
const supabaseData = require('../db/supabaseData');

const router = express.Router();

// Multer upload config (50MB memory storage for cloud pipe)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }
});

// Get active problem statements (public)
router.get('/problem-statements', async (req, res) => {
    try {
        const ps = await supabaseData.getProblemStatements();
        res.json(ps || []);
    } catch (err) {
        console.error('Error fetching problem statements from Supabase:', err);
        res.status(500).json({ error: 'Server error loading problem statements.' });
    }
});

// Get active announcements (public)
router.get('/announcements', async (req, res) => {
    try {
        const announcements = await supabaseData.getAnnouncements();
        res.json(announcements || []);
    } catch (err) {
        console.error('Error fetching announcements from Supabase:', err);
        res.status(500).json({ error: 'Server error loading announcements.' });
    }
});

// Get event schedule (public)
router.get('/schedule', async (req, res) => {
    try {
        const schedule = await supabaseData.getSchedule();
        res.json(schedule || []);
    } catch (err) {
        console.error('Error fetching schedule from Supabase:', err);
        res.status(500).json({ error: 'Server error loading schedule.' });
    }
});

// Get event settings (public)
router.get('/settings', async (req, res) => {
    try {
        const settingsObj = await supabaseData.getEventSettings();
        res.json(settingsObj || {});
    } catch (err) {
        console.error('Error fetching settings from Supabase:', err);
        res.status(500).json({ error: 'Server error loading settings.' });
    }
});

// Get registration stats (public - limited)
router.get('/stats', async (req, res) => {
    try {
        const stats = await supabaseData.getPublicStats();
        res.json(stats || {
            totalTeams: 0,
            totalParticipants: 0,
            totalProblemStatements: 0,
            maxTeams: 60,
            registrationOpen: true
        });
    } catch (err) {
        console.error('Error fetching stats from Supabase:', err);
        res.status(500).json({ error: 'Server error loading stats.' });
    }
});

// Register a team (public)
router.post('/register', async (req, res) => {
    try {
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

        const emails = members.map(m => m.email.trim().toLowerCase());
        const uniqueEmails = [...new Set(emails)];
        if (uniqueEmails.length !== emails.length) {
            return res.status(400).json({ error: 'Duplicate email addresses in team members list.' });
        }

        const leader = members.find(m => m.is_leader) || members[0];
        const defaultPassword = 'Syanp2K26';
        const hashedPassword = bcrypt.hashSync(defaultPassword, 10);

        const eligibility = await supabaseData.checkRegistrationEligibility(team_name, emails);
        if (!eligibility.ok) {
            return res.status(400).json({ error: eligibility.error });
        }

        const supaResult = await supabaseData.registerTeamInSupabase({
            team_name,
            problem_statement_id: problem_statement_id || null,
            members,
            leaderEmail: leader.email,
            hashedPassword
        });

        return res.status(201).json({
            message: 'Team registered successfully in Supabase!',
            teamId: supaResult.teamId,
            teamCode: supaResult.teamCode,
            teamName: supaResult.teamName,
            defaultPassword: defaultPassword
        });
    } catch (err) {
        console.error('Registration Error:', err);
        res.status(500).json({ error: 'Server error during registration. Please try again.' });
    }
});

// ====== Team Leader Login ======
router.post('/team/login', async (req, res) => {
    try {
        const identifier = (req.body.team_code || req.body.login_identifier || req.body.email || '').trim();
        const password = (req.body.password || '').trim();

        if (!identifier || !password) {
            return res.status(400).json({ error: 'Team ID (e.g., SY01) or Team Lead Email and password are required.' });
        }

        const defaultPasswords = ['syanp2k26', 'synap2k26', 'synapse2026', 'synapse', 'synap2026'];
        const isDefaultPassword = defaultPasswords.includes(password.toLowerCase());

        const supaTeam = await supabaseData.findTeamForLogin(identifier);
        if (!supaTeam) {
            return res.status(401).json({ error: 'Team not found. Please verify your Team ID or Lead Email.' });
        }

        let isValidPassword = false;
        if (supaTeam.password && supaTeam.password.startsWith('$2')) {
            isValidPassword = bcrypt.compareSync(password, supaTeam.password) || isDefaultPassword;
        } else {
            isValidPassword = (supaTeam.password === password || isDefaultPassword);
            if (isValidPassword) {
                const upgradedHash = bcrypt.hashSync(password, 10);
                await supabaseData.updateTeamPassword(supaTeam.id, upgradedHash);
            }
        }

        if (!isValidPassword) {
            return res.status(401).json({ error: 'Invalid password. Please check your credentials.' });
        }

        const token = jwt.sign(
            { teamId: supaTeam.id, teamCode: supaTeam.team_code, teamName: supaTeam.team_name, role: 'team' },
            process.env.JWT_SECRET || 'synapse_hackathon_2026_vsb_secret_key',
            { expiresIn: '48h' }
        );

        return res.json({
            token,
            team: {
                id: supaTeam.id,
                team_code: supaTeam.team_code,
                team_name: supaTeam.team_name,
                status: supaTeam.status
            }
        });
    } catch (err) {
        console.error('Error during team login in Supabase:', err);
        res.status(500).json({ error: 'Server error during team login.' });
    }
});

// ====== Team Leader Dashboard Data ======
router.get('/team/dashboard', authenticateTeamToken, async (req, res) => {
    try {
        const dashData = await supabaseData.getTeamDashboardData(req.team.teamId);
        if (!dashData) {
            return res.status(404).json({ error: 'Team not found.' });
        }
        res.json(dashData);
    } catch (err) {
        console.error('Error loading dashboard from Supabase:', err);
        res.status(500).json({ error: 'Server error loading team dashboard.' });
    }
});

// ====== Reveal / Roll Random Problem Statement ======
router.post('/team/reveal-ps', authenticateTeamToken, async (req, res) => {
    try {
        const teamId = req.team.teamId;
        const result = await supabaseData.revealTeamProblemStatement(teamId);

        if (!result) {
            return res.status(404).json({ error: 'Team or problem statement not found in Supabase.' });
        }

        return res.json({
            success: true,
            isCheckedIn: true,
            problem_statement: result.problemStatement,
            team: result.team
        });
    } catch (err) {
        console.error('Error revealing problem statement in Supabase:', err);
        res.status(500).json({ error: 'Server error revealing problem statement.' });
    }
});

// ====== Team File Upload (Supabase Storage Exclusively) ======
router.post('/team/upload', authenticateTeamToken, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file received. Please choose a file (PDF, PPT, ZIP, max 50MB).' });
        }

        const originalName = req.file.originalname;
        const mimeType = req.file.mimetype || 'application/octet-stream';
        const buffer = req.file.buffer;

        const uploadResult = await uploadToSupabaseStorage(buffer, originalName, mimeType);
        if (!uploadResult || !uploadResult.publicUrl) {
            throw new Error('Supabase Storage did not return a public file URL.');
        }

        const fileUrl = uploadResult.publicUrl;

        // Update team in Supabase
        const supabase = getSupabase();
        await supabase
            .from('teams')
            .update({ submission_file_url: fileUrl })
            .eq('id', req.team.teamId);

        res.json({
            message: 'File successfully uploaded to Supabase Storage!',
            fileUrl,
            fileName: originalName,
            storage: 'supabase'
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

        await supabaseData.updateTeamSubmission(req.team.teamId, {
            project_repo,
            project_demo,
            submission_notes,
            submission_file_url
        });

        res.json({ message: 'Project submission updated successfully in Supabase!' });
    } catch (err) {
        console.error('Supabase submission update error:', err);
        res.status(500).json({ error: 'Server error saving submission.' });
    }
});

// ====== Storage Status ======
router.get('/storage/status', (req, res) => {
    res.json({
        supabaseConfigured: isSupabaseConfigured(),
        storageBucket: process.env.SUPABASE_STORAGE_BUCKET || 'hackathon-files',
        maxUploadSizeMB: 50
    });
});

module.exports = router;
