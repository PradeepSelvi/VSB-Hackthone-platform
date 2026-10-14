# ⚡ SYNAPSE - 24-Hour National Level Hackathon Platform

> Organized by the **Department of Artificial Intelligence & Data Science (AI & DS)**  
> **V.S.B. Engineering College, Karur, Tamil Nadu**

A full-stack web application and event operations platform built specifically for conducting a 24-hour national-level hackathon. The system provides participant team registration with automatic SYN ID allocation, a private Team Leader workspace with check-in locked problem statements, automated fair shuffle problem allocation upon desk check-in with a 24-hour live countdown timer, and an administrative control panel with real-time analytics, filtering, and reporting.

---

## 🌟 Key Features

### 🌐 Public Portal (`/`)
- **Cyberpunk Dark Glassmorphism Design**: High-impact visual experience with animated particle background, glowing neon gradients, typing code simulator, and smooth transitions.
- **Sequential Team ID Generation (`SYN001`, `SYN002`, ...)**:
  - Every registering team is instantly issued a unique, formatted Team ID (e.g., `SYN001`).
  - Common Team Password: `Syanp2K26`.
  - Celebratory registration confirmation modal with one-click ID copying and immediate dashboard access.
- **25 Official VSB Problem Statements**:
  - Sourced directly from `vsb_hackathon_ps.md`.
  - Tracks covered: FinTech, InsurTech, HealthTech, Computer Vision, AI Mesh Networks, LegalTech, Enterprise RAG, GovTech, Blockchain Supply Chain, and Cybersecurity.
  - Interactive modal view displaying **Problem Statement**, **Problem Faced & Challenges**, and **Suggested Architecture & Solutions**.
- **24-Hour Event Timeline**:
  - Live timeline from registration desk check-in, inaugural ceremony, two mentoring rounds, midnight snack breaks, judging presentations, to the valedictory prize distribution.
- **Live Updates & Participant Statistics**:
  - Real-time registered teams, participant count, problem statements available, and broadcast announcements.

---

### 👤 Team Leader Portal (`Team Login`)
- **Login Credentials**:
  - **Login ID**: Assigned SYN Team ID (e.g., `SYN001`)
  - **Password**: `Syanp2K26`
- **Locked Problem Statement Protection**:
  - Before check-in: Problem statement is securely locked with instructions to report to the registration desk at the V.S.B. campus.
- **Automatic Unlocking Upon Admin Check-in**:
  - Once the Admin checks in the team at the desk:
    - The team's assigned problem statement is **instantly unlocked and displayed** in full detail.
    - Check-in timestamp is recorded and shown.
    - **Live 24-Hour Countdown Clock**: Displays exact hours, minutes, and seconds remaining from the check-in time (`HH:MM:SS remaining`).
- **Team Roster**:
  - Displays all registered team members with Leader crown, department, academic year, phone, email, and college.
- **Project Deliverables Submission**:
  - Allows teams to submit and update their **GitHub Repository link**, **Live Demo / Presentation URL**, and **Tech Stack notes** at any point during the 24 hours.

---

### 🛡️ Admin Dashboard (`/admin`)
- **JWT-Protected Authentication**:
  - **Email**: `admin@synapse.com`
  - **Password**: `synapse2026`
- **Real-Time Analytics & Visual CSS Charts**:
  - Total Teams, Approved Teams, Pending Teams, Checked-In Teams, and Participant headcounts.
  - Interactive charts for **Department distribution**, **College-wise breakdown**, **Academic Year breakdown**, **Problem Statement popularity**, and **Status pipeline**.
- **Desk Check-in with Fair Shuffled Allocation**:
  - **Single-Click Check-in**: Admin clicks "Check In & Assign PS" on any team.
  - The system automatically selects a problem statement using fair shuffle distribution (prioritizing least-allocated statements across all 25 challenges) and records the exact timestamp (`checked_in_at`).
  - **Re-Shuffle Button**: Allows the admin to re-shuffle or re-assign problem statements if needed.
- **Team Search & Management (CRUD)**:
  - Instant live filter by team name, team leader email, or SYN ID (`SYN001`).
  - Filter by status (`registered`, `approved`, `rejected`, `checked_in`).
- **Problem Statements Management**:
  - Full CRUD operations supporting Title, Description, Problem Faced, Suggested Solution, Category, Difficulty, and Active/Inactive toggle.
- **Announcements & Schedule Management**:
  - Broadcast alerts with priority levels (`urgent`, `high`, `normal`, `low`).
- **Export & Reporting**:
  - **Download CSV**: Comprehensive export including Team ID, Team Name, Leader Email, Status, Assigned Problem Statement, Check-in Timestamp, Project Repo, Demo Link, and all Member Contact Details.
  - **Printable Hackathon Report**: Official printable summary for college authorities and evaluators.

