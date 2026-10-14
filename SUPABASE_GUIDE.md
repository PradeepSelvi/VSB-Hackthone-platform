# 🚀 Supabase Backend & Storage Integration Guide

This application is fully adapted to use **Supabase** for both **Cloud Storage (file uploads)** and **Database Management**, with seamless local fallback when offline.

---

## ⚡ What was configured

1. **Supabase Storage Integration (`db/supabase.js`)**:
   - Automated bucket creation (`hackathon-files`) with public access.
   - Multipart file upload pipeline with 50MB limit for team project files (PPT, ZIP, PDF, code archives).
   - Functions: `uploadToSupabaseStorage`, `deleteFromSupabaseStorage`, `listSupabaseFiles`.

2. **Full PostgreSQL Database Schema (`supabase_schema.sql`)**:
   - Complete tables: `admins`, `problem_statements`, `teams`, `team_members`, `announcements`, `schedule`, `event_settings`.
   - Pre-seeded with all **25 official hackathon problem statements** from `vsb_hackathon_ps.md`.
   - Row Level Security (RLS) configured for safe public storage uploads and downloads.

3. **Backend API Endpoints**:
   - `POST /api/team/upload`: Handles multipart file uploads directly to Supabase Storage and records the URL in `teams.submission_file_url`.
   - `POST /api/team/submit`: Saves repository, demo links, notes, and file URLs, syncing with Supabase DB.
   - `POST /api/admin/upload`: Admin file upload endpoint for schedule/guidelines documents.
   - `GET /api/storage/status`: Checks Supabase connection status in real-time.

4. **Frontend UI Integration**:
   - **Team Portal**: Interactive file upload zone supporting PPT, PDF, ZIP with real-time cloud upload status and preview link.
   - **Admin Portal**: Displays the cloud-stored file link on each team card and includes `Submission File URL` in the CSV export.

5. **Automated Migration Script (`scripts/migrate_to_supabase.js`)**:
   - One-command synchronization of all local SQLite data directly to Supabase.

---

## 🛠️ Step-by-Step Setup Instructions

### Step 1: Create a Supabase Project
1. Go to [https://supabase.com](https://supabase.com) and sign in.
2. Click **"New Project"**.
3. Choose a name (e.g., `vsb-hackathon-synapse`) and set a secure database password.
4. Select your preferred region (e.g., `ap-south-1` for Mumbai).

### Step 2: Run the Database Schema
1. In your Supabase dashboard, click **SQL Editor** on the left menu.
2. Open [`supabase_schema.sql`](file:///c:/Users/Ragav%20U/OneDrive/Desktop/Ragav%20Folder/Projects/Hackthon%20site/Hackthon%20site/supabase_schema.sql) in this project folder.
3. Copy the entire contents and paste into the Supabase SQL Editor.
4. Click **Run**.
   - *This will automatically create all tables, indexes, RLS storage policies, and pre-load all 25 problem statements.*

### Step 3: Add Credentials to `.env`
1. In your Supabase dashboard, go to **Project Settings** -> **API**.
2. Copy your **Project URL** and **`service_role`** key (or `anon` public key).
3. Open [`.env`](file:///c:/Users/Ragav%20U/OneDrive/Desktop/Ragav%20Folder/Projects/Hackthon%20site/Hackthon%20site/.env) and fill in the values:
   ```env
   SUPABASE_URL=https://your-project-id.supabase.co
   SUPABASE_KEY=your_supabase_api_key_here
   SUPABASE_STORAGE_BUCKET=hackathon-files
   ```

### Step 4: Sync Data to Supabase
Run the automated migration script in your terminal:
```bash
npm run migrate:supabase
```
This will verify the storage bucket and upload all teams, settings, and announcements to your Supabase cloud backend!
