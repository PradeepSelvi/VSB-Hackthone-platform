const { getSupabase, isSupabaseConfigured } = require('./supabase');

/**
 * Service to interact directly with Supabase PostgreSQL as the primary database.
 * Bypasses local ephemeral storage on Vercel and guarantees real-time persistent data.
 */

// ==========================================
// 1. PUBLIC QUERIES
// ==========================================

async function getProblemStatements() {
    const supabase = getSupabase();
    if (!supabase) return null;

    const { data, error } = await supabase
        .from('problem_statements')
        .select('*')
        .eq('is_active', 1)
        .order('ps_number', { ascending: true })
        .order('category')
        .order('title');

    if (error) throw error;
    return data;
}

async function getAnnouncements(limit = 20) {
    const supabase = getSupabase();
    if (!supabase) return null;

    const { data, error } = await supabase
        .from('announcements')
        .select('*')
        .eq('is_active', 1)
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) throw error;
    return data;
}

async function getSchedule() {
    const supabase = getSupabase();
    if (!supabase) return null;

    const { data, error } = await supabase
        .from('schedule')
        .select('*')
        .eq('is_active', 1)
        .order('start_time', { ascending: true });

    if (error) throw error;
    return data;
}

async function getEventSettings() {
    const supabase = getSupabase();
    if (!supabase) return null;

    const { data, error } = await supabase
        .from('event_settings')
        .select('*');

    if (error) throw error;
    const settingsObj = {};
    (data || []).forEach(s => { settingsObj[s.key] = s.value; });
    return settingsObj;
}

async function getPublicStats() {
    const supabase = getSupabase();
    if (!supabase) return null;

    const [teamsRes, membersRes, psRes, settingsRes] = await Promise.all([
        supabase.from('teams').select('*', { count: 'exact', head: true }),
        supabase.from('team_members').select('*', { count: 'exact', head: true }),
        supabase.from('problem_statements').select('*', { count: 'exact', head: true }).eq('is_active', 1),
        supabase.from('event_settings').select('*')
    ]);

    const settingsObj = {};
    (settingsRes.data || []).forEach(s => { settingsObj[s.key] = s.value; });

    return {
        totalTeams: teamsRes.count || 0,
        totalParticipants: membersRes.count || 0,
        totalProblemStatements: psRes.count || 25,
        maxTeams: parseInt(settingsObj.max_teams) || 50,
        registrationOpen: settingsObj.registration_open === '1'
    };
}

// ==========================================
// 2. REGISTRATION
// ==========================================

async function checkRegistrationEligibility(teamName, emails) {
    const supabase = getSupabase();
    if (!supabase) return { ok: true };

    // 1. Check settings
    const settings = await getEventSettings();
    if (settings && settings.registration_open !== '1') {
        return { ok: false, error: 'Registration is currently closed.' };
    }

    const maxTeams = parseInt(settings?.max_teams) || 50;
    const { count: currentTeamsCount } = await supabase
        .from('teams')
        .select('*', { count: 'exact', head: true });

    if (currentTeamsCount >= maxTeams) {
        return { ok: false, error: 'Maximum number of teams reached. Registration is full.' };
    }

    // 2. Check duplicate team name (case-insensitive)
    const { data: teamDup } = await supabase
        .from('teams')
        .select('id, team_name')
        .ilike('team_name', teamName.trim())
        .limit(1);

    if (teamDup && teamDup.length > 0) {
        return { ok: false, error: 'Team name already taken. Please choose a different name.' };
    }

    // 3. Check duplicate member emails
    for (const email of emails) {
        const { data: emailDup } = await supabase
            .from('team_members')
            .select('id, email')
            .ilike('email', email.trim())
            .limit(1);

        if (emailDup && emailDup.length > 0) {
            return { ok: false, error: `Email ${email} is already registered with another team.` };
        }
    }

    return { ok: true };
}

