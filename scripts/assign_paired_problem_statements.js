require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { getDb } = require('../db/database');

async function assignPairedProblemStatements() {
    console.log('🚀 Assigning 1 Problem Statement for every two teams randomly in Supabase & Local DB...');

    // 1. Init Supabase
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false },
        db: { schema: 'public' }
    });

    // 2. Fetch all 54 teams (excluding SY99 test team)
    const { data: teams, error: tErr } = await supabase
        .from('teams')
        .select('id, team_code, team_name')
        .neq('team_code', 'SY99')
        .order('team_code', { ascending: true });

    if (tErr || !teams || teams.length !== 54) {
        throw new Error(`Expected 54 teams, got ${teams ? teams.length : 0}. Error: ${tErr?.message}`);
    }

    // 3. Fetch unique Problem Statements
    const { data: psList, error: psErr } = await supabase
        .from('problem_statements')
        .select('id, ps_number, title, category')
        .eq('is_active', 1)
        .order('id', { ascending: true });

    if (psErr || !psList || psList.length === 0) {
        throw new Error(`Failed to fetch problem statements: ${psErr?.message}`);
    }

    // Get unique problem statements by ps_number (or id)
    const uniquePsMap = new Map();
    psList.forEach(ps => {
        if (!uniquePsMap.has(ps.ps_number)) {
            uniquePsMap.set(ps.ps_number, ps);
        }
    });
    const uniquePs = Array.from(uniquePsMap.values());
    console.log(`📚 Found ${uniquePs.length} unique problem statements in catalog.`);

    // 4. Create 27 Pairs of teams:
    // User requested: "for example team 1 and team 27 get the same statement like that do for all the team"
    // Team 1 is SY01, Team 27 is SY27.
    // We create Pair 1: SY01 & SY27.
    // Then pairs SY02 & SY28, SY03 & SY29, ... SY26 & SY52, SY53 & SY54.
    const teamMap = new Map();
    teams.forEach(t => teamMap.set(t.team_code, t));

    const pairs = [];
    // Pair 1: SY01 & SY27 (exact user example)
    pairs.push([teamMap.get('SY01'), teamMap.get('SY27')]);

    // Pairs 2 to 26: SY02..SY26 with SY28..SY52
    for (let i = 2; i <= 26; i++) {
        const codeA = `SY${String(i).padStart(2, '0')}`;
        const codeB = `SY${String(i + 26).padStart(2, '0')}`;
        pairs.push([teamMap.get(codeA), teamMap.get(codeB)]);
    }

    // Pair 27: SY53 & SY54
    pairs.push([teamMap.get('SY53'), teamMap.get('SY54')]);

    console.log(`👥 Formed ${pairs.length} pairs of teams (Total: ${pairs.length * 2} teams).`);

    // 5. Randomly shuffle problem statements pool for the 27 pairs
    // Need 27 problem statement assignments from uniquePs (length 25)
    // Shuffle uniquePs
    function shuffle(arr) {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    let psPool = shuffle(uniquePs);
    // If fewer than 27, add extra random ones to reach 27
    while (psPool.length < pairs.length) {
        const extra = shuffle(uniquePs);
        psPool.push(...extra);
    }
    psPool = psPool.slice(0, pairs.length);

    // 6. Assign each pair in Supabase and local SQLite
    const localDb = getDb();
    const assignmentSummary = [];

    for (let i = 0; i < pairs.length; i++) {
        const [teamA, teamB] = pairs[i];
        const assignedPs = psPool[i];

        // Update in Supabase
        await supabase
            .from('teams')
            .update({
                problem_statement_id: assignedPs.id,
                status: 'approved'
            })
            .in('id', [teamA.id, teamB.id]);

        // Find corresponding PS in local SQLite by ps_number
        const localPs = localDb.prepare('SELECT id FROM problem_statements WHERE ps_number = ?').get(assignedPs.ps_number);
        const localPsId = localPs ? localPs.id : assignedPs.id;

        localDb.prepare(`
            UPDATE teams 
            SET problem_statement_id = ?, status = 'approved'
            WHERE team_code IN (?, ?)
        `).run(localPsId, teamA.team_code, teamB.team_code);

        assignmentSummary.push({
            pair: i + 1,
            teamA: `${teamA.team_code} (${teamA.team_name})`,
            teamB: `${teamB.team_code} (${teamB.team_name})`,
            psNumber: assignedPs.ps_number,
            psTitle: assignedPs.title,
            psCategory: assignedPs.category
        });
    }

    console.log('\n========================================================================================');
    console.log('🎉 27 TEAM PAIRS & RANDOMLY ASSIGNED PROBLEM STATEMENTS');
    console.log('========================================================================================');
    console.table(assignmentSummary.map(a => ({
        'Pair': a.pair,
        'Team 1': a.teamA,
        'Team 2': a.teamB,
        'PS #': `PS #${a.psNumber}`,
        'Challenge Title': a.psTitle
    })));
    console.log('========================================================================================');
    console.log('✅ Successfully assigned all 54 teams in pairs to Supabase & SQLite!');
}

assignPairedProblemStatements().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
