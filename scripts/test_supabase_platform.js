require('dotenv').config();
const http = require('http');
const https = require('https');
const assert = require('assert');
const jwt = require('jsonwebtoken');
const app = require('../server');
const { getSupabase, isSupabaseConfigured } = require('../db/supabase');
const supabaseData = require('../db/supabaseData');

let server;
let BASE_URL;
const JWT_SECRET = process.env.JWT_SECRET || 'synapse_hackathon_2026_vsb_secret_key';

const results = { passed: 0, failed: 0, errors: [] };

async function test(name, fn) {
    try {
        await fn();
        results.passed++;
        console.log(`  ✅ [PASS] ${name}`);
    } catch (err) {
        results.failed++;
        results.errors.push({ name, error: err.message });
        console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
    }
}

async function request(path, options = {}) {
    const url = `${BASE_URL}${path}`;
    const res = await fetch(url, options);
    let data;
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
        data = await res.json();
    } else {
        data = await res.text();
    }
    return { status: res.status, headers: res.headers, data };
}

async function run() {
    console.log('\n============================================================');
    console.log('⚡ SYNAPSE HACKATHON PLATFORM - PURE SUPABASE TEST SUITE');
    console.log('============================================================\n');

    await new Promise((resolve) => {
        server = app.listen(0, () => {
            const port = server.address().port;
            BASE_URL = `http://localhost:${port}`;
            console.log(`📡 Internal Test Server listening on ${BASE_URL}\n`);
            resolve();
        });
    });
    await test('Supabase client is configured and connected', async () => {
        assert.ok(isSupabaseConfigured(), 'Supabase environment variables must be present');
        const supabase = getSupabase();
        const { count, error } = await supabase.from('problem_statements').select('*', { count: 'exact', head: true });
        assert.ifError(error);
        assert.strictEqual(count, 25, `Expected exactly 25 problem statements in Supabase, found ${count}`);
    });

    // 2. Public problem statements API
    await test('Public API: /api/problem-statements returns exactly 25 statements', async () => {
        const res = await request('/api/problem-statements');
        assert.strictEqual(res.status, 200);
        assert.ok(Array.isArray(res.data));
        assert.strictEqual(res.data.length, 25, `Expected 25 PS from API, got ${res.data.length}`);
    });

    // 3. Public Stats API
    await test('Public API: /api/stats returns accurate statistics', async () => {
        const res = await request('/api/stats');
        assert.strictEqual(res.status, 200);
        assert.ok((res.data.totalTeams || res.data.total_teams) >= 54);
        assert.strictEqual((res.data.totalProblemStatements || res.data.total_problems), 25);
    });

    // 4. Admin Login via Supabase
    let adminToken;
    await test('Admin API: Login validates against Supabase admins table', async () => {
        const res = await request('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: process.env.ADMIN_EMAIL || 'admin@synapse.com',
                password: process.env.ADMIN_PASSWORD || 'synapse2026'
            })
        });
        assert.strictEqual(res.status, 200);
        assert.ok(res.data.token, 'Must return JWT token');
        adminToken = res.data.token;
    });

    // 5. Admin Teams API via Supabase
    await test('Admin API: /api/admin/teams loads teams from Supabase', async () => {
        const res = await request('/api/admin/teams', {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        assert.strictEqual(res.status, 200);
        assert.ok(Array.isArray(res.data));
        assert.ok(res.data.length >= 54, `Expected at least 54 teams, got ${res.data.length}`);
    });

    // 6. Test Team Login via Supabase
    let testTeamToken;
    await test('Team API: Test team SY99 logs in via Supabase', async () => {
        const res = await request('/api/team/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ team_code: 'SY99', password: 'Syanp2K26' })
        });
        assert.strictEqual(res.status, 200);
        assert.ok(res.data.token);
        assert.strictEqual(res.data.team.team_code, 'SY99');
        testTeamToken = res.data.token;
    });

    // 7. Save Team Members via Supabase
    await test('Team API: Save leader & teammates to Supabase (/api/team/members)', async () => {
        const payload = {
            leader: {
                name: 'Test Leader SY99',
                department: 'AI & DS',
                section: 'A',
                phone: '9876543210',
                email: 'test@synapse.vsb.edu.in'
            },
            teammates: [
                {
                    name: 'Teammate Alpha',
                    department: 'AI & DS',
                    section: 'A',
                    phone: '9876543211',
                    email: 'alpha@vsb.ac.in'
                },
                {
                    name: 'Teammate Beta',
                    department: 'AI & DS',
                    section: 'B',
                    phone: '9876543212',
                    email: 'beta@vsb.ac.in'
                }
            ]
        };

        const res = await request('/api/team/members', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${testTeamToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.data.success, true);
        assert.strictEqual(res.data.members.length, 3);
    });

    // 8. Team Dashboard via Supabase
    await test('Team API: Dashboard retrieves verified members from Supabase', async () => {
        const res = await request('/api/team/dashboard', {
            headers: { 'Authorization': `Bearer ${testTeamToken}` }
        });
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.data.team.team_code, 'SY99');
        assert.strictEqual(res.data.members.length, 3);
        assert.strictEqual(res.data.members[0].name, 'Test Leader SY99');
    });

    // 8. Public announcements and schedule via Supabase
    await test('Public API: /api/announcements and /api/schedule respond from Supabase', async () => {
        const ann = await request('/api/announcements');
        assert.strictEqual(ann.status, 200);
        const sch = await request('/api/schedule');
        assert.strictEqual(sch.status, 200);
    });

    console.log('\n============================================================');
    console.log(`📊 TEST SUMMARY: ${results.passed} Passed, ${results.failed} Failed`);
    console.log('============================================================\n');

    if (server) {
        server.close();
    }

    if (results.failed > 0) {
        process.exit(1);
    }
}

run().catch(err => {
    console.error('Fatal error during test run:', err);
    if (server) server.close();
    process.exit(1);
});
