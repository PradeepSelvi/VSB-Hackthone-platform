const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
const DEFAULT_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'hackathon-files';

let supabaseClient = null;

function isSupabaseConfigured() {
    return Boolean(
        SUPABASE_URL && 
        SUPABASE_KEY && 
        SUPABASE_URL.startsWith('http') && 
        !SUPABASE_URL.includes('your_supabase')
    );
}

function getSupabase() {
    if (!isSupabaseConfigured()) {
        return null;
    }
    if (!supabaseClient) {
        supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
            auth: {
                persistSession: false,
                autoRefreshToken: false
            }
        });
        console.log('⚡ Connected to Supabase backend & storage at:', SUPABASE_URL);
    }
    return supabaseClient;
}

/**
 * Upload a file directly into Supabase Storage
 * @param {Buffer} fileBuffer - The file binary buffer
 * @param {string} fileName - Destination file path/name
 * @param {string} mimeType - File MIME type (e.g. application/pdf, image/png)
 * @param {string} bucket - Bucket name (defaults to 'hackathon-files')
 * @returns {Promise<{ publicUrl: string, path: string }>}
 */
async function uploadToSupabaseStorage(fileBuffer, fileName, mimeType = 'application/octet-stream', bucket = DEFAULT_BUCKET) {
    const supabase = getSupabase();
    if (!supabase) {
        throw new Error('Supabase is not configured. Please set SUPABASE_URL and SUPABASE_KEY in .env');
    }

    // Ensure bucket exists or create it
    try {
        const { data: buckets } = await supabase.storage.listBuckets();
        const exists = buckets && buckets.some(b => b.name === bucket);
        if (!exists) {
            await supabase.storage.createBucket(bucket, {
                public: true,
                fileSizeLimit: 52428800 // 50MB
            });
            console.log(`📦 Created Supabase Storage bucket: "${bucket}"`);
        }
    } catch (bucketErr) {
        // Safe to ignore if bucket already exists or permissions restrict listing
    }

    // Clean filename and add timestamp to avoid collisions
    const cleanName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `submissions/${Date.now()}_${cleanName}`;

    const { data, error } = await supabase.storage
        .from(bucket)
        .upload(storagePath, fileBuffer, {
            contentType: mimeType,
            upsert: true
        });

    if (error) {
        console.error('Supabase Storage Upload Error:', error);
        throw error;
    }

    // Get public URL
    const { data: publicUrlData } = supabase.storage
        .from(bucket)
        .getPublicUrl(storagePath);

    return {
        path: storagePath,
        publicUrl: publicUrlData.publicUrl
    };
}

/**
 * Delete a file from Supabase Storage
 */
async function deleteFromSupabaseStorage(storagePath, bucket = DEFAULT_BUCKET) {
    const supabase = getSupabase();
    if (!supabase) return false;

    const { error } = await supabase.storage
        .from(bucket)
        .remove([storagePath]);

    if (error) {
        console.error('Supabase Storage Delete Error:', error);
        return false;
    }
    return true;
}

/**
 * List files in Supabase Storage bucket
 */
async function listSupabaseFiles(prefix = 'submissions', bucket = DEFAULT_BUCKET) {
    const supabase = getSupabase();
    if (!supabase) return [];

    const { data, error } = await supabase.storage
        .from(bucket)
        .list(prefix, {
            limit: 100,
            sortBy: { column: 'created_at', order: 'desc' }
        });

    if (error) {
        console.error('Supabase Storage List Error:', error);
        return [];
    }
    return data || [];
}

module.exports = {
    isSupabaseConfigured,
    getSupabase,
    getSupabaseClient: getSupabase,
    uploadToSupabaseStorage,
    deleteFromSupabaseStorage,
    listSupabaseFiles,
    DEFAULT_BUCKET
};