---

## 🛠️ Tech Stack

- **Runtime & Backend**: Node.js, Express.js (v5 compatible)
- **Database**: SQLite3 via `better-sqlite3` (WAL mode, foreign keys, cascade deletes, automated migrations)
- **Security & Authentication**: `bcryptjs`, `jsonwebtoken` (JWT for Admin and Teams), CORS
- **Frontend**: Vanilla HTML5, CSS3 Custom Properties (Cyberpunk Glassmorphism theme), Vanilla JavaScript (ES6+)
- **Typography & Icons**: Google Fonts (`Orbitron`, `Inter`, `JetBrains Mono`), Font Awesome 6.5

---

## 📁 Project Structure

```text
Hackthon site/
├── db/
│   └── database.js          # SQLite schema, migrations, and markdown PS parser
├── middleware/
│   └── auth.js              # JWT verification for Admin and Team Leader sessions
├── public/
│   ├── admin.css            # Admin panel styling & visual charts
│   ├── admin.html           # Admin portal dashboard
│   ├── admin.js             # Admin UI logic, check-in, shuffle & CSV export
│   ├── app.js               # Public site, team login, dashboard & countdown timer
│   ├── index.html           # Public landing, registration & team portal modals
│   └── styles.css           # Design tokens, glassmorphism & team portal styles
├── routes/
│   ├── admin.js             # Admin API (auth, stats, checkin, shuffle-ps, export)
│   └── public.js            # Public & Team API (register, team/login, team/dashboard, team/submit)
├── .env                     # Configuration secrets & admin credentials
├── .gitignore               # Ignored files (node_modules, data, .env)
├── package.json             # NPM package scripts & dependencies
├── README.md                # Comprehensive documentation
├── server.js                # Express application entry point
└── vsb_hackathon_ps.md      # 25 Official VSB Hackathon problem statements
```

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- **Node.js** v18+ installed on your system.
- **npm** (bundled with Node.js).

### 2. Installation
```bash
git clone https://github.com/PradeepSelvi/VSB-Hackthone-platform.git
cd VSB-Hackthone-platform
npm install
```

### 3. Environment Configuration
Verify `.env` in the root folder:
```env
PORT=3000
JWT_SECRET=synapse_hackathon_2026_vsb_secret_key
ADMIN_EMAIL=admin@synapse.com
ADMIN_PASSWORD=synapse2026
```

### 4. Running the Application
```bash
# Production start
npm start

# Development mode with auto-reload
npm run dev
```

### 5. Access Credentials
- **Public Portal & Registration**: [http://localhost:3000](http://localhost:3000)
- **Team Leader Login**: Click **"Team Login"** on top navigation
  - **Login ID**: Assigned Team ID (e.g., `SYN001`, `SYN002`)
  - **Password**: `Syanp2K26`
- **Admin Control Panel**: [http://localhost:3000/admin](http://localhost:3000/admin)
  - **Email**: `admin@synapse.com`
  - **Password**: `synapse2026`

---

## 📡 API Reference

### Public & Team Routes (`/api`)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/problem-statements` | List 25 active problem statements |
| `GET` | `/api/announcements` | Retrieve active announcements |
| `GET` | `/api/schedule` | Retrieve 24-hour event timeline |
| `GET` | `/api/stats` | General registration counts & limits |
| `POST` | `/api/register` | Register team (2-4 members, auto `SYN001` ID allocation) |
| `POST` | `/api/team/login` | Team Leader login using SYN ID & `Syanp2K26` |
| `GET` | `/api/team/dashboard` | Team Dashboard (unlocked PS with timestamp after check-in) |
| `POST` | `/api/team/submit` | Submit project GitHub repo, demo URL, and tech stack notes |

### Admin Routes (`/api/admin`) *(Bearer Token Required)*
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/admin/login` | Admin authentication & JWT token generation |
| `GET` | `/api/admin/stats` | Analytics, department, college & timeline charts |
| `GET` | `/api/admin/teams` | List teams with search by name, email, or SYN ID |
| `POST` | `/api/admin/teams/:id/checkin` | Check in team, fair-shuffle PS allocation, record timestamp |
| `POST` | `/api/admin/teams/:id/shuffle-ps`| Re-shuffle or assign new problem statement |
| `PATCH` | `/api/admin/teams/:id/status` | Update team status |
| `DELETE` | `/api/admin/teams/:id` | Delete team and cascade members |
| `GET` | `/api/admin/export/teams` | Download complete registration data as CSV |

---

## 🏛️ Organized by
**Department of Artificial Intelligence & Data Science**  
**V.S.B. Engineering College**  
NH-67 Covai Road, Karur - 639 111, Tamil Nadu, India.
