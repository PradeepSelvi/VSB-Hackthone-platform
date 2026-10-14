require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function verifyDatabasePairings() {
    console.log('🔍 Connecting to Supabase and verifying all team statement assignments...\n');

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false },
        db: { schema: 'public' }
    });

    // 1. Fetch teams
    const { data: teams, error: tErr } = await supabase
        .from('teams')
        .select('id, team_code, team_name, problem_statement_id, status')
        .order('team_code', { ascending: true });

    if (tErr) throw tErr;

    // 2. Fetch problem statements
    const { data: psList, error: psErr } = await supabase
        .from('problem_statements')
        .select('id, ps_number, title, category');

    if (psErr) throw psErr;

    const psMap = new Map();
    psList.forEach(p => psMap.set(p.id, p));

    // Group teams by problem statement id
    const psGroups = new Map();

    teams.forEach(t => {
        const key = t.problem_statement_id || 'UNASSIGNED';
        if (!psGroups.has(key)) {
            psGroups.set(key, []);
        }
        psGroups.get(key).push(t);
    });

    console.log(`📊 Total Teams in Database: ${teams.length}`);
    console.log(`🎯 Total Distinct Problem Statement Allocations: ${psGroups.size}\n`);

    const sharedList = [];
    let pairNum = 1;

    for (const [psId, teamArr] of psGroups.entries()) {
        const ps = psMap.get(psId) || { ps_number: 'N/A', title: 'Unassigned', category: 'N/A' };
        
        sharedList.push({
            index: pairNum++,
            psNumber: ps.ps_number != null ? `PS #${String(ps.ps_number).padStart(2, '0')}` : 'N/A',
            psTitle: ps.title,
            category: ps.category,
            teamCount: teamArr.length,
            teams: teamArr.map(t => `${t.team_code} (${t.team_name})`).join('  ⚔️  ')
        });
    }

    console.log(JSON.stringify(sharedList, null, 2));
}

verifyDatabasePairings().catch(console.error);