async function registerTeamInSupabase({ team_name, problem_statement_id, members, leaderEmail, hashedPassword }) {
    const supabase = getSupabase();
    if (!supabase) throw new Error('Supabase client not available');

    // Generate unique team code SYN###
    const { data: allTeams } = await supabase
        .from('teams')
        .select('id, team_code');

    let maxNum = 0;
    (allTeams || []).forEach(t => {
        if (t.team_code) {
            const m = t.team_code.match(/SYN(\d+)/i);
            if (m) {
                const n = parseInt(m[1], 10);
                if (n > maxNum) maxNum = n;
            }
        }
        if (t.id && t.id > maxNum) {
            maxNum = Math.max(maxNum, t.id);
        }
    });

    const nextCode = 'SYN' + String(maxNum + 1).padStart(3, '0');

    // Insert Team
    const { data: newTeam, error: teamErr } = await supabase
        .from('teams')
        .insert({
            team_code: nextCode,
            team_name: team_name.trim(),
            team_lead_email: leaderEmail.trim(),
            team_size: members.length,
            password: hashedPassword,
            problem_statement_id: problem_statement_id ? Number(problem_statement_id) : null,
            status: 'registered'
        })
        .select()
        .single();

    if (teamErr) throw teamErr;

    // Insert Members
    const membersPayload = members.map(m => ({
        team_id: newTeam.id,
        name: m.name.trim(),
        email: m.email.trim(),
        phone: m.phone.trim(),
        year: m.year.trim(),
        department: m.department.trim(),
        college: m.college.trim(),
        is_leader: m.email.trim().toLowerCase() === leaderEmail.trim().toLowerCase() ? 1 : 0
    }));

    const { error: membersErr } = await supabase
        .from('team_members')
        .insert(membersPayload);

    if (membersErr) {
        console.error('Error inserting team members:', membersErr);
        // Rollback team if member insert fails
        await supabase.from('teams').delete().eq('id', newTeam.id);
        throw membersErr;
    }

    return {
        teamId: newTeam.id,
        teamCode: newTeam.team_code,
        teamName: newTeam.team_name
    };
}

// ==========================================
// 3. TEAM AUTH & DASHBOARD
// ==========================================

async function findTeamForLogin(identifier) {
    const supabase = getSupabase();
    if (!supabase) return null;

    const trimmed = (identifier || '').trim();
    let normalizedCode = trimmed.toUpperCase().replace(/[\s-_]/g, '');

    // Normalize SYN001 or SY01
    const synMatch = normalizedCode.match(/^SYN(\d+)$/);
    if (synMatch) {
        normalizedCode = 'SYN' + synMatch[1].padStart(3, '0');
    }
    const syMatch = normalizedCode.match(/^SY(\d+)$/);
    if (syMatch) {
        normalizedCode = 'SY' + syMatch[1].padStart(2, '0');
    }
    // Also if single/double digit entered directly (e.g. 1 or 01), check SY format
    const pureNum = normalizedCode.match(/^(\d{1,2})$/);
    let altCodeSY = pureNum ? ('SY' + pureNum[1].padStart(2, '0')) : normalizedCode;
    let altCodeSYN = pureNum ? ('SYN' + pureNum[1].padStart(3, '0')) : normalizedCode;

    // 1. Direct match on team_code, team_name, or team_lead_email
    const { data: teams, error } = await supabase
        .from('teams')
        .select('*')
        .or(`team_code.ilike.${normalizedCode},team_code.ilike.${altCodeSY},team_code.ilike.${altCodeSYN},team_code.ilike.${trimmed},team_lead_email.ilike.${trimmed},team_name.ilike.${trimmed}`);

    if (teams && teams.length > 0) {
        return teams[0];
    }

    // Also match if identifier is leader regNo directly (e.g. 922525148100)
    if (/^\d{6,16}$/.test(trimmed)) {
        const { data: regTeams } = await supabase
            .from('teams')
            .select('*')
            .ilike('team_lead_email', `${trimmed}@vsb.ac.in`)
            .limit(1);
        if (regTeams && regTeams.length > 0) return regTeams[0];
    }

    // 2. Check if identifier is any member's email
    const { data: memberMatches } = await supabase
        .from('team_members')
        .select('team_id')
        .ilike('email', trimmed)
        .limit(1);

    if (memberMatches && memberMatches.length > 0) {
        const { data: matchedTeam } = await supabase
            .from('teams')
            .select('*')
            .eq('id', memberMatches[0].team_id)
            .single();

        return matchedTeam || null;
    }

    return null;
}

