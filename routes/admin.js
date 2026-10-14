const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { authenticateToken } = require('../middleware/auth');
const { isSupabaseConfigured, getSupabase, uploadToSupabaseStorage, listSupabaseFiles, deleteFromSupabaseStorage } = require('../db/supabase');
const supabaseData = require('../db/supabaseData');

const router = express.Router();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }
});

// Admin Login (via Supabase admins table)
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }

        const supaAdmin = await supabaseData.getAdminByEmail(email);
        if (!supaAdmin || !bcrypt.compareSync(password, supaAdmin.password)) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { id: supaAdmin.id, email: supaAdmin.email, name: supaAdmin.name, role: 'admin' },
            process.env.JWT_SECRET || 'synapse_hackathon_2026_vsb_secret_key',
            { expiresIn: '24h' }
        );

        res.json({ token, admin: { id: supaAdmin.id, email: supaAdmin.email, name: supaAdmin.name } });
    } catch (err) {
        console.error('Admin login error:', err);
        res.status(500).json({ error: 'Server error during admin login.' });
    }
});

// Get Dashboard Stats (via Supabase)
router.get('/stats', authenticateToken, async (req, res) => {
    try {
        const stats = await supabaseData.getAdminStats();
        res.json(stats || {
            totalTeams: 0,
            approvedTeams: 0,
            pendingTeams: 0,
            rejectedTeams: 0,
            checkedInTeams: 0,
            totalParticipants: 0,
            totalProblemStatements: 0,
            deptStats: [],
            collegeStats: [],
            yearStats: [],
            psStats: [],
            statusBreakdown: []
        });
    } catch (err) {
        console.error('Admin stats error:', err);
        res.status(500).json({ error: 'Server error loading admin stats.' });
    }
});

// Get All Teams with Search/Filter (via Supabase)
const handleGetTeams = async (req, res) => {
    try {
        const { status, search } = req.query;
        const teams = await supabaseData.getAdminTeams({ status, search });
        res.json(teams || []);
    } catch (err) {
        console.error('Error fetching admin teams:', err);
        res.status(500).json({ error: 'Server error loading teams.' });
    }
};

router.get('/teams', authenticateToken, handleGetTeams);
router.get('/registrations', authenticateToken, handleGetTeams);

// Update Team Status (Approve / Reject / Check-in)
const handleTeamStatusUpdate = async (req, res) => {
    try {
        const { status } = req.body;
        const validStatuses = ['registered', 'approved', 'rejected', 'checked_in'];

        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        const supaResult = await supabaseData.updateAdminTeamStatus(req.params.id, status);
        if (!supaResult) {
            return res.status(404).json({ error: 'Team not found in Supabase.' });
        }

        res.json({
            message: 'Status updated successfully',
            status,
            problem_statement_id: supaResult.problem_statement_id,
            checked_in_at: supaResult.checked_in_at
        });
    } catch (err) {
        console.error('Status update error:', err);
        res.status(500).json({ error: 'Server error updating team status.' });
    }
};

router.patch('/teams/:id/status', authenticateToken, handleTeamStatusUpdate);
router.put('/teams/:id/status', authenticateToken, handleTeamStatusUpdate);

// Single-click Check-in for team (with shuffle & timestamp)
router.post('/teams/:id/checkin', authenticateToken, async (req, res) => {
    try {
        const checkinResult = await supabaseData.checkinAdminTeam(req.params.id);
        if (!checkinResult) {
            return res.status(404).json({ error: 'Team not found in Supabase.' });
        }

        let assignedPS = null;
        if (checkinResult.problem_statement_id) {
            const { data: ps } = await getSupabase()
                .from('problem_statements')
                .select('*')
                .eq('id', checkinResult.problem_statement_id)
                .single();
            assignedPS = ps || null;
        }

        res.json({
            message: 'Team checked in successfully!',
            status: 'checked_in',
            checked_in_at: checkinResult.checked_in_at,
            problem_statement: assignedPS
        });
    } catch (err) {
        console.error('Admin check-in error:', err);
        res.status(500).json({ error: 'Server error during check-in' });
    }
});

