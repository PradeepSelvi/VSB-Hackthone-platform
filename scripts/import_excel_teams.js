require('dotenv').config();
const path = require('path');
const xlsx = require('xlsx');
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');
const { getDb } = require('../db/database');

const EXCEL_PATH = path.join(__dirname, '..', 'Synapse Registered Students.xlsx');
const DEFAULT_PASSWORD = 'Syanpse2026';
const HASHED_PASSWORD = bcrypt.hashSync(DEFAULT_PASSWORD, 10);
const COLLEGE_NAME = 'V.S.B. Engineering College, Karur';

async function importTeams() {
    console.log('🚀 Starting Synapse Team Import from Excel into Supabase & Local DB...');
    console.log(`📁 Excel File: ${EXCEL_PATH}`);

    // 1. Read Excel
    const wb = xlsx.readFile(EXCEL_PATH);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rawRows = xlsx.utils.sheet_to_json(sheet);
    console.log(`📊 Found ${rawRows.length} rows in ${wb.SheetNames[0]}`);

    // 2. Init Supabase
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) {
        throw new Error('Supabase URL or Key missing in .env');
    }
    const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false },
        db: { schema: 'public' }
    });

    // 3. Init Local DB
    const localDb = getDb();

    // 4. Parse Rows
    const parsedTeams = [];
    for (let i = 0; i < rawRows.length; i++) {
        const r = rawRows[i];
        const teamCode = (r['Team Id'] || `SY${String(i + 1).padStart(2, '0')}`).trim().toUpperCase();
        const teamName = (r['Team Name'] || `Team ${teamCode}`).trim();
        const leaderName = (r['Team Leader Name'] || '').trim();
        const leaderRegNo = r['Team Leader Register No'] ? String(r['Team Leader Register No']).trim() : null;
        const dept = (r['Department '] || r['Department'] || 'AI&DS').trim();
        const year = (r['Year '] || r['Year'] || '3rd Year').trim();
        const sec = (r['Section'] || '').trim();
        const paymentStatus = (r['Payment Status'] || '').trim();
        const amount = r['AMOUNT'] || null;

        // Members
        const m2 = (r['Team Member 2'] || r['Team member 2'] || '').trim();
        const m3 = (r['Team member 3'] || r['Team Member 3'] || '').trim();
        const m4 = (r['Team member 4'] || r['Team Member 4'] || '').trim();

        const leaderEmail = leaderRegNo ? `${leaderRegNo}@vsb.ac.in` : `${teamCode.toLowerCase()}@synapse.vsb.edu.in`;

        const members = [];
        if (leaderName) {
            members.push({
                name: leaderName,
                email: leaderEmail,
                phone: 'N/A',
                year: year || '3rd Year',
                department: dept || 'AI&DS',
                college: COLLEGE_NAME,
                is_leader: 1
            });
        }

        if (m2) {
            members.push({
                name: m2,
                email: `${teamCode.toLowerCase()}.m2@vsb.ac.in`,
                phone: 'N/A',
                year: year || '3rd Year',
                department: dept || 'AI&DS',
                college: COLLEGE_NAME,
                is_leader: 0
            });
        }

        if (m3) {
            members.push({
                name: m3,
                email: `${teamCode.toLowerCase()}.m3@vsb.ac.in`,
                phone: 'N/A',
                year: year || '3rd Year',
                department: dept || 'AI&DS',
                college: COLLEGE_NAME,
                is_leader: 0
            });
        }

        if (m4) {
            members.push({
                name: m4,
                email: `${teamCode.toLowerCase()}.m4@vsb.ac.in`,
                phone: 'N/A',
                year: year || '3rd Year',
                department: dept || 'AI&DS',
                college: COLLEGE_NAME,
                is_leader: 0
            });
        }

        // Database constraint requires team_size >= 2 AND team_size <= 4
        const teamSize = Math.max(2, Math.min(4, members.length));

        parsedTeams.push({
            teamCode,
            teamName,
            leaderEmail,
            teamSize,
            dept,
            year,
            sec,
            paymentStatus,
            amount,
            members
        });
    }

    console.log(`✅ Normalized ${parsedTeams.length} teams.`);

    // 5. Insert into Supabase
    let supaSuccess = 0;
    let supaErrors = 0;

    for (const team of parsedTeams) {
        try {
            // Check if team already exists by team_code
            const { data: existingTeams } = await supabase
                .from('teams')
                .select('id, team_code')
                .eq('team_code', team.teamCode)
                .limit(1);

            let teamId;
            if (existingTeams && existingTeams.length > 0) {
                teamId = existingTeams[0].id;
                await supabase
                    .from('teams')
                    .update({
                        team_name: team.teamName,
                        team_lead_email: team.leaderEmail,
                        team_size: team.teamSize,
                        password: HASHED_PASSWORD,
                        status: 'registered'
                    })
                    .eq('id', teamId);
            } else {
                const { data: insertedTeam, error: insErr } = await supabase
                    .from('teams')
                    .insert({
                        team_code: team.teamCode,
                        team_name: team.teamName,
                        team_lead_email: team.leaderEmail,
                        team_size: team.teamSize,
                        password: HASHED_PASSWORD,
                        status: 'registered',
                        registered_at: new Date().toISOString()
                    })
                    .select()
                    .single();

                if (insErr) throw insErr;
                teamId = insertedTeam.id;
            }

            // Sync members: delete old members for this team, then insert
            await supabase.from('team_members').delete().eq('team_id', teamId);

            if (team.members.length > 0) {
                const membersPayload = team.members.map(m => ({
                    team_id: teamId,
                    name: m.name,
                    email: m.email,
                    phone: m.phone,
                    year: m.year,
                    department: m.department,
                    college: m.college,
                    is_leader: m.is_leader
                }));

                const { error: memErr } = await supabase
                    .from('team_members')
                    .insert(membersPayload);

                if (memErr) throw memErr;
            }

            // Also mirror to local SQLite DB
            const existingLocal = localDb.prepare('SELECT id FROM teams WHERE team_code = ?').get(team.teamCode);
            let localTeamId;
            if (existingLocal) {
                localTeamId = existingLocal.id;
                localDb.prepare(`
                    UPDATE teams 
                    SET team_name = ?, team_lead_email = ?, team_size = ?, password = ?
                    WHERE id = ?
                `).run(team.teamName, team.leaderEmail, team.teamSize, HASHED_PASSWORD, localTeamId);
            } else {
                const info = localDb.prepare(`
                    INSERT INTO teams (team_code, team_name, team_lead_email, team_size, password, status, registered_at)
                    VALUES (?, ?, ?, ?, ?, 'registered', datetime('now'))
                `).run(team.teamCode, team.teamName, team.leaderEmail, team.teamSize, HASHED_PASSWORD);
                localTeamId = info.lastInsertRowid;
            }

            localDb.prepare('DELETE FROM team_members WHERE team_id = ?').run(localTeamId);
            const insertMemberLocal = localDb.prepare(`
                INSERT INTO team_members (team_id, name, email, phone, year, department, college, is_leader)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `);
            for (const m of team.members) {
                insertMemberLocal.run(localTeamId, m.name, m.email, m.phone, m.year, m.department, m.college, m.is_leader);
            }

            supaSuccess++;
            console.log(`[${supaSuccess}/${parsedTeams.length}] Synced ${team.teamCode} - ${team.teamName} (${team.members.length} members)`);
        } catch (err) {
            supaErrors++;
            console.error(`❌ Error syncing team ${team.teamCode}:`, err.message);
        }
    }

    console.log('\n==========================================');
    console.log(`🎉 Import Complete!`);
    console.log(`✅ Successfully synced: ${supaSuccess} teams`);
    if (supaErrors > 0) {
        console.log(`⚠️ Errors: ${supaErrors} teams`);
    }
    console.log('==========================================');
}

importTeams().catch(err => {
    console.error('Fatal import error:', err);
    process.exit(1);
});