async function updateTeamPassword(teamId, newHash) {
    const supabase = getSupabase();
    if (!supabase) return;
    await supabase.from('teams').update({ password: newHash }).eq('id', teamId);
}

async function getTeamDashboardData(teamId) {
    const supabase = getSupabase();
    if (!supabase) return null;

    // Fetch team
    const { data: team, error: teamErr } = await supabase
        .from('teams')
        .select('*')
        .eq('id', teamId)
        .single();

    if (teamErr || !team) return null;

    // Fetch members
    const { data: members } = await supabase
        .from('team_members')
        .select('*')
        .eq('team_id', teamId)
        .order('is_leader', { ascending: false })
        .order('id', { ascending: true });

    // Handle problem statement allocation if checked-in
    let problemStatement = null;
    if (team.status === 'checked_in') {
        if (!team.problem_statement_id) {
            const assignedPsId = await allocateShuffledProblemStatementInSupabase(team.problem_statement_id);
            if (assignedPsId) {
                const now = new Date().toISOString();
                await supabase.from('teams').update({
                    problem_statement_id: assignedPsId,
                    checked_in_at: team.checked_in_at || now
                }).eq('id', team.id);
                team.problem_statement_id = assignedPsId;
                team.checked_in_at = team.checked_in_at || now;
            }
        }

        if (team.problem_statement_id) {
            const { data: ps } = await supabase
                .from('problem_statements')
                .select('*')
                .eq('id', team.problem_statement_id)
                .single();
            problemStatement = ps || null;
        }
    }

    // Announcements, schedule, settings, counts
    const [announcementsRes, scheduleRes, settingsRes, totalTeamsRes, checkedInRes] = await Promise.all([
        supabase.from('announcements').select('*').eq('is_active', 1).order('created_at', { ascending: false }).limit(10),
        supabase.from('schedule').select('*').eq('is_active', 1).order('start_time', { ascending: true }),
        supabase.from('event_settings').select('*'),
        supabase.from('teams').select('*', { count: 'exact', head: true }),
        supabase.from('teams').select('*', { count: 'exact', head: true }).eq('status', 'checked_in')
    ]);

    const settings = {};
    (settingsRes.data || []).forEach(s => { settings[s.key] = s.value; });

    return {
        team,
        members: members || [],
        problem_statement: problemStatement,
        isCheckedIn: team.status === 'checked_in',
        announcements: announcementsRes.data || [],
        schedule: scheduleRes.data || [],
        settings,
        event_stats: {
            totalTeams: totalTeamsRes.count || 0,
            checkedInTeams: checkedInRes.count || 0
        }
    };
}

async function updateTeamSubmission(teamId, { project_repo, project_demo, submission_notes, submission_file_url }) {
    const supabase = getSupabase();
    if (!supabase) return false;

    const payload = {};
    if (project_repo !== undefined) payload.project_repo = project_repo;
    if (project_demo !== undefined) payload.project_demo = project_demo;
    if (submission_notes !== undefined) payload.submission_notes = submission_notes;
    if (submission_file_url) payload.submission_file_url = submission_file_url;

    const { error } = await supabase.from('teams').update(payload).eq('id', teamId);
    if (error) throw error;
    return true;
}

async function revealTeamProblemStatement(teamId) {
    const supabase = getSupabase();
    if (!supabase) return null;

    const { data: team, error } = await supabase
        .from('teams')
        .select('*')
        .eq('id', teamId)
        .single();

    if (error || !team) return null;

    let psId = team.problem_statement_id;
    if (!psId) {
        psId = await allocateShuffledProblemStatementInSupabase();
    }

    const now = new Date().toISOString();
    const checkedInAt = team.checked_in_at || now;

    await supabase
        .from('teams')
        .update({
            status: 'checked_in',
            checked_in_at: checkedInAt,
            problem_statement_id: psId
        })
        .eq('id', teamId);

    const { data: ps } = await supabase
        .from('problem_statements')
        .select('*')
        .eq('id', psId)
        .single();

    return {
        team: {
            ...team,
            status: 'checked_in',
            checked_in_at: checkedInAt,
            problem_statement_id: psId
        },
        problemStatement: ps,
        isCheckedIn: true
    };
}