// Re-shuffle or assign problem statement to a team
router.post('/teams/:id/shuffle-ps', authenticateToken, async (req, res) => {
    try {
        const { problem_statement_id } = req.body;
        let assignedPS = null;

        if (problem_statement_id) {
            const psId = parseInt(problem_statement_id, 10);
            await getSupabase().from('teams').update({ problem_statement_id: psId }).eq('id', req.params.id);
            const { data: ps } = await getSupabase().from('problem_statements').select('*').eq('id', psId).single();
            assignedPS = ps;
        } else {
            const realloc = await supabaseData.reallocateAdminTeam(req.params.id);
            if (realloc) assignedPS = realloc.problemStatement;
        }

        res.json({
            message: 'Problem statement assigned successfully in Supabase!',
            problem_statement: assignedPS
        });
    } catch (err) {
        console.error('Shuffle PS error:', err);
        res.status(500).json({ error: 'Server error during problem statement assignment' });
    }
});

// Delete a team
router.delete('/teams/:id', authenticateToken, async (req, res) => {
    try {
        await supabaseData.deleteAdminTeam(req.params.id);
        res.json({ message: 'Team deleted successfully from Supabase.' });
    } catch (err) {
        console.error('Delete team error:', err);
        res.status(500).json({ error: 'Server error deleting team.' });
    }
});

