# ⚡ SYNAPSE - 24-Hour National Level Hackathon Platform

> Organized by the **Department of Artificial Intelligence & Data Science (AI & DS)**  
> **V.S.B. Engineering College, Karur, Tamil Nadu**

A full-stack, responsive web application and management platform built specifically for conducting a 24-hour hackathon. The system provides participant team registration, problem statements showcase, dynamic schedule, real-time announcements, and a comprehensive administrative control panel with live analytics, data filtering, and reporting.

---

## 🌟 Key Features

### 🌐 Public Portal (`/`)
- **Cyberpunk / Dark Glassmorphism Design**: High-impact visual experience with animated particle background, glowing gradients, typing code simulator, and smooth transitions.
- **Multi-Step Team Registration Form**:
  - Validates 2 to 4 members per team.
  - Captures full participant details: Name, Email, Phone, College, Department, Year, and designated Team Lead.
  - Automatic validation preventing duplicate emails across teams.
  - Allows selecting problem statements directly during registration.
- **Problem Statement Explorer**:
  - Live filtering by category (AI/ML, Healthcare, Sustainability, Education, Smart City, Agriculture, etc.).
  - Search by keyword and difficulty level indicators (Easy, Medium, Hard).
- **24-Hour Timeline & Schedule**:
  - Visual timeline covering inauguration, coding phases, mentoring checkpoints, midnight snack breaks, judging rounds, and valedictory ceremony.
- **Live Announcements Feed**:
  - Urgent alerts and real-time updates for teams during the event.
- **Event Information & Stats**:
  - Live counts of registered teams, total participants, and available problem statements.
  - Comprehensive FAQs and venue/contact guidelines.

---

### 🛡️ Admin Dashboard (`/admin`)
- **JWT-Protected Authentication**: Secure login system with bcrypt-hashed credentials and token expiration.
- **Real-Time Analytics & Live Statistics**:
  - Total teams, approved teams, pending teams, checked-in teams, and rejected teams.
  - Total participant headcount.
  - CSS-based interactive visual charts:
    - **Department-wise distribution**
    - **College-wise breakdown**
    - **Year-wise distribution**
    - **Problem statement popularity**
    - **Registration status breakdown**
- **Team Management (CRUD)**:
  - Search teams by name or team leader's email.
  - Filter teams by status (`registered`, `approved`, `rejected`, `checked_in`).
  - View full team profile modal with all member contact details.
  - One-click status transitions (Approve, Reject, Check-in on hackathon day).
  - Delete team records.
- **Problem Statements Management**:
  - Add, edit, toggle visibility, and delete problem statements dynamically without touching code.
- **Announcements Center**:
  - Broadcast new announcements with priority tags (`urgent`, `high`, `normal`, `low`).
  - Toggle or delete active announcements.
- **Schedule Management**:
  - Create and manage timeline checkpoints and events.
- **Settings & Controls**:
  - Toggle registrations Open / Closed in real time.
  - Set maximum team capacity cap.
  - Customize event date, venue, contact details, and department tags.
- **Export & Reporting**:
  - **Download CSV**: Instant export of all teams and member details with single-click.
  - **Printable Hackathon Report**: Formatted print preview with summary metrics, team roster, and institutional statistics.

---

## 🛠️ Tech Stack

- **Runtime & Backend**: Node.js, Express.js
- **Database**: SQLite3 via `better-sqlite3` (WAL mode, relational integrity with foreign keys and cascade deletes)
- **Security & Auth**: `bcryptjs`, `jsonwebtoken` (JWT), CORS
- **Frontend**: Vanilla HTML5, Modern CSS3 (CSS Custom Properties, Glassmorphism, CSS Grid & Flexbox, Keyframe Animations), Vanilla JavaScript (ES6+)
- **Icons & Typography**: Font Awesome 6.5, Google Fonts (`Outfit` & `JetBrains Mono`)

---

## 📁 Project Structure

```text
Hackthon site/
├── db/
│   └── database.js          # SQLite schema creation, migrations, and seed data
├── middleware/
│   └── auth.js              # JWT verification middleware
├── public/
│   ├── admin.css            # Admin panel styling
│   ├── admin.html           # Admin portal dashboard
│   ├── admin.js             # Admin UI logic, charts, CRUD & CSV export
│   ├── app.js               # Public site logic, multi-step form, particle effects
│   ├── index.html           # Public landing & registration page
│   └── styles.css           # Public design system & cyber-glassmorphism theme
├── routes/
│   ├── admin.js             # Admin endpoints (auth, teams, stats, settings, export)
│   └── public.js            # Public endpoints (problem statements, schedule, register)
├── .env                     # Configuration & secrets
├── .gitignore               # Ignored files (node_modules, data, .env)
├── package.json             # NPM package scripts & dependencies
├── README.md                # Project documentation
└── server.js                # Express application entry point
```

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- **Node.js** v18+ installed on your system.
- **npm** (bundled with Node.js).

### 2. Installation
Clone the repository and install required packages:
```bash
git clone https://github.com/PradeepSelvi/VSB-Hackthone-platform.git
cd VSB-Hackthone-platform
npm install
```

### 3. Environment Variables
Create or verify `.env` in the root folder:
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

### 5. Accessing the Platform
- **Public Website & Registration**: [http://localhost:3000](http://localhost:3000)
- **Admin Control Panel**: [http://localhost:3000/admin](http://localhost:3000/admin)
  - **Email**: `admin@synapse.com`
  - **Password**: `synapse2026`

---

## 📡 API Reference

### Public Routes (`/api`)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/problem-statements` | List active problem statements |
| `GET` | `/api/announcements` | Retrieve recent announcements |
| `GET` | `/api/schedule` | Retrieve 24-hour timeline schedule |
| `GET` | `/api/settings` | Public event settings & parameters |
| `GET` | `/api/stats` | General registration counts & limits |
| `POST` | `/api/register` | Register new team (2-4 members with leader) |

### Admin Routes (`/api/admin`) *(Bearer Token Required)*
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/admin/login` | Admin authentication & JWT token generation |
| `GET` | `/api/admin/stats` | Comprehensive statistics, department, college & timeline charts |
| `GET` | `/api/admin/teams` | List teams with search & filter |
| `PATCH` | `/api/admin/teams/:id/status` | Update status (`registered`, `approved`, `rejected`, `checked_in`) |
| `DELETE` | `/api/admin/teams/:id` | Remove a team and associated member records |
| `GET` | `/api/admin/problem-statements` | Manage problem statements (CRUD) |
| `GET` | `/api/admin/announcements` | Manage announcements (CRUD) |
| `GET` | `/api/admin/schedule` | Manage event timeline events (CRUD) |
| `PUT` | `/api/admin/settings` | Update platform settings (Registration Open/Close, Max Teams, etc.) |
| `GET` | `/api/admin/export/teams` | Download complete registration data as CSV |

---

## 🏛️ Organized by
**Department of Artificial Intelligence & Data Science**  
**V.S.B. Engineering College**  
NH-67 Covai Road, Karur - 639 111, Tamil Nadu, India.