async function getTeamMembers(teamId) {
    const supabase = getSupabase();
    if (!supabase) return [];
    const { data, error } = await supabase
        .from('team_members')
        .select('*')
        .eq('team_id', teamId)
        .order('is_leader', { ascending: false })
        .order('id', { ascending: true });
    if (error) {
        console.error('Error fetching team members:', error);
        return [];
    }
    return data || [];
}

async function updateTeamMembersInSupabase(teamId, leader, teammates = []) {
    const supabase = getSupabase();
    if (!supabase) throw new Error('Supabase not configured');

    const totalSize = 1 + (Array.isArray(teammates) ? teammates.length : 0);

    // 1. Update team table with lead email & size
    const { error: teamUpdateErr } = await supabase
        .from('teams')
        .update({
            team_lead_email: (leader.email || '').trim().toLowerCase(),
            team_size: totalSize
        })
        .eq('id', teamId);

    if (teamUpdateErr) throw teamUpdateErr;

    // Helper to format department with section cleanly
    const formatDept = (dept, sec) => {
        const d = (dept || 'AI&DS').trim();
        const s = (sec || '').trim().toUpperCase();
        if (!s) return d;
        if (d.toUpperCase().includes('SEC')) return d;
        return `${d} (Sec ${s})`;
    };

    // 2. Build member rows
    const baseMembers = [
        {
            team_id: teamId,
            name: (leader.name || '').trim(),
            email: (leader.email || '').trim().toLowerCase(),
            phone: (leader.phone || '').trim(),
            department: formatDept(leader.department, leader.section),
            year: leader.year || '3rd Year',
            college: leader.college || 'V.S.B. Engineering College, Karur',
            is_leader: 1
        },
        ...teammates.map(tm => ({
            team_id: teamId,
            name: (tm.name || '').trim(),
            email: (tm.email || '').trim().toLowerCase(),
            phone: (tm.phone || '').trim(),
            department: formatDept(tm.department, tm.section),
            year: tm.year || '3rd Year',
            college: tm.college || 'V.S.B. Engineering College, Karur',
            is_leader: 0
        }))
    ];

    // Try with section column if present in table
    const membersWithSection = baseMembers.map((m, idx) => {
        const sec = idx === 0 
            ? (leader.section || '').trim().toUpperCase() 
            : ((teammates[idx - 1] && teammates[idx - 1].section) || '').trim().toUpperCase();
        return { ...m, section: sec };
    });

    // 3. Atomically replace members: delete old, insert new
    await supabase.from('team_members').delete().eq('team_id', teamId);

    // Try inserting with section column
    const { error: insertWithSecErr } = await supabase.from('team_members').insert(membersWithSection);
    if (insertWithSecErr) {
        // If section column doesn't exist, fall back to baseMembers (where section is in department)
        const { error: fallbackErr } = await supabase.from('team_members').insert(baseMembers);
        if (fallbackErr) throw fallbackErr;
    }

    // 4. Return updated members list
    const { data: updatedMembers } = await supabase
        .from('team_members')
        .select('*')
        .eq('team_id', teamId)
        .order('is_leader', { ascending: false })
        .order('id', { ascending: true });

    return updatedMembers || [];
}

// ==========================================
// 4. ALLOCATION ALGORITHM IN SUPABASE
// ==========================================

