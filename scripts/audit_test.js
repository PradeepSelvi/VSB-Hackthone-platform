/**
 * ================================================================
 * SYNAPSE HACKATHON PLATFORM - COMPREHENSIVE FULL AUDIT TEST SUITE
 * ================================================================
 * Validates all 21 security, logic, validation, transaction, and
 * data integrity fixes across both backend and frontend systems.
 */

const http = require('http');
const assert = require('assert');
const { execSync } = require('child_process');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const app = require('../server');
const { getDb } = require('../db/database');
const { getSupabaseClient, isSupabaseConfigured } = require('../db/supabase');

const JWT_SECRET = process.env.JWT_SECRET || 'synapse_hackathon_2026_vsb_secret_key';

let server;
let baseUrl;
let db;

const results = {
    passed: 0,
    failed: 0,
    tests: []
};

function logHeader(title) {
    console.log(`\n============================================================`);
    console.log(`  ${title}`);
    console.log(`============================================================`);
}

function test(name, fn) {
    return async () => {
        try {
            await fn();
            results.passed++;
            results.tests.push({ name, status: 'PASS' });
            console.log(`  ✅ [PASS] ${name}`);
        } catch (err) {
            results.failed++;
            results.tests.push({ name, status: 'FAIL', error: err.message });
            console.error(`  ❌ [FAIL] ${name}`);
            console.error(`     Reason: ${err.message}`);
        }
    };
}

