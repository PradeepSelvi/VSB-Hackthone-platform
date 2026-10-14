require('dotenv').config();
const path = require('path');
const xlsx = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

const OUTPUT_EXCEL = path.join(__dirname, '..', 'Synapse_Teams_Problem_Statements.xlsx');

async function generateExcel() {
    console.log('📊 Fetching team assignments from Supabase...');

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false },
        db: { schema: 'public' }
    });

    // 1. Fetch teams
    const { data: teams, error: tErr } = await supabase
        .from('teams')
        .select('*')
        .order('team_code', { ascending: true });

    if (tErr) throw tErr;

    // 2. Fetch problem statements
    const { data: psList, error: psErr } = await supabase
        .from('problem_statements')
        .select('*');

    if (psErr) throw psErr;
    const psMap = new Map();
    psList.forEach(p => psMap.set(p.id, p));

    // 3. Fetch members to get leader names, dept, year
    const { data: members, error: mErr } = await supabase
        .from('team_members')
        .select('*')
        .order('is_leader', { ascending: false });

    if (mErr) throw mErr;

    const teamMembersMap = new Map();
    members.forEach(m => {
        if (!teamMembersMap.has(m.team_id)) {
            teamMembersMap.set(m.team_id, []);
        }
        teamMembersMap.get(m.team_id).push(m);
    });

    // Build map of PS -> teams to identify pairs
    const psToTeams = new Map();
    teams.forEach(t => {
        if (t.problem_statement_id && t.team_code !== 'SY99') {
            if (!psToTeams.has(t.problem_statement_id)) {
                psToTeams.set(t.problem_statement_id, []);
            }
            psToTeams.get(t.problem_statement_id).push(t);
        }
    });

    // 4. Build Rows for Sheet 1: All Teams
    const allTeamsRows = teams.map(t => {
        const ps = psMap.get(t.problem_statement_id) || {};
        const teamMems = teamMembersMap.get(t.id) || [];
        const leader = teamMems.find(m => m.is_leader) || teamMems[0] || {};
        const otherMembers = teamMems.filter(m => !m.is_leader).map(m => m.name).join(', ');

        // Find paired team
        let pairedInfo = 'N/A';
        if (t.team_code === 'SY99') {
            pairedInfo = 'Test Team (Solo)';
        } else if (t.problem_statement_id && psToTeams.has(t.problem_statement_id)) {
            const peers = psToTeams.get(t.problem_statement_id).filter(peer => peer.team_code !== t.team_code);
            if (peers.length > 0) {
                pairedInfo = peers.map(p => `${p.team_code} - ${p.team_name}`).join(' | ');
            }
        }

        return {
            'Team ID': t.team_code,
            'Team Name': t.team_name,
            'Team Leader': leader.name || 'N/A',
            'Department': leader.department || 'N/A',
            'Year': leader.year || 'N/A',
            'Team Members': otherMembers || 'N/A',
            'Assigned PS #': ps.ps_number != null ? `PS #${String(ps.ps_number).padStart(2, '0')}` : 'Unassigned',
            'Problem Statement Title': ps.title || 'Unassigned',
            'Category': ps.category || 'N/A',
            'Difficulty': (ps.difficulty || 'medium').toUpperCase(),
            'Paired With (Shared PS)': pairedInfo
        };
    });

    // 5. Build Rows for Sheet 2: Paired Allocations (27 Pairs + Test Team)
    const pairedAllocations = [];
    let pairIndex = 1;
    const processedTeams = new Set();

    for (const t of teams) {
        if (t.team_code === 'SY99' || processedTeams.has(t.team_code)) continue;

        const ps = psMap.get(t.problem_statement_id) || {};
        const peers = (psToTeams.get(t.problem_statement_id) || []).filter(peer => peer.team_code !== t.team_code && !processedTeams.has(peer.team_code));
        const partner = peers[0];

        processedTeams.add(t.team_code);
        if (partner) processedTeams.add(partner.team_code);

        pairedAllocations.push({
            'Pair #': `Pair ${pairIndex++}`,
            'Team 1 ID': t.team_code,
            'Team 1 Name': t.team_name,
            'Team 2 ID': partner ? partner.team_code : 'Solo',
            'Team 2 Name': partner ? partner.team_name : 'Solo',
            'Assigned PS #': ps.ps_number != null ? `PS #${String(ps.ps_number).padStart(2, '0')}` : 'N/A',
            'Problem Statement Title': ps.title || 'N/A',
            'Category': ps.category || 'N/A'
        });
    }

    // 6. Write Workbook
    const wb = xlsx.utils.book_new();

    const wsAll = xlsx.utils.json_to_sheet(allTeamsRows);
    const wsPairs = xlsx.utils.json_to_sheet(pairedAllocations);

    // Set column widths for readability
    wsAll['!cols'] = [
        { wch: 10 }, // Team ID
        { wch: 25 }, // Team Name
        { wch: 22 }, // Leader
        { wch: 14 }, // Dept
        { wch: 12 }, // Year
        { wch: 38 }, // Members
        { wch: 15 }, // PS #
        { wch: 45 }, // PS Title
        { wch: 32 }, // Category
        { wch: 12 }, // Difficulty
        { wch: 30 }  // Paired With
    ];

    wsPairs['!cols'] = [
        { wch: 10 }, // Pair #
        { wch: 12 }, // Team 1 ID
        { wch: 25 }, // Team 1 Name
        { wch: 12 }, // Team 2 ID
        { wch: 25 }, // Team 2 Name
        { wch: 15 }, // PS #
        { wch: 45 }, // PS Title
        { wch: 32 }  // Category
    ];

    xlsx.utils.book_append_sheet(wb, wsAll, 'Teams & Problem Statements');
    xlsx.utils.book_append_sheet(wb, wsPairs, 'Paired Allocations');

    let writtenPath = OUTPUT_EXCEL;
    try {
        xlsx.writeFile(wb, OUTPUT_EXCEL);
    } catch (writeErr) {
        if (writeErr.code === 'EBUSY') {
            writtenPath = path.join(__dirname, '..', 'Synapse_Teams_Problem_Statements_Updated.xlsx');
            xlsx.writeFile(wb, writtenPath);
            console.log(`⚠️ Original file was open in Excel. Saved updated workbook to: ${writtenPath}`);
        } else {
            throw writeErr;
        }
    }

    console.log(`\n🎉 Excel file successfully generated: ${writtenPath}`);
    console.log(`📋 Total Teams exported: ${allTeamsRows.length}`);
    console.log(`👥 Total Pairs exported: ${pairedAllocations.length}`);
}

generateExcel().catch(err => {
    console.error('Error generating Excel:', err);
    process.exit(1);
});