async function allocateShuffledProblemStatementInSupabase(currentPsId = null) {
    const supabase = getSupabase();
    if (!supabase) return null;

    // Get all active problem statements
    const { data: activeStatements } = await supabase
        .from('problem_statements')
        .select('id')
        .eq('is_active', 1);

    if (!activeStatements || activeStatements.length === 0) return null;

    // Get all checked-in teams with an assigned PS
    const { data: checkedInTeams } = await supabase
        .from('teams')
        .select('problem_statement_id')
        .eq('status', 'checked_in')
        .not('problem_statement_id', 'is', null);

    const counts = {};
    activeStatements.forEach(ps => { counts[ps.id] = 0; });
    (checkedInTeams || []).forEach(t => {
        if (counts[t.problem_statement_id] !== undefined) {
            counts[t.problem_statement_id]++;
        }
    });

    let minCount = Infinity;
    activeStatements.forEach(ps => {
        if (counts[ps.id] < minCount) minCount = counts[ps.id];
    });

    let pool = activeStatements.filter(ps => counts[ps.id] === minCount);
    if (pool.length > 1 && currentPsId) {
        const filtered = pool.filter(ps => ps.id !== currentPsId);
        if (filtered.length > 0) pool = filtered;
    }

    const chosen = pool[Math.floor(Math.random() * pool.length)] || activeStatements[0];
    return chosen ? chosen.id : activeStatements[0].id;
}

// ==========================================
// 5. ADMIN QUERIES
// ==========================================

async function getAdminByEmail(email) {
    const supabase = getSupabase();
    if (!supabase) return null;

    const { data, error } = await supabase
        .from('admins')
        .select('*')
        .ilike('email', email.trim())
        .limit(1);

    return (data && data.length > 0) ? data[0] : null;
}

async function getAdminStats() {
    const supabase = getSupabase();
    if (!supabase) return null;

    const [
        allTeamsRes,
        allMembersRes,
        allPsRes
    ] = await Promise.all([
        supabase.from('teams').select('*'),
        supabase.from('team_members').select('*'),
        supabase.from('problem_statements').select('*').eq('is_active', 1)
    ]);

    const teams = allTeamsRes.data || [];
    const members = allMembersRes.data || [];
    const problemStatements = allPsRes.data || [];

    const totalTeams = teams.length;
    const totalParticipants = members.length;
    const approvedTeams = teams.filter(t => t.status === 'approved').length;
    const pendingTeams = teams.filter(t => t.status === 'registered').length;
    const rejectedTeams = teams.filter(t => t.status === 'rejected').length;
    const checkedInTeams = teams.filter(t => t.status === 'checked_in').length;

    // Dept stats
    const deptMap = {};
    members.forEach(m => {
        const d = m.department || 'Unknown';
        deptMap[d] = (deptMap[d] || 0) + 1;
    });
    const deptStats = Object.keys(deptMap).map(d => ({ department: d, count: deptMap[d] })).sort((a,b) => b.count - a.count);

    // College stats
    const collegeTeamMap = {};
    const collegeMemberMap = {};
    members.forEach(m => {
        const c = m.college || 'Unknown';
        collegeMemberMap[c] = (collegeMemberMap[c] || 0) + 1;
        if (!collegeTeamMap[c]) collegeTeamMap[c] = new Set();
        collegeTeamMap[c].add(m.team_id);
    });
    const collegeStats = Object.keys(collegeMemberMap).map(c => ({
        college: c,
        teams: collegeTeamMap[c] ? collegeTeamMap[c].size : 0,
        members: collegeMemberMap[c]
    })).sort((a,b) => b.teams - a.teams);

    // Year stats
    const yearMap = {};
    members.forEach(m => {
        const y = m.year || 'Unknown';
        yearMap[y] = (yearMap[y] || 0) + 1;
    });
    const yearStats = Object.keys(yearMap).map(y => ({ year: y, count: yearMap[y] }));

    // Status breakdown
    const statusMap = {};
    teams.forEach(t => {
        statusMap[t.status] = (statusMap[t.status] || 0) + 1;
    });
    const statusBreakdown = Object.keys(statusMap).map(s => ({ status: s, count: statusMap[s] }));

    // PS stats
    const psCountMap = {};
    teams.filter(t => t.status === 'checked_in').forEach(t => {
        if (t.problem_statement_id) {
            psCountMap[t.problem_statement_id] = (psCountMap[t.problem_statement_id] || 0) + 1;
        }
    });
    const psStats = problemStatements.map(ps => ({
        ps_number: ps.ps_number,
        title: ps.title,
        category: ps.category,
        team_count: psCountMap[ps.id] || 0
    })).sort((a,b) => b.team_count - a.team_count);

    return {
        totalTeams,
        approvedTeams,
        pendingTeams,
        rejectedTeams,
        checkedInTeams,
        totalParticipants,
        totalProblemStatements: problemStatements.length,
        deptStats,
        collegeStats,
        yearStats,
        psStats,
        timeline: [],
        statusBreakdown
    };
}