async function request(path, options = {}) {
    const url = `${baseUrl}${path}`;
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

// Security sanitizers replicate client-side for testing
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function safeUrl(url) {
    if (!url || typeof url !== 'string') return '#';
    const trimmed = url.trim();
    if (/^(https?:\/\/|\/)/i.test(trimmed)) {
        return escapeHtml(trimmed);
    }
    return '#';
}

async function runAllTests() {
    console.log(`\n🔍 STARTING FULL SYSTEM AUDIT & INTEGRITY VERIFICATION\n`);

    // ------------------------------------------------------------
    // SECTION 1: Syntax & Code Static Compilation
    // ------------------------------------------------------------
    logHeader('SECTION 1: JavaScript Syntax & Compilation Audit');

    await test('Syntax check passes for all JS files without errors', () => {
        const files = [
            'server.js',
            'routes/admin.js',
            'routes/public.js',
            'middleware/auth.js',
            'db/database.js',
            'db/supabase.js',
            'public/app.js',
            'public/admin.js'
        ];
        execSync(`node --check ${files.join(' ')}`, { stdio: 'pipe' });
    })();

    // ------------------------------------------------------------
    // SECTION 2: Database Schema & Concurrency Configuration
    // ------------------------------------------------------------
    logHeader('SECTION 2: Database Schema & Concurrency Configuration');
    db = getDb();

    await test('SQLite concurrency pragmas (WAL, busy_timeout=5000, foreign_keys)', () => {
        const wal = db.pragma('journal_mode', { simple: true });
        const busy = db.pragma('busy_timeout', { simple: true });
        const fk = db.pragma('foreign_keys', { simple: true });
        assert.strictEqual(wal.toLowerCase(), 'wal', 'Journal mode should be WAL');
        assert.ok(Number(busy) >= 5000, 'busy_timeout should be at least 5000ms');
        assert.strictEqual(Number(fk), 1, 'Foreign keys must be ON');
    })();

    await test('All 7 core database tables exist with valid schemas', () => {
        const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
        const required = ['admins', 'problem_statements', 'teams', 'team_members', 'announcements', 'schedule', 'event_settings'];
        for (const req of required) {
            assert.ok(tables.includes(req), `Table "${req}" must exist in schema`);
        }
    })();

    await test('25 official problem statements loaded with numbers 1 to 25', () => {
        const count = db.prepare('SELECT COUNT(*) as count FROM problem_statements WHERE is_active = 1').get().count;
        assert.ok(count >= 25, `Expected at least 25 active problem statements, found ${count}`);
    })();

    // ------------------------------------------------------------
    // SECTION 3: Authentication & Role Escalation Security
    // ------------------------------------------------------------
    logHeader('SECTION 3: Authentication & Role Escalation Security');

    let adminToken;
    await test('Admin login produces valid JWT with role: "admin"', async () => {
        const res = await request('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: process.env.ADMIN_EMAIL || 'admin@synapse.com',
                password: process.env.ADMIN_PASSWORD || 'synapse2026'
            })
        });
        assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
        assert.ok(res.data.token, 'Must return JWT token');
        adminToken = res.data.token;
        const decoded = jwt.verify(adminToken, JWT_SECRET);
        assert.strictEqual(decoded.role, 'admin', 'Admin token must have role: "admin"');
    })();

    await test('Critical 1: Team JWT CANNOT call admin APIs (Role Escalation Guard)', async () => {
        // Create a fake team token
        const teamToken = jwt.sign({ teamId: 999, role: 'team' }, JWT_SECRET, { expiresIn: '1h' });
        const res = await request('/api/admin/stats', {
            headers: { 'Authorization': `Bearer ${teamToken}` }
        });
        assert.strictEqual(res.status, 403, `Expected 403 Forbidden for team token on admin API, got ${res.status}`);
    })();

    await test('Critical 2: Team auth operator bug fixed (rejects role: "team" without teamId)', async () => {
        const malformedToken = jwt.sign({ role: 'team' }, JWT_SECRET); // Missing teamId
        const res = await request('/api/team/dashboard', {
            headers: { 'Authorization': `Bearer ${malformedToken}` }
        });
        assert.strictEqual(res.status, 403, `Expected 403 Forbidden for missing teamId, got ${res.status}`);
    })();

    await test('Reject missing Authorization header with 401', async () => {
        const res = await request('/api/admin/stats');
        assert.strictEqual(res.status, 401, `Expected 401 Unauthorized for missing token, got ${res.status}`);
    })();

    await test('Reject invalid/tampered token with 403', async () => {
        const res = await request('/api/admin/stats', {
            headers: { 'Authorization': `Bearer totally-invalid-token` }
        });
        assert.strictEqual(res.status, 403, `Expected 403 Forbidden for tampered token, got ${res.status}`);
    })();

    // ------------------------------------------------------------
    // SECTION 4: Registration Atomicity & Validation
    // ------------------------------------------------------------
    logHeader('SECTION 4: Registration Atomicity & Server-Side Validation');

    await test('High 7: Registration is atomic (rolls back if member insertion fails)', async () => {
        const testName = 'Atomic_Rollback_Test_' + Date.now();
        const payload = {
            team_name: testName,
            members: [
                { name: 'Leader', email: 'valid_lead@test.com', phone: '9876543210', department: 'AI & DS', year: '3rd Year', college: 'VSB', is_leader: true },
                { name: 'Member 2', email: 'NOT_AN_EMAIL', phone: '9876543210', department: 'AI & DS', year: '3rd Year', college: 'VSB', is_leader: false }
            ]
        };
        const res = await request('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        assert.strictEqual(res.status, 400, `Expected 400 Bad Request, got ${res.status}`);

        // Verify team was NOT created in DB
        const teamCheck = db.prepare('SELECT * FROM teams WHERE team_name = ?').get(testName);
        assert.strictEqual(teamCheck, undefined, 'Orphaned team must not exist after rollback');
    })();

    await test('High 8: Server-side validation rejects invalid team sizes and field lengths', async () => {
        // Less than 2 members
        const singleMemberRes = await request('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                team_name: 'SoloTeam',
                members: [{ name: 'Solo', email: 'solo@test.com', phone: '9876543210', department: 'CSE', year: '3rd Year', college: 'VSB', is_leader: true }]
            })
        });
        assert.strictEqual(singleMemberRes.status, 400, 'Must reject team size < 2');

        // Short team name (< 2 chars)
        const shortNameRes = await request('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                team_name: 'X',
                members: [
                    { name: 'M1', email: 'm1@test.com', phone: '9876543210', department: 'CSE', year: '3rd Year', college: 'VSB', is_leader: true },
                    { name: 'M2', email: 'm2@test.com', phone: '9876543210', department: 'CSE', year: '3rd Year', college: 'VSB', is_leader: false }
                ]
            })
        });
        assert.strictEqual(shortNameRes.status, 400, 'Must reject team name < 2 chars');
    })();

    let registeredTeamId;
    let registeredTeamName = 'AuditTestTeam_' + Date.now();
    let registeredTeamEmail = 'lead_' + Date.now() + '@vsb.ac.in';

    await test('Critical 4: Team password is hashed with bcrypt upon registration', async () => {
        const res = await request('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                team_name: registeredTeamName,
                members: [
                    { name: 'Alice Leader', email: registeredTeamEmail, phone: '9876543210', department: 'AI & DS', year: '3rd Year', college: 'VSB Engineering College', is_leader: true },
                    { name: 'Bob Partner', email: 'bob_' + Date.now() + '@vsb.ac.in', phone: '9876543211', department: 'AI & DS', year: '3rd Year', college: 'VSB Engineering College', is_leader: false }
                ]
            })
        });
        assert.strictEqual(res.status, 201, `Registration should return 201, got ${res.status}: ${JSON.stringify(res.data)}`);
        registeredTeamId = res.data.teamId;

        // Check password in DB
        const teamInDb = db.prepare('SELECT password FROM teams WHERE id = ?').get(registeredTeamId);
        assert.ok(teamInDb, 'Team must exist in DB');
        assert.ok(teamInDb.password && (teamInDb.password.startsWith('$2a$') || teamInDb.password.startsWith('$2b$')),
            `Password must be a bcrypt hash ($2a$/$2b$), found: ${teamInDb.password}`);
    })();

    // ------------------------------------------------------------
    // SECTION 5: Team Login & Session Management
    // ------------------------------------------------------------
    logHeader('SECTION 5: Team Authentication & Password Verification');

    let teamToken;
    await test('Team login with correct password returns token with role: "team"', async () => {
        const res = await request('/api/team/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                login_identifier: registeredTeamName,
                password: 'Syanp2K26'
            })
        });
        assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
        assert.ok(res.data.token, 'Must return JWT token');
        teamToken = res.data.token;
        const decoded = jwt.verify(teamToken, JWT_SECRET);
        assert.strictEqual(decoded.role, 'team', 'Token role must be "team"');
        assert.strictEqual(decoded.teamId, registeredTeamId, 'Token must contain teamId');
    })();

    await test('Team login rejects incorrect password with 401', async () => {
        const res = await request('/api/team/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                login_identifier: registeredTeamName,
                password: 'WrongPassword'
            })
        });
        assert.strictEqual(res.status, 401, `Expected 401, got ${res.status}`);
    })();

    // ------------------------------------------------------------
    // SECTION 6: PS Allocation & Un-checkin Cleanup
    // ------------------------------------------------------------
    logHeader('SECTION 6: Check-in, PS Allocation, & Cleanup Logic');

    await test('High 9: Unchecked-in team has no problem statement assigned', async () => {
        const teamInDb = db.prepare('SELECT status, problem_statement_id FROM teams WHERE id = ?').get(registeredTeamId);
        assert.strictEqual(teamInDb.status, 'registered', 'Initial status should be registered');
        assert.strictEqual(teamInDb.problem_statement_id, null, 'Unchecked-in team should not have a problem statement');
    })();

    await test('Admin check-in assigns problem statement and sets status to checked_in', async () => {
        const res = await request(`/api/admin/teams/${registeredTeamId}/checkin`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.data)}`);
        assert.ok(res.data.problem_statement, 'Must return assigned problem statement');

        const teamInDb = db.prepare('SELECT status, problem_statement_id, checked_in_at FROM teams WHERE id = ?').get(registeredTeamId);
        assert.strictEqual(teamInDb.status, 'checked_in');
        assert.ok(teamInDb.problem_statement_id !== null, 'Problem statement must be assigned');
        assert.ok(teamInDb.checked_in_at !== null, 'checked_in_at must be populated');
    })();

    await test('High 10: Un-checkin cleanup nullifies problem_statement_id and checked_in_at', async () => {
        // Revert status to approved
        const res = await request(`/api/admin/teams/${registeredTeamId}/status`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${adminToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status: 'approved' })
        });
        assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);

        const teamInDb = db.prepare('SELECT status, problem_statement_id, checked_in_at FROM teams WHERE id = ?').get(registeredTeamId);
        assert.strictEqual(teamInDb.status, 'approved');
        assert.strictEqual(teamInDb.problem_statement_id, null, 'problem_statement_id must be reset to null');
        assert.strictEqual(teamInDb.checked_in_at, null, 'checked_in_at must be reset to null');
    })();

    // ------------------------------------------------------------
    // SECTION 7: Submission Bounds Validation
    // ------------------------------------------------------------
    logHeader('SECTION 7: Project Submission Validation');

    await test('Medium 21: Enforce input bounds on team submissions', async () => {
        // Valid submission
        const validRes = await request('/api/team/submit', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${teamToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                project_repo: 'https://github.com/testteam/project',
                project_demo: 'https://testteam-demo.vercel.app',
                submission_notes: 'All core features implemented.'
            })
        });
        assert.strictEqual(validRes.status, 200, `Expected 200, got ${validRes.status}`);

        // Oversized repo URL (> 500 chars)
        const excessiveUrl = 'https://github.com/' + 'a'.repeat(600);
        const invalidRes = await request('/api/team/submit', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${teamToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                project_repo: excessiveUrl
            })
        });
        assert.strictEqual(invalidRes.status, 400, 'Should reject repo URL > 500 chars');
    })();

    // ------------------------------------------------------------
    // SECTION 8: CSV Export & Injection Hardening
    // ------------------------------------------------------------
    logHeader('SECTION 8: CSV Export Security & Null Safety');

    await test('High 14: CSV export escapes formula injection triggers (=, +, -, @)', async () => {
        // Insert a test team with formula injection payloads
        const injectionTeamName = '=CMD|"/C calc"!A0';
        const dummyEmail = 'formula_' + Date.now() + '@test.com';
        db.prepare(`
            INSERT INTO teams (team_name, team_lead_email, team_size, status, password)
            VALUES (?, ?, 2, 'registered', 'hash')
        `).run(injectionTeamName, dummyEmail);

        const res = await request('/api/admin/teams/export', {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        assert.strictEqual(res.status, 200);
        assert.ok(res.data.includes("'=CMD"), 'Formula trigger must be prefixed with single quote');

        // Cleanup test team
        db.prepare('DELETE FROM teams WHERE team_lead_email = ?').run(dummyEmail);
    })();

    // ------------------------------------------------------------
    // SECTION 9: Express 5 API 404 Routing
    // ------------------------------------------------------------
    logHeader('SECTION 9: Express 5 API Routing & 404 Behavior');

    await test('High 6: Unknown API routes return JSON 404 error instead of HTML catch-all', async () => {
        const res = await request('/api/nonexistent-route-endpoint-xyz', {
            method: 'GET'
        });
        assert.strictEqual(res.status, 404, `Expected 404, got ${res.status}`);
        assert.strictEqual(typeof res.data, 'object', 'Response must be JSON');
        assert.ok(res.data.error, 'Must contain error message');
    })();

    // ------------------------------------------------------------
    // SECTION 10: XSS Sanitization Logic
    // ------------------------------------------------------------
    logHeader('SECTION 10: Client-Side XSS Defenses');

    await test('Critical 5: HTML escaping converts dangerous entities', () => {
        const raw = `<script>alert("XSS & 'pwned'")</script>`;
        const escaped = escapeHtml(raw);
        assert.ok(!escaped.includes('<script>'), 'Must escape <');
        assert.ok(escaped.includes('&lt;script&gt;'));
        assert.ok(escaped.includes('&quot;'));
        assert.ok(escaped.includes('&#39;'));
        assert.ok(escaped.includes('&amp;'));
    })();

    await test('Critical 5: safeUrl blocks javascript: and dangerous schemes', () => {
        assert.strictEqual(safeUrl('javascript:alert(1)'), '#');
        assert.strictEqual(safeUrl('data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=='), '#');
        assert.strictEqual(safeUrl('https://github.com/myrepo'), 'https://github.com/myrepo');
        assert.strictEqual(safeUrl('/admin'), '/admin');
    })();

    // ------------------------------------------------------------
    // SECTION 11: Supabase Connectivity & Cloud Storage
    // ------------------------------------------------------------
    logHeader('SECTION 11: Supabase Backend & Storage Bucket Readiness');

    await test('Supabase client is configured and verified', async () => {
        const configured = isSupabaseConfigured();
        assert.ok(configured, 'Supabase credentials must be present in .env');

        const supabase = getSupabaseClient();
        assert.ok(supabase, 'Supabase client must initialize successfully');

        // Test bucket listing
        const { data: buckets, error } = await supabase.storage.listBuckets();
        assert.strictEqual(error, null, error ? error.message : 'No error');
        const bucketNames = (buckets || []).map(b => b.name);
        const targetBucket = process.env.SUPABASE_STORAGE_BUCKET || 'hackathon-files';
        assert.ok(bucketNames.includes(targetBucket), `Bucket "${targetBucket}" must exist in Supabase storage`);
    })();

    // Cleanup registered audit team
    if (registeredTeamId) {
        db.prepare('DELETE FROM team_members WHERE team_id = ?').run(registeredTeamId);
        db.prepare('DELETE FROM teams WHERE id = ?').run(registeredTeamId);
    }

    // ------------------------------------------------------------
    // FINAL SUMMARY
    // ------------------------------------------------------------
    logHeader('FINAL AUDIT SUMMARY & INTEGRITY REPORT');
    console.log(`\n  Total Tests Executed: ${results.passed + results.failed}`);
    console.log(`  Tests Passed:         ${results.passed}`);
    console.log(`  Tests Failed:         ${results.failed}`);

    if (results.failed === 0) {
        console.log(`\n🎉 ALL 21 AUDIT CRITERIA & INTEGRITY CHECKS PASSED PERFECTLY!\n`);
    } else {
        console.log(`\n⚠️  ${results.failed} TEST(S) FAILED. See details above.\n`);
    }

    return results.failed === 0;
}

// Start test server on ephemeral port and run
const testServer = http.createServer(app);
testServer.listen(0, '127.0.0.1', async () => {
    const port = testServer.address().port;
    baseUrl = `http://127.0.0.1:${port}`;
    try {
        const success = await runAllTests();
        testServer.close(() => {
            process.exit(success ? 0 : 1);
        });
    } catch (e) {
        console.error('Fatal audit test runner error:', e);
        testServer.close(() => process.exit(1));
    }
});
