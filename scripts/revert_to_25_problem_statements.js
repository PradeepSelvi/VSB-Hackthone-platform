require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { getDb } = require('../db/database');

async function revertTo25ProblemStatements() {
    console.log('🔄 Reverting strictly to the original 25 Problem Statements from vsb_hackathon_ps.md...\n');

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false },
        db: { schema: 'public' }
    });
    const localDb = getDb();

    // 1. Delete newly created statements (PS #26, PS #27, PS #99)
    console.log('🗑️ Deleting PS #26, PS #27, PS #99 from Supabase & SQLite...');
    
    // Supabase
    const { data: supaPsToDelete } = await supabase
        .from('problem_statements')
        .select('id')
        .in('ps_number', [26, 27, 99]);

    if (supaPsToDelete && supaPsToDelete.length > 0) {
        const supaIds = supaPsToDelete.map(p => p.id);
        await supabase.from('teams').update({ problem_statement_id: null }).in('problem_statement_id', supaIds);
        await supabase.from('problem_statements').delete().in('id', supaIds);
        console.log(`🗑️ Removed ${supaIds.length} statements from Supabase.`);
    }

    // SQLite
    const localPsToDelete = localDb.prepare('SELECT id FROM problem_statements WHERE ps_number IN (26, 27, 99)').all();
    if (localPsToDelete && localPsToDelete.length > 0) {
        const localIds = localPsToDelete.map(p => p.id);
        const placeholders = localIds.map(() => '?').join(',');
        localDb.prepare(`UPDATE teams SET problem_statement_id = NULL WHERE problem_statement_id IN (${placeholders})`).run(...localIds);
        localDb.prepare('DELETE FROM problem_statements WHERE ps_number IN (26, 27, 99)').run();
        console.log(`🗑️ Removed ${localIds.length} statements from SQLite.`);
    }

    // 2. Fetch the 25 original problem statements
    const { data: psList, error: psErr } = await supabase
        .from('problem_statements')
        .select('*')
        .gte('ps_number', 1)
        .lte('ps_number', 25)
        .order('ps_number', { ascending: true });

    if (psErr) throw psErr;

    // Deduplicate by ps_number (taking unique ps_number entries)
    const uniquePsMap = new Map();
    psList.forEach(p => {
        if (!uniquePsMap.has(p.ps_number)) {
            uniquePsMap.set(p.ps_number, p);
        }
    });

    const original25 = Array.from(uniquePsMap.values());
    console.log(`✅ Loaded ${original25.length} original problem statements (PS #1 to PS #25).`);
    if (original25.length !== 25) {
        throw new Error(`Expected exactly 25 statements, got ${original25.length}`);
    }

    // 3. Fetch 54 student teams (SY01 to SY54)
    const { data: teams, error: tErr } = await supabase
        .from('teams')
        .select('id, team_code, team_name')
        .neq('team_code', 'SY99')
        .order('team_code', { ascending: true });

    if (tErr || !teams || teams.length !== 54) {
        throw new Error(`Expected 54 student teams, got ${teams?.length}`);
    }

    const teamByCode = new Map();
    teams.forEach(t => teamByCode.set(t.team_code, t));

    // 4. Form 27 pairs:
    // Pair 1: SY01 & SY27
    // Pairs 2..26: SY02..SY26 with SY28..SY52
    // Pair 27: SY53 & SY54
    const pairs = [];
    pairs.push([teamByCode.get('SY01'), teamByCode.get('SY27')]);

    for (let i = 2; i <= 26; i++) {
        const c1 = `SY${String(i).padStart(2, '0')}`;
        const c2 = `SY${String(i + 26).padStart(2, '0')}`;
        pairs.push([teamByCode.get(c1), teamByCode.get(c2)]);
    }

    pairs.push([teamByCode.get('SY53'), teamByCode.get('SY54')]);
    console.log(`👥 Formed ${pairs.length} student pairs.`);

    // 5. Shuffle original 25 problem statements
    function shuffle(arr) {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    const shuffled = shuffle(original25);
    // For the 27 pairs: 25 unique statements + 2 additional random statements from original25
    const extraTwo = shuffle(original25).slice(0, 2);
    const pool27 = [...shuffled, ...extraTwo];

    console.log(`🎯 Allocation Pool: 25 distinct statements, exactly 2 statements repeated once for the remaining 2 pairs.`);

    // 6. Assign in Supabase and SQLite
    for (let i = 0; i < pairs.length; i++) {
        const [teamA, teamB] = pairs[i];
        const assignedPs = pool27[i];

        // Supabase
        await supabase
            .from('teams')
            .update({
                problem_statement_id: assignedPs.id,
                status: 'approved',
                checked_in_at: null
            })
            .in('id', [teamA.id, teamB.id]);

        // SQLite
        const localPs = localDb.prepare('SELECT id FROM problem_statements WHERE ps_number = ?').get(assignedPs.ps_number);
        const localPsId = localPs ? localPs.id : assignedPs.id;

        localDb.prepare(`
            UPDATE teams 
            SET problem_statement_id = ?, status = 'approved', checked_in_at = NULL
            WHERE team_code IN (?, ?)
        `).run(localPsId, teamA.team_code, teamB.team_code);
    }

    // 7. Test team SY99: Set problem_statement_id = null so test team is completely NOT added to PS assignments
    await supabase
        .from('teams')
        .update({
            problem_statement_id: null,
            status: 'approved',
            checked_in_at: null
        })
        .eq('team_code', 'SY99');

    localDb.prepare(`
        UPDATE teams 
        SET problem_statement_id = NULL, status = 'approved', checked_in_at = NULL
        WHERE team_code = 'SY99'
    `).run();

    console.log(`\n🧪 Test team SY99: completely excluded from problem statement allocations (problem_statement_id = null).`);
    console.log('🎉 Successfully reverted to original 25 Problem Statements!');
}

revertTo25ProblemStatements().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