async function getAdminTeams({ status, search } = {}) {
    const supabase = getSupabase();
    if (!supabase) return null;

    let query = supabase.from('teams').select('*').order('registered_at', { ascending: false });

    if (status && status !== 'all') {
        query = query.eq('status', status);
    }
    if (search) {
        query = query.or(`team_name.ilike.%${search}%,team_lead_email.ilike.%${search}%,team_code.ilike.%${search}%`);
    }

    const { data: teams, error: teamsErr } = await query;
    if (teamsErr) throw teamsErr;

    // Fetch members and problem statements
    const [membersRes, psRes] = await Promise.all([
        supabase.from('team_members').select('*').order('is_leader', { ascending: false }).order('id', { ascending: true }),
        supabase.from('problem_statements').select('id, ps_number, title, category')
    ]);

    const membersByTeam = {};
    (membersRes.data || []).forEach(m => {
        if (!membersByTeam[m.team_id]) membersByTeam[m.team_id] = [];
        membersByTeam[m.team_id].push(m);
    });

    const psMap = {};
    (psRes.data || []).forEach(ps => {
        psMap[ps.id] = ps;
    });

    return (teams || []).map(t => {
        const ps = t.problem_statement_id ? psMap[t.problem_statement_id] : null;
        return {
            ...t,
            ps_number: ps ? ps.ps_number : null,
            problem_statement_title: ps ? ps.title : null,
            problem_statement_category: ps ? ps.category : null,
            members: membersByTeam[t.id] || []
        };
    });
}

async function updateAdminTeamStatus(teamId, status) {
    const supabase = getSupabase();
    if (!supabase) return null;

    const { data: team } = await supabase.from('teams').select('*').eq('id', teamId).single();
    if (!team) return null;

    let assignedPsId = team.problem_statement_id;
    let checkedInAt = team.checked_in_at;

    if (status === 'checked_in') {
        if (!checkedInAt) checkedInAt = new Date().toISOString();
        if (!assignedPsId) {
            assignedPsId = await allocateShuffledProblemStatementInSupabase(null);
        }
    } else {
        assignedPsId = null;
        checkedInAt = null;
    }

    const { error } = await supabase.from('teams').update({
        status,
        problem_statement_id: assignedPsId,
        checked_in_at: checkedInAt
    }).eq('id', teamId);

    if (error) throw error;

    return {
        status,
        problem_statement_id: assignedPsId,
        checked_in_at: checkedInAt
    };
}

async function checkinAdminTeam(teamId) {
    const supabase = getSupabase();
    if (!supabase) return null;

    const { data: team } = await supabase.from('teams').select('*').eq('id', teamId).single();
    if (!team) return null;

    const checkedInAt = new Date().toISOString();
    let assignedPsId = team.problem_statement_id;
    if (!assignedPsId) {
        assignedPsId = await allocateShuffledProblemStatementInSupabase(null);
    }

    const { error } = await supabase.from('teams').update({
        status: 'checked_in',
        problem_statement_id: assignedPsId,
        checked_in_at: checkedInAt
    }).eq('id', teamId);

    if (error) throw error;

    return {
        status: 'checked_in',
        problem_statement_id: assignedPsId,
        checked_in_at: checkedInAt
    };
}

async function reallocateAdminTeam(teamId) {
    const supabase = getSupabase();
    if (!supabase) return null;

    const { data: team } = await supabase.from('teams').select('*').eq('id', teamId).single();
    if (!team) return null;

    const newPsId = await allocateShuffledProblemStatementInSupabase(team.problem_statement_id);
    const { error } = await supabase.from('teams').update({
        problem_statement_id: newPsId
    }).eq('id', teamId);

    if (error) throw error;

    const { data: ps } = await supabase.from('problem_statements').select('*').eq('id', newPsId).single();
    return {
        newPsId,
        problemStatement: ps
    };
}

