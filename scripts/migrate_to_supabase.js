/**
 * migrate_to_supabase.js
 * Syncs all local SQLite data (problem statements, teams, members, announcements, schedule, settings)
 * directly into your Supabase database and initializes the storage bucket.
 * 
 * Usage:
 *   node scripts/migrate_to_supabase.js
 */

require('dotenv').config();
const { getDb } = require('../db/database');
const { getSupabase, isSupabaseConfigured, DEFAULT_BUCKET } = require('../db/supabase');

async function migrate() {
    console.log('🚀 Starting Supabase Migration & Storage Setup...\n');

    if (!isSupabaseConfigured()) {
        console.error('❌ Supabase is not configured in .env!');
        console.log('Please add the following to your .env file:');
        console.log('  SUPABASE_URL=https://your-project.supabase.co');
        console.log('  SUPABASE_KEY=your-supabase-service-role-or-anon-key\n');
        process.exit(1);
    }

    const supabase = getSupabase();
    const db = getDb();

    // 1. Storage Bucket Setup
    console.log(`📦 Setting up Supabase Storage Bucket: "${DEFAULT_BUCKET}"...`);
    try {
        const { data: buckets, error: listError } = await supabase.storage.listBuckets();
        if (listError) {
            console.warn('⚠️ Warning checking buckets:', listError.message);
        } else {
            const exists = buckets && buckets.some(b => b.name === DEFAULT_BUCKET);
            if (!exists) {
                const { error: createError } = await supabase.storage.createBucket(DEFAULT_BUCKET, {
                    public: true,
                    fileSizeLimit: 52428800 // 50MB
                });
                if (createError) {
                    console.warn('⚠️ Bucket creation note (bucket may already exist):', createError.message);
                } else {
                    console.log(`✅ Created public bucket "${DEFAULT_BUCKET}" for file storage.`);
                }
            } else {
                console.log(`✅ Bucket "${DEFAULT_BUCKET}" is already active and verified.`);
            }
        }
    } catch (err) {
        console.warn('Storage check notice:', err.message);
    }

    // 2. Migrate Problem Statements
    console.log('\n📄 Syncing Problem Statements...');
    const statements = db.prepare('SELECT * FROM problem_statements').all();
    if (statements.length > 0) {
        const payload = statements.map(s => ({
            id: s.id,
            ps_number: s.ps_number,
            title: s.title,
            description: s.description,
            problem_faced: s.problem_faced,
            suggested_solution: s.suggested_solution,
            category: s.category,
            difficulty: s.difficulty,
            is_active: s.is_active === 0 ? 0 : 1
        }));

        const { error: psErr } = await supabase.from('problem_statements').upsert(payload, { onConflict: 'id' });
        if (psErr) {
            console.error('❌ Error syncing problem statements:', psErr.message);
        } else {
            console.log(`✅ Synced ${statements.length} problem statements.`);
        }
    }

    // 3. Migrate Event Settings
    console.log('\n⚙️ Syncing Event Settings...');
    const settings = db.prepare('SELECT * FROM event_settings').all();
    if (settings.length > 0) {
        const { error: setErr } = await supabase.from('event_settings').upsert(settings, { onConflict: 'key' });
        if (setErr) {
            console.error('❌ Error syncing settings:', setErr.message);
        } else {
            console.log(`✅ Synced ${settings.length} event settings.`);
        }
    }

    // 4. Migrate Announcements
    console.log('\n📢 Syncing Announcements...');
    const announcements = db.prepare('SELECT * FROM announcements').all();
    if (announcements.length > 0) {
        const payload = announcements.map(a => ({
            id: a.id,
            title: a.title,
            message: a.message,
            priority: a.priority,
            is_active: a.is_active === 0 ? 0 : 1
        }));
        const { error: aErr } = await supabase.from('announcements').upsert(payload, { onConflict: 'id' });
        if (aErr) console.error('❌ Error syncing announcements:', aErr.message);
        else console.log(`✅ Synced ${announcements.length} announcements.`);
    }

    // 5. Migrate Schedule
    console.log('\n📅 Syncing Event Schedule...');
    const schedule = db.prepare('SELECT * FROM schedule').all();
    if (schedule.length > 0) {
        const payload = schedule.map(s => ({
            id: s.id,
            title: s.title,
            description: s.description,
            start_time: s.start_time,
            end_time: s.end_time,
            location: s.location,
            is_active: s.is_active === 0 ? 0 : 1
        }));
        const { error: sErr } = await supabase.from('schedule').upsert(payload, { onConflict: 'id' });
        if (sErr) console.error('❌ Error syncing schedule:', sErr.message);
        else console.log(`✅ Synced ${schedule.length} schedule entries.`);
    }

    // 6. Migrate Teams
    console.log('\n👥 Syncing Teams...');
    const teams = db.prepare('SELECT * FROM teams').all();
    if (teams.length > 0) {
        const payload = teams.map(t => ({
            id: t.id,
            team_code: t.team_code,
            team_name: t.team_name,
            team_lead_email: t.team_lead_email,
            team_size: t.team_size,
            password: t.password,
            problem_statement_id: t.problem_statement_id,
            status: t.status,
            project_repo: t.project_repo,
            project_demo: t.project_demo,
            submission_notes: t.submission_notes,
            submission_file_url: t.submission_file_url
        }));
        const { error: tErr } = await supabase.from('teams').upsert(payload, { onConflict: 'id' });
        if (tErr) console.error('❌ Error syncing teams:', tErr.message);
        else console.log(`✅ Synced ${teams.length} teams.`);
    }

    // 7. Migrate Team Members
    console.log('\n👤 Syncing Team Members...');
    const members = db.prepare('SELECT * FROM team_members').all();
    if (members.length > 0) {
        const payload = members.map(m => ({
            id: m.id,
            team_id: m.team_id,
            name: m.name,
            email: m.email,
            phone: m.phone,
            year: m.year,
            department: m.department,
            college: m.college,
            is_leader: m.is_leader ? 1 : 0
        }));
        const { error: mErr } = await supabase.from('team_members').upsert(payload, { onConflict: 'id' });
        if (mErr) console.error('❌ Error syncing members:', mErr.message);
        else console.log(`✅ Synced ${members.length} team members.`);
    }

    console.log('\n🎉 Supabase backend and storage setup is complete!\n');
}

migrate().catch(console.error);