// Problem Statements CRUD (Supabase)
router.get('/problem-statements', authenticateToken, async (req, res) => {
    try {
        const ps = await supabaseData.getAllProblemStatementsAdmin();
        res.json(ps);
    } catch (err) {
        console.error('Fetch problem statements error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/problem-statements', authenticateToken, async (req, res) => {
    try {
        const { title, description, category, difficulty, problem_faced, suggested_solution } = req.body;
        if (!title || !description || !category) {
            return res.status(400).json({ error: 'Title, description, and category are required' });
        }
        const created = await supabaseData.createProblemStatement({
            title, description, category, difficulty, problem_faced, suggested_solution
        });
        res.json({ id: created.id, message: 'Problem statement created in Supabase.' });
    } catch (err) {
        console.error('Create problem statement error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

router.put('/problem-statements/:id', authenticateToken, async (req, res) => {
    try {
        await supabaseData.updateProblemStatement(req.params.id, req.body);
        res.json({ message: 'Problem statement updated in Supabase.' });
    } catch (err) {
        console.error('Update problem statement error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

router.delete('/problem-statements/:id', authenticateToken, async (req, res) => {
    try {
        await supabaseData.deleteProblemStatement(req.params.id);
        res.json({ message: 'Problem statement deleted from Supabase.' });
    } catch (err) {
        console.error('Delete problem statement error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Announcements CRUD (Supabase)
router.get('/announcements', authenticateToken, async (req, res) => {
    try {
        const announcements = await supabaseData.getAllAnnouncementsAdmin();
        res.json(announcements);
    } catch (err) {
        console.error('Fetch announcements error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/announcements', authenticateToken, async (req, res) => {
    try {
        const { title, message, priority } = req.body;
        if (!title || !message) {
            return res.status(400).json({ error: 'Title and message are required' });
        }
        const created = await supabaseData.createAnnouncement({ title, message, priority });
        res.json({ id: created.id, message: 'Announcement created in Supabase.' });
    } catch (err) {
        console.error('Create announcement error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

router.put('/announcements/:id', authenticateToken, async (req, res) => {
    try {
        await supabaseData.updateAnnouncement(req.params.id, req.body);
        res.json({ message: 'Announcement updated in Supabase.' });
    } catch (err) {
        console.error('Update announcement error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

router.delete('/announcements/:id', authenticateToken, async (req, res) => {
    try {
        await supabaseData.deleteAnnouncement(req.params.id);
        res.json({ message: 'Announcement deleted from Supabase.' });
    } catch (err) {
        console.error('Delete announcement error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Schedule CRUD (Supabase)
router.get('/schedule', authenticateToken, async (req, res) => {
    try {
        const schedule = await supabaseData.getAllScheduleAdmin();
        res.json(schedule);
    } catch (err) {
        console.error('Fetch schedule error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/schedule', authenticateToken, async (req, res) => {
    try {
        const { title, description, start_time, end_time, location, event_type } = req.body;
        if (!title || !start_time) {
            return res.status(400).json({ error: 'Title and start time are required' });
        }
        const created = await supabaseData.createScheduleEvent({
            title, description, start_time, end_time, location, event_type
        });
        res.json({ id: created.id, message: 'Schedule event created in Supabase.' });
    } catch (err) {
        console.error('Create schedule event error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

router.put('/schedule/:id', authenticateToken, async (req, res) => {
    try {
        await supabaseData.updateScheduleEvent(req.params.id, req.body);
        res.json({ message: 'Schedule updated in Supabase.' });
    } catch (err) {
        console.error('Update schedule event error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

router.delete('/schedule/:id', authenticateToken, async (req, res) => {
    try {
        await supabaseData.deleteScheduleEvent(req.params.id);
        res.json({ message: 'Schedule event deleted from Supabase.' });
    } catch (err) {
        console.error('Delete schedule event error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Event Settings (Supabase)
router.get('/settings', authenticateToken, async (req, res) => {
    try {
        const settingsObj = await supabaseData.getEventSettings();
        res.json(settingsObj || {});
    } catch (err) {
        console.error('Fetch settings error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

router.put('/settings', authenticateToken, async (req, res) => {
    try {
        await supabaseData.updateEventSettings(req.body);
        res.json({ message: 'Settings updated in Supabase.' });
    } catch (err) {
        console.error('Update settings error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Export teams as CSV (Supabase)
const handleExportTeams = async (req, res) => {
    try {
        const supaTeams = await supabaseData.getAdminTeams();
        const teams = supaTeams.map(t => ({
            ...t,
            problem_statement: t.problem_statement_title,
            ps_category: t.problem_statement_category
        }));

        const members = [];
        supaTeams.forEach(t => {
            (t.members || []).forEach(m => {
                members.push({ ...m, team_id: t.id, team_name: t.team_name, team_code: t.team_code });
            });
        });

        function csvEscape(val) {
            if (val === null || val === undefined) return '""';
            let str = String(val).replace(/[\r\n]+/g, ' ');
            if (/^[=+\-@\t\r]/.test(str)) {
                str = "'" + str;
            }
            return `"${str.replace(/"/g, '""')}"`;
        }

        let csv = 'Team ID,Team Name,Team Lead Email,Team Size,Status,Problem Statement Number,Problem Statement,Category,Registered At,Checked In At,Project Repo,Project Demo,Submission File URL,Member Name,Member Email,Member Phone,Member Year,Member Department,Member College,Is Leader\n';

        teams.forEach(team => {
            const teamMembers = members.filter(m => m.team_id === team.id);
            if (teamMembers.length === 0) {
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
        console.error('Export error:', err);
        res.status(500).json({ error: 'Server error during export.' });
    }
};

router.get('/export/teams', authenticateToken, handleExportTeams);
router.get('/teams/export', authenticateToken, handleExportTeams);
router.get('/export/csv', authenticateToken, handleExportTeams);

// Admin File Upload directly to Supabase Storage
router.post('/upload', authenticateToken, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded.' });
        }

        const originalName = req.file.originalname;
        const mimeType = req.file.mimetype || 'application/octet-stream';
        const buffer = req.file.buffer;

        const result = await uploadToSupabaseStorage(buffer, originalName, mimeType);
        if (!result || !result.publicUrl) {
            throw new Error('Supabase Storage did not return a public file URL.');
        }

        res.json({
            message: 'File uploaded successfully to Supabase Storage!',
            fileUrl: result.publicUrl,
            fileName: originalName,
            storage: 'supabase'
        });
    } catch (err) {
        console.error('Admin upload error:', err);
        res.status(500).json({ error: 'Server error during upload: ' + (err.message || 'Unknown error') });
    }
});

// Admin list Supabase storage files
router.get('/storage/files', authenticateToken, async (req, res) => {
    try {
        const files = await listSupabaseFiles('submissions');
        res.json({ configured: true, files });
    } catch (err) {
        console.error('Storage list error:', err);
        res.status(500).json({ error: 'Failed to list storage files' });
    }
});

module.exports = router;