async function deleteAdminTeam(teamId) {
    const supabase = getSupabase();
    if (!supabase) return false;

    // Delete members first (in case foreign key cascade isn't configured in PG)
    await supabase.from('team_members').delete().eq('team_id', teamId);
    const { error } = await supabase.from('teams').delete().eq('id', teamId);
    if (error) throw error;
    return true;
}

async function getAllProblemStatementsAdmin() {
    const supabase = getSupabase();
    if (!supabase) return [];
    const { data, error } = await supabase
        .from('problem_statements')
        .select('*')
        .order('ps_number', { ascending: true })
        .order('id', { ascending: true });
    if (error) throw error;
    return data || [];
}

async function createProblemStatement(psData) {
    const supabase = getSupabase();
    if (!supabase) throw new Error('Supabase not configured');
    
    // Find max ps_number
    const { data: maxRow } = await supabase
        .from('problem_statements')
        .select('ps_number')
        .order('ps_number', { ascending: false })
        .limit(1);
    const nextPsNum = (maxRow && maxRow[0] && maxRow[0].ps_number) ? maxRow[0].ps_number + 1 : 1;

    const { data, error } = await supabase
        .from('problem_statements')
        .insert({
            ps_number: psData.ps_number || nextPsNum,
            title: psData.title,
            description: psData.description,
            problem_faced: psData.problem_faced || '',
            suggested_solution: psData.suggested_solution || '',
            category: psData.category,
            difficulty: psData.difficulty || 'medium',
            is_active: psData.is_active !== undefined ? (psData.is_active ? 1 : 0) : 1
        })
        .select()
        .single();
    if (error) throw error;
    return data;
}

async function updateProblemStatement(id, psData) {
    const supabase = getSupabase();
    if (!supabase) throw new Error('Supabase not configured');
    const payload = {};
    if (psData.title !== undefined) payload.title = psData.title;
    if (psData.description !== undefined) payload.description = psData.description;
    if (psData.problem_faced !== undefined) payload.problem_faced = psData.problem_faced;
    if (psData.suggested_solution !== undefined) payload.suggested_solution = psData.suggested_solution;
    if (psData.category !== undefined) payload.category = psData.category;
    if (psData.difficulty !== undefined) payload.difficulty = psData.difficulty;
    if (psData.is_active !== undefined) payload.is_active = psData.is_active ? 1 : 0;

    const { data, error } = await supabase
        .from('problem_statements')
        .update(payload)
        .eq('id', id)
        .select()
        .single();
    if (error) throw error;
    return data;
}

async function deleteProblemStatement(id) {
    const supabase = getSupabase();
    if (!supabase) throw new Error('Supabase not configured');
    // Clear foreign keys in teams first
    await supabase.from('teams').update({ problem_statement_id: null }).eq('problem_statement_id', id);
    const { error } = await supabase.from('problem_statements').delete().eq('id', id);
    if (error) throw error;
    return true;
}

async function getAllAnnouncementsAdmin() {
    const supabase = getSupabase();
    if (!supabase) return [];
    const { data, error } = await supabase
        .from('announcements')
        .select('*')
        .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
}

async function createAnnouncement(annData) {
    const supabase = getSupabase();
    if (!supabase) throw new Error('Supabase not configured');
    const { data, error } = await supabase
        .from('announcements')
        .insert({
            title: annData.title,
            message: annData.message,
            priority: annData.priority || 'normal',
            is_active: annData.is_active !== undefined ? (annData.is_active ? 1 : 0) : 1
        })
        .select()
        .single();
    if (error) throw error;
    return data;
}

