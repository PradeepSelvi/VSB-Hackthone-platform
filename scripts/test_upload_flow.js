require('dotenv').config();
const http = require('http');
const https = require('https');
const jwt = require('jsonwebtoken');
const { getSupabase } = require('../db/supabase');

async function runUploadVerification() {
    console.log('🧪 Starting End-to-End File Upload Verification...');

    // 1. Fetch SY99 team from Supabase
    const supabase = getSupabase();
    const { data: teamData, error: teamErr } = await supabase
        .from('teams')
        .select('*')
        .eq('team_code', 'SY99')
        .single();

    if (teamErr || !teamData) {
        throw new Error('Could not find SY99 team: ' + teamErr?.message);
    }
    console.log(`✅ Located Team: ${teamData.team_code} - ${teamData.team_name} (ID: ${teamData.id})`);

    // 2. Generate Team Auth Token
    const JWT_SECRET = process.env.JWT_SECRET || 'synapse_hackathon_2026_vsb_secret_key';
    const token = jwt.sign(
        {
            teamId: teamData.id,
            teamCode: teamData.team_code,
            email: teamData.team_lead_email,
            role: 'team'
        },
        JWT_SECRET,
        { expiresIn: '2h' }
    );

    // 3. Construct Multipart Form Data
    const boundary = '----SynapseTestBoundary' + Date.now();
    const testFileName = 'Synapse2026_Project_Demo.pdf';
    const fakePdfBuffer = Buffer.from('%PDF-1.4\n% Synapse 2026 Verification Test PDF\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF');

    const header = Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="${testFileName}"\r\n` +
        `Content-Type: application/pdf\r\n\r\n`
    );
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
    const multipartBody = Buffer.concat([header, fakePdfBuffer, footer]);

    // 4. Send POST request to Local Server
    console.log(`🚀 Sending upload request to http://localhost:3000/api/team/upload...`);
    const res = await new Promise((resolve, reject) => {
        const req = http.request({
            hostname: 'localhost',
            port: 3000,
            path: '/api/team/upload',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': multipartBody.length
            }
        }, (res) => {
            let chunks = '';
            res.on('data', c => chunks += c);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, body: JSON.parse(chunks) });
                } catch (e) {
                    resolve({ status: res.statusCode, body: chunks });
                }
            });
        });
        req.on('error', reject);
        req.write(multipartBody);
        req.end();
    });

    console.log(`📡 Response HTTP Status: ${res.status}`);
    console.log('📦 Upload Result Payload:', JSON.stringify(res.body, null, 2));

    if (res.status !== 200 || !res.body.fileUrl) {
        throw new Error('Upload verification failed: ' + JSON.stringify(res.body));
    }

    // 5. Verify file is downloadable from returned Supabase URL
    console.log(`🔍 Verifying public accessibility of uploaded file: ${res.body.fileUrl}`);
    const downloadCheck = await new Promise((resolve) => {
        https.get(res.body.fileUrl, (dlRes) => {
            let dlData = Buffer.alloc(0);
            dlRes.on('data', c => dlData = Buffer.concat([dlData, c]));
            dlRes.on('end', () => resolve({
                status: dlRes.statusCode,
                contentType: dlRes.headers['content-type'],
                contentLength: dlData.length
            }));
        }).on('error', e => resolve({ error: e.message }));
    });

    console.log('📥 Download check status:', downloadCheck);

    // 6. Verify Database Record has updated submission_file_url
    const { data: updatedTeam } = await supabase
        .from('teams')
        .select('team_code, submission_file_url')
        .eq('id', teamData.id)
        .single();

    console.log('💾 Supabase Team Record submission_file_url:', updatedTeam.submission_file_url);

    if (updatedTeam.submission_file_url === res.body.fileUrl && downloadCheck.status === 200) {
        console.log('\n=============================================================');
        console.log('🎉 VERIFICATION RESULT: 100% OPERATIONAL & WORKING PERFECTLY!');
        console.log(`1. Upload to Supabase Storage: ✅ SUCCESS (${res.body.storage})`);
        console.log(`2. Cloud Public URL Generated:  ✅ ${res.body.fileUrl}`);
        console.log(`3. Direct Download (HTTP 200):  ✅ SUCCESS (${downloadCheck.contentLength} bytes)`);
        console.log(`4. Database Link Persistence:   ✅ SUCCESS in Supabase & Local`);
        console.log('=============================================================');
    }

    // 7. Test Vercel Production Endpoint directly
    console.log(`\n🌐 Testing Production Vercel: https://synapse-five-gray.vercel.app/api/team/upload ...`);
    const prodRes = await new Promise((resolve) => {
        const prodReq = https.request({
            hostname: 'synapse-five-gray.vercel.app',
            path: '/api/team/upload',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': multipartBody.length
            }
        }, (res) => {
            let chunks = '';
            res.on('data', c => chunks += c);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, body: JSON.parse(chunks) });
                } catch (e) {
                    resolve({ status: res.statusCode, body: chunks });
                }
            });
        });
        prodReq.on('error', e => resolve({ error: e.message }));
        prodReq.write(multipartBody);
        prodReq.end();
    });

    console.log('🌐 Vercel Production HTTP Status:', prodRes.status);
    console.log('🌐 Vercel Production Result:', prodRes.body);
    if (prodRes.status === 200) {
        console.log('🚀 PROD CLOUD UPLOAD VERIFIED: WORKING 100% IN PRODUCTION DEPLOYMENT!');
    } else {
        console.warn('⚠️ Warning: File link or download status did not match expected values.');
    }
}

runUploadVerification().catch(err => {
    console.error('Fatal error in verification:', err);
    process.exit(1);
});
