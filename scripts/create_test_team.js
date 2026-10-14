require('dotenv').config();
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');
const { getDb } = require('../db/database');

const TEAM_CODE = 'SY99';
const TEAM_NAME = 'Test Player Team';
const LEAD_EMAIL = 'test@synapse.vsb.edu.in';
const PASSWORD = 'Syanp2K26';
const HASHED_PW = bcrypt.hashSync(PASSWORD, 10);
const COLLEGE_NAME = 'V.S.B. Engineering College, Karur';

async function createTestTeam() {
    console.log('🚀 Creating / updating Test Player Team...');

    // 1. Supabase
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false },
        db: { schema: 'public' }
    });

    // Get PS #1 ID
    const { data: psData } = await supabase
        .from('problem_statements')
        .select('id')
        .eq('ps_number', 1)
        .limit(1);
    const psId = psData && psData.length > 0 ? psData[0].id : null;

    // Check if SY99 exists
    const { data: existing } = await supabase
        .from('teams')
        .select('id')
        .eq('team_code', TEAM_CODE)
        .limit(1);

    let teamId;
    if (existing && existing.length > 0) {
        teamId = existing[0].id;
        await supabase
            .from('teams')
            .update({
                team_name: TEAM_NAME,
                team_lead_email: LEAD_EMAIL,
                team_size: 4,
                password: HASHED_PW,
                problem_statement_id: psId,
                status: 'approved'
            })
            .eq('id', teamId);
        console.log(`Updated existing team in Supabase (ID: ${teamId})`);
    } else {
        const { data: insTeam, error: insErr } = await supabase
            .from('teams')
            .insert({
                team_code: TEAM_CODE,
                team_name: TEAM_NAME,
                team_lead_email: LEAD_EMAIL,
                team_size: 4,
                password: HASHED_PW,
                problem_statement_id: psId,
                status: 'approved',
                registered_at: new Date().toISOString()
            })
            .select()
            .single();

        if (insErr) throw insErr;
        teamId = insTeam.id;
        console.log(`Created new team in Supabase (ID: ${teamId})`);
    }

    // Members
    const members = [
        { name: 'Ragav (Lead)', email: LEAD_EMAIL, phone: '9876543210', year: '3rd Year', department: 'AI&DS', college: COLLEGE_NAME, is_leader: 1 },
        { name: 'Alex M', email: 'test.m2@vsb.ac.in', phone: '9876543211', year: '3rd Year', department: 'AI&DS', college: COLLEGE_NAME, is_leader: 0 },
        { name: 'Sam K', email: 'test.m3@vsb.ac.in', phone: '9876543212', year: '3rd Year', department: 'AI&DS', college: COLLEGE_NAME, is_leader: 0 },
        { name: 'Jordan P', email: 'test.m4@vsb.ac.in', phone: '9876543213', year: '3rd Year', department: 'AI&DS', college: COLLEGE_NAME, is_leader: 0 }
    ];

    await supabase.from('team_members').delete().eq('team_id', teamId);
    const { error: memErr } = await supabase
        .from('team_members')
        .insert(members.map(m => ({ ...m, team_id: teamId })));
    if (memErr) throw memErr;

    // 2. Also update local SQLite
    const localDb = getDb();
    const localPs = localDb.prepare('SELECT id FROM problem_statements WHERE ps_number = 1').get();
    const localPsId = localPs ? localPs.id : null;

    const existingLocal = localDb.prepare('SELECT id FROM teams WHERE team_code = ?').get(TEAM_CODE);
    let localTeamId;
    if (existingLocal) {
        localTeamId = existingLocal.id;
        localDb.prepare(`
            UPDATE teams 
            SET team_name = ?, team_lead_email = ?, team_size = 4, password = ?, problem_statement_id = ?, status = 'approved'
            WHERE id = ?
        `).run(TEAM_NAME, LEAD_EMAIL, HASHED_PW, localPsId, localTeamId);
    } else {
        const info = localDb.prepare(`
            INSERT INTO teams (team_code, team_name, team_lead_email, team_size, password, problem_statement_id, status, registered_at)
            VALUES (?, ?, ?, 4, ?, ?, 'approved', datetime('now'))
        `).run(TEAM_CODE, TEAM_NAME, LEAD_EMAIL, HASHED_PW, localPsId);
        localTeamId = info.lastInsertRowid;
    }

    localDb.prepare('DELETE FROM team_members WHERE team_id = ?').run(localTeamId);
    const insLocalMem = localDb.prepare(`
        INSERT INTO team_members (team_id, name, email, phone, year, department, college, is_leader)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const m of members) {
        insLocalMem.run(localTeamId, m.name, m.email, m.phone, m.year, m.department, m.college, m.is_leader);
    }

    console.log('\n==========================================');
    console.log('🎉 Test Player Team Created Successfully!');
    console.log(`🆔 Team ID:    ${TEAM_CODE}`);
    console.log(`📧 Lead Email: ${LEAD_EMAIL}`);
    console.log(`🔑 Password:   ${PASSWORD}`);
    console.log(`📌 PS Assigned: PS #1 (Lending & Credit)`);
    console.log('==========================================');
}

createTestTeam().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
