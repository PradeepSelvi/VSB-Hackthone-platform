require('dotenv').config();
const path = require('path');
const xlsx = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

const OUTPUT_PATH = path.join(__dirname, '..', 'Duplicate_PS_Teams.xlsx');

async function exportDuplicatePSTeams() {
    console.log('Fetching teams with same problem statement from Supabase...');

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) throw new Error('Supabase URL or Key missing in .env');

    const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

    const { data: teams, error } = await supabase
        .from('teams')
        .select('id, team_code, team_name, team_lead_email, team_size, status, problem_statement_id, problem_statements ( ps_number, title, category, difficulty )')
        .not('problem_statement_id', 'is', null)
        .order('problem_statement_id', { ascending: true });

    if (error) throw new Error('Supabase query failed: ' + error.message);
    if (!teams || teams.length === 0) { console.log('No teams with problem statements found.'); return; }

    console.log('Total teams with a problem statement: ' + teams.length);

    const psMap = {};
    for (const team of teams) {
        const psId = team.problem_statement_id;
        if (!psMap[psId]) psMap[psId] = [];
        psMap[psId].push(team);
    }

    const duplicateGroups = Object.values(psMap).filter(function(g) { return g.length > 1; });
    console.log('Problem statements with multiple teams: ' + duplicateGroups.length);

    if (duplicateGroups.length === 0) { console.log('No duplicate PS assignments found!'); return; }

    const flatRows = [];
    for (const group of duplicateGroups) {
        const ps = group[0].problem_statements;
        for (const team of group) {
            flatRows.push({
                'PS Number': ps ? ps.ps_number : team.problem_statement_id,
                'Problem Statement': ps ? ps.title : 'Unknown',
                'Category': ps ? ps.category : '',
                'Difficulty': ps ? ps.difficulty : '',
                'Teams Sharing This PS': group.length,
                'Team Code': team.team_code,
                'Team Name': team.team_name,
                'Team Lead Email': team.team_lead_email,
                'Team Size': team.team_size,
                'Status': team.status
            });
        }
        flatRows.push({});
    }

    const summaryRows = duplicateGroups.map(function(group) {
        const ps = group[0].problem_statements;
        return {
            'PS Number': ps ? ps.ps_number : group[0].problem_statement_id,
            'Problem Statement': ps ? ps.title : 'Unknown',
            'Category': ps ? ps.category : '',
            'Difficulty': ps ? ps.difficulty : '',
            'Total Teams': group.length,
            'Team Codes': group.map(function(t) { return t.team_code; }).join(', '),
            'Team Names': group.map(function(t) { return t.team_name; }).join(' | ')
        };
    });

    const wb = xlsx.utils.book_new();
    const ws1 = xlsx.utils.json_to_sheet(flatRows);
    ws1['!cols'] = [{wch:10},{wch:45},{wch:30},{wch:10},{wch:22},{wch:12},{wch:28},{wch:35},{wch:10},{wch:12}];
    xlsx.utils.book_append_sheet(wb, ws1, 'Duplicate Teams Detail');
    const ws2 = xlsx.utils.json_to_sheet(summaryRows);
    ws2['!cols'] = [{wch:10},{wch:45},{wch:30},{wch:10},{wch:12},{wch:40},{wch:60}];
    xlsx.utils.book_append_sheet(wb, ws2, 'Summary');
    xlsx.writeFile(wb, OUTPUT_PATH);

    console.log('Excel exported: ' + OUTPUT_PATH);
    console.log(duplicateGroups.length + ' problem statement(s) shared by multiple teams');
    console.log(flatRows.filter(function(r) { return r['Team Code']; }).length + ' teams total in the report');
}

exportDuplicatePSTeams().catch(function(err) { console.error('Fatal error:', err.message); process.exit(1); });