async function updateAnnouncement(id, annData) {
    const supabase = getSupabase();
    if (!supabase) throw new Error('Supabase not configured');
    const payload = {};
    if (annData.title !== undefined) payload.title = annData.title;
    if (annData.message !== undefined) payload.message = annData.message;
    if (annData.priority !== undefined) payload.priority = annData.priority;
    if (annData.is_active !== undefined) payload.is_active = annData.is_active ? 1 : 0;

    const { data, error } = await supabase
        .from('announcements')
        .update(payload)
        .eq('id', id)
        .select()
        .single();
    if (error) throw error;
    return data;
}

async function deleteAnnouncement(id) {
    const supabase = getSupabase();
    if (!supabase) throw new Error('Supabase not configured');
    const { error } = await supabase.from('announcements').delete().eq('id', id);
    if (error) throw error;
    return true;
}

async function getAllScheduleAdmin() {
    const supabase = getSupabase();
    if (!supabase) return [];
    const { data, error } = await supabase
        .from('schedule')
        .select('*')
        .order('start_time', { ascending: true });
    if (error) throw error;
    return data || [];
}

async function createScheduleEvent(eventData) {
    const supabase = getSupabase();
    if (!supabase) throw new Error('Supabase not configured');
    const { data, error } = await supabase
        .from('schedule')
        .insert({
            title: eventData.title,
            description: eventData.description || '',
            start_time: eventData.start_time,
            end_time: eventData.end_time || null,
            location: eventData.location || '',
            event_type: eventData.event_type || 'general',
            is_active: eventData.is_active !== undefined ? (eventData.is_active ? 1 : 0) : 1
        })
        .select()
        .single();
    if (error) throw error;
    return data;
}

async function updateScheduleEvent(id, eventData) {
    const supabase = getSupabase();
    if (!supabase) throw new Error('Supabase not configured');
    const payload = {};
    if (eventData.title !== undefined) payload.title = eventData.title;
    if (eventData.description !== undefined) payload.description = eventData.description;
    if (eventData.start_time !== undefined) payload.start_time = eventData.start_time;
    if (eventData.end_time !== undefined) payload.end_time = eventData.end_time;
    if (eventData.location !== undefined) payload.location = eventData.location;
    if (eventData.event_type !== undefined) payload.event_type = eventData.event_type;
    if (eventData.is_active !== undefined) payload.is_active = eventData.is_active ? 1 : 0;

    const { data, error } = await supabase
        .from('schedule')
        .update(payload)
        .eq('id', id)
        .select()
        .single();
    if (error) throw error;
    return data;
}

async function deleteScheduleEvent(id) {
    const supabase = getSupabase();
    if (!supabase) throw new Error('Supabase not configured');
    const { error } = await supabase.from('schedule').delete().eq('id', id);
    if (error) throw error;
    return true;
}

async function updateEventSettings(settingsObj) {
    const supabase = getSupabase();
    if (!supabase) throw new Error('Supabase not configured');
    const upsertList = Object.entries(settingsObj).map(([key, value]) => ({ key, value: String(value) }));
    const { error } = await supabase.from('event_settings').upsert(upsertList, { onConflict: 'key' });
    if (error) throw error;
    return true;
}

module.exports = {
    getProblemStatements,
    getAnnouncements,
    getSchedule,
    getEventSettings,
    getPublicStats,
    checkRegistrationEligibility,
    registerTeamInSupabase,
    findTeamForLogin,
    updateTeamPassword,
    getTeamDashboardData,
    getTeamMembers,
    updateTeamMembersInSupabase,
    revealTeamProblemStatement,
    updateTeamSubmission,
    allocateShuffledProblemStatementInSupabase,
    getAdminByEmail,
    getAdminStats,
    getAdminTeams,
    updateAdminTeamStatus,
    checkinAdminTeam,
    reallocateAdminTeam,
    deleteAdminTeam,
    getAllProblemStatementsAdmin,
    createProblemStatement,
    updateProblemStatement,
    deleteProblemStatement,
    getAllAnnouncementsAdmin,
    createAnnouncement,
    updateAnnouncement,
    deleteAnnouncement,
    getAllScheduleAdmin,
    createScheduleEvent,
    updateScheduleEvent,
    deleteScheduleEvent,
    updateEventSettings
};
