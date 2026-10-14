require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { getDb } = require('../db/database');

async function reassignStrictlyTwoTeamsPerPS() {
    console.log('🚀 Setting up 27 unique problem statements and assigning strictly 2 teams per statement...\n');

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
    const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false },
        db: { schema: 'public' }
    });
    const localDb = getDb();

    // 1. Ensure PS #26 and PS #27 exist in Supabase and SQLite
    const newStatements = [
        {
            id: 32,
            ps_number: 26,
            title: 'Autonomous Zero-Trust API Security & Anomaly Shield',
            category: 'Cybersecurity & Cloud Security',
            description: 'Develop an automated zero-trust security engine that continuously inspects API payloads, detects abnormal token usage and payload injection, and enforces real-time micro-segmentation policies.',
            difficulty: 'hard'
        },
        {
            id: 33,
            ps_number: 27,
            title: 'Multimodal AI Copilot for Accessibility & Assistive Vision',
            category: 'Computer Vision & Assistive AI',
            description: 'Build an on-device/edge multimodal AI assistant that interprets real-world environments through camera feeds and spatial audio, assisting visually impaired individuals with hazard avoidance and document reading.',
            difficulty: 'medium'
        },
        {
            id: 99,
            ps_number: 99,
            title: 'Synapse Developer Sandbox & Integration Challenge',
            category: 'Platform Testing & Sandbox',
            description: 'Dedicated evaluation and developer sandbox challenge for testing system integrations, benchmark validations, and automated assessment pipelines.',
            difficulty: 'easy'
        }
    ];

    for (const ns of newStatements) {
        // Supabase
        const { data: existingSupa } = await supabase
            .from('problem_statements')
            .select('id')
            .eq('ps_number', ns.ps_number)
            .limit(1);

        if (!existingSupa || existingSupa.length === 0) {
            const { error: insErr } = await supabase.from('problem_statements').insert({
                id: ns.id,
                ps_number: ns.ps_number,
                title: ns.title,
                category: ns.category,
                description: ns.description,
                difficulty: ns.difficulty,
                is_active: 1
            });
            if (insErr) console.warn('Supabase insert PS warning:', insErr.message);
            else console.log(`✅ Added PS #${ns.ps_number} (${ns.title}) to Supabase (ID: ${ns.id}).`);
        }

        // SQLite
        const existingLocal = localDb.prepare('SELECT id FROM problem_statements WHERE ps_number = ?').get(ns.ps_number);
        if (!existingLocal) {
            localDb.prepare(`
                INSERT INTO problem_statements (ps_number, title, category, description, difficulty, is_active)
                VALUES (?, ?, ?, ?, ?, 1)
            `).run(ns.ps_number, ns.title, ns.category, ns.description, ns.difficulty);
            console.log(`✅ Added PS #${ns.ps_number} to SQLite.`);
        }
    }

    // 2. Fetch distinct Problem Statements 1 through 27 from Supabase
    const { data: psAll, error: psErr } = await supabase
        .from('problem_statements')
        .select('*')
        .gte('ps_number', 1)
        .lte('ps_number', 27)
        .order('ps_number', { ascending: true });

    if (psErr) throw psErr;

    // Deduplicate by ps_number (in case of legacy duplicate ids 1..6 vs 7..12)
    const uniquePsMap = new Map();
    psAll.forEach(p => {
        if (!uniquePsMap.has(p.ps_number)) {
            uniquePsMap.set(p.ps_number, p);
        }
    });

    const uniquePsList = Array.from(uniquePsMap.values());
    console.log(`\n📚 Total unique problem statements available for student pairs: ${uniquePsList.length}`);
    if (uniquePsList.length !== 27) {
        throw new Error(`Expected exactly 27 unique problem statements, found ${uniquePsList.length}`);
    }

    // 3. Fetch all 54 student teams (SY01 through SY54)
    const { data: studentTeams, error: stErr } = await supabase
        .from('teams')
        .select('id, team_code, team_name')
        .neq('team_code', 'SY99')
        .order('team_code', { ascending: true });

    if (stErr || !studentTeams || studentTeams.length !== 54) {
        throw new Error(`Expected 54 student teams, got ${studentTeams?.length}`);
    }

    const teamByCode = new Map();
    studentTeams.forEach(t => teamByCode.set(t.team_code, t));

    // 4. Form 27 Pairs
    const pairs = [];
    // Pair 1: SY01 & SY27
    pairs.push([teamByCode.get('SY01'), teamByCode.get('SY27')]);

    // Pairs 2..26: SY02..SY26 with SY28..SY52
    for (let i = 2; i <= 26; i++) {
        const c1 = `SY${String(i).padStart(2, '0')}`;
        const c2 = `SY${String(i + 26).padStart(2, '0')}`;
        pairs.push([teamByCode.get(c1), teamByCode.get(c2)]);
    }

    // Pair 27: SY53 & SY54
    pairs.push([teamByCode.get('SY53'), teamByCode.get('SY54')]);

    console.log(`👥 Formed ${pairs.length} pairs (total ${pairs.length * 2} student teams).`);

    // 5. Shuffle the 27 Problem Statements so allocation is random, but STRICTLY 1 PS per pair (EXACTLY 2 teams per PS)
    function shuffle(arr) {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    const shuffledPs = shuffle(uniquePsList);

    // 6. Assign each pair strictly 1 unique PS
    for (let i = 0; i < pairs.length; i++) {
        const [teamA, teamB] = pairs[i];
        const assignedPs = shuffledPs[i];

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

    // 7. Test team SY99: Assign dedicated PS #99 (Test Sandbox) completely separate from student teams!
    const { data: testPsData } = await supabase
        .from('problem_statements')
        .select('id')
        .eq('ps_number', 99)
        .limit(1);

    const testPsId = testPsData && testPsData.length > 0 ? testPsData[0].id : null;
    const localTestPs = localDb.prepare('SELECT id FROM problem_statements WHERE ps_number = 99').get();
    const localTestPsId = localTestPs ? localTestPs.id : null;

    await supabase
        .from('teams')
        .update({
            problem_statement_id: testPsId,
            status: 'approved',
            checked_in_at: null
        })
        .eq('team_code', 'SY99');

    localDb.prepare(`
        UPDATE teams
        SET problem_statement_id = ?, status = 'approved', checked_in_at = NULL
        WHERE team_code = 'SY99'
    `).run(localTestPsId);

    console.log(`🧪 Test team SY99 assigned dedicated sandbox statement: PS #99 (Solo, completely separate).`);
    console.log('🎉 Done! Strictly 2 teams per statement across all 27 pairs.');
}

reassignStrictlyTwoTeamsPerPS().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
