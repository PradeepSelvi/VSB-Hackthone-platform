/* ================================================
   SYNAPSE - Admin Panel JavaScript
   ================================================ */

const API_BASE = '/api/admin';
let token = localStorage.getItem('synapse_admin_token');
let adminInfo = JSON.parse(localStorage.getItem('synapse_admin_info') || '{}');
let allTeams = [];

// ====== Initialize ======
document.addEventListener('DOMContentLoaded', () => {
    if (token) {
        showDashboard();
    }
    initLogin();
    initSidebar();
});

// ====== Auth ======
function initLogin() {
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('loginBtn');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> Logging in...';

        try {
            const res = await fetch(`${API_BASE}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: document.getElementById('loginEmail').value,
                    password: document.getElementById('loginPassword').value
                })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            token = data.token;
            adminInfo = data.admin;
            localStorage.setItem('synapse_admin_token', token);
            localStorage.setItem('synapse_admin_info', JSON.stringify(adminInfo));

            showDashboard();
        } catch (err) {
            showToast(err.message || 'Login failed', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Login';
        }
    });
}

function showDashboard() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('adminDashboard').style.display = 'flex';
    document.getElementById('adminName').textContent = adminInfo.name || 'Admin';
    loadDashboard();
}

function logout() {
    token = null;
    adminInfo = {};
    localStorage.removeItem('synapse_admin_token');
    localStorage.removeItem('synapse_admin_info');
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('adminDashboard').style.display = 'none';
}

// ====== API Helper ======
async function apiCall(url, method = 'GET', body = null) {
    const opts = {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        }
    };
    if (body) opts.body = JSON.stringify(body);
    
    const res = await fetch(url, opts);
    if (res.status === 401 || res.status === 403) {
        logout();
        showToast('Session expired. Please login again.', 'error');
        throw new Error('Unauthorized');
    }
    return res;
}

// ====== Sidebar ======
function initSidebar() {
    const sidebar = document.getElementById('sidebar');
    const menuToggle = document.getElementById('menuToggle');
    const sidebarClose = document.getElementById('sidebarClose');

    menuToggle?.addEventListener('click', () => sidebar.classList.add('open'));
    sidebarClose?.addEventListener('click', () => sidebar.classList.remove('open'));
}

// ====== Page Navigation ======
function showPage(page) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(`page-${page}`).classList.add('active');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelector(`[data-page="${page}"]`)?.classList.add('active');

    const titles = {
        dashboard: 'Dashboard', teams: 'Team Management',
        problems: 'Problem Statements', announcements: 'Announcements',
        schedule: 'Event Schedule', settings: 'Settings'
    };
    document.getElementById('pageTitle').textContent = titles[page] || page;

    // Close mobile sidebar
    document.getElementById('sidebar').classList.remove('open');

    // Load page data
    switch (page) {
        case 'dashboard': loadDashboard(); break;
        case 'teams': loadTeams(); break;
        case 'problems': loadProblemStatements(); break;
        case 'announcements': loadAnnouncements(); break;
        case 'schedule': loadSchedule(); break;
        case 'settings': loadSettings(); break;
    }
}

// ====== Dashboard ======
async function loadDashboard() {
    try {
        const res = await apiCall(`${API_BASE}/stats`);
        const stats = await res.json();

        document.getElementById('adminStatTeams').textContent = stats.totalTeams;
        document.getElementById('adminStatParticipants').textContent = stats.totalParticipants;
        document.getElementById('adminStatApproved').textContent = stats.approvedTeams;
        document.getElementById('adminStatPending').textContent = stats.pendingTeams;
        document.getElementById('adminStatRejected').textContent = stats.rejectedTeams;
        document.getElementById('adminStatCheckedIn').textContent = stats.checkedInTeams;

        renderDeptChart(stats.deptStats);
        renderStatusChart(stats.statusBreakdown, stats.totalTeams);
        renderYearChart(stats.yearStats);
        renderPSChart(stats.psStats);
        renderCollegeTable(stats.collegeStats);
    } catch (err) {
        console.error('Dashboard load error:', err);
    }
}

function renderDeptChart(data) {
    const container = document.getElementById('deptChart');
    if (!data.length) {
        container.innerHTML = '<p style="color: var(--text-muted); text-align:center;">No data yet</p>';
        return;
    }

    const max = Math.max(...data.map(d => d.count));
    const colors = ['#6c5ce7', '#00cec9', '#fd79a8', '#fdcb6e', '#55efc4', '#a29bfe', '#ff6b6b', '#74b9ff'];

    container.innerHTML = `
        <div class="bar-chart">
            ${data.slice(0, 8).map((d, i) => `
                <div class="bar-item">
                    <div class="bar" style="height: ${(d.count / max) * 100}%; background: ${colors[i % colors.length]};" data-value="${d.count}"></div>
                    <span class="bar-label">${d.department.split(' ')[0]}</span>
                </div>
            `).join('')}
        </div>
    `;
}

function renderStatusChart(data, total) {
    const container = document.getElementById('statusChart');
    if (!data.length || total === 0) {
        container.innerHTML = '<p style="color: var(--text-muted); text-align:center;">No data yet</p>';
        return;
    }

    const statusColors = {
        registered: '#a29bfe', approved: '#55efc4',
        rejected: '#ff6b6b', checked_in: '#00cec9'
    };

    const statusLabels = {
        registered: 'Registered', approved: 'Approved',
        rejected: 'Rejected', checked_in: 'Checked In'
    };

    // Build conic-gradient
    let gradientParts = [];
    let currentAngle = 0;
    data.forEach(d => {
        const angle = (d.count / total) * 360;
        const color = statusColors[d.status] || '#6c5ce7';
        gradientParts.push(`${color} ${currentAngle}deg ${currentAngle + angle}deg`);
        currentAngle += angle;
    });

    container.innerHTML = `
        <div class="donut-chart">
            <div class="donut-visual" style="background: conic-gradient(${gradientParts.join(', ')});">
                <div class="donut-center">${total}</div>
            </div>
            <div class="donut-legend">
                ${data.map(d => `
                    <div class="legend-item">
                        <span class="legend-dot" style="background: ${statusColors[d.status] || '#6c5ce7'};"></span>
                        ${statusLabels[d.status] || d.status}: ${d.count}
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

function renderYearChart(data) {
    const container = document.getElementById('yearChart');
    if (!data.length) {
        container.innerHTML = '<p style="color: var(--text-muted); text-align:center;">No data yet</p>';
        return;
    }

    const max = Math.max(...data.map(d => d.count));
    const colors = ['#55efc4', '#00cec9', '#6c5ce7', '#fd79a8'];

    container.innerHTML = `
        <div class="bar-chart">
            ${data.map((d, i) => `
                <div class="bar-item">
                    <div class="bar" style="height: ${(d.count / max) * 100}%; background: ${colors[i % colors.length]};" data-value="${d.count}"></div>
                    <span class="bar-label">${d.year}</span>
                </div>
            `).join('')}
        </div>
    `;
}

function renderPSChart(data) {
    const container = document.getElementById('psChart');
    if (!data.length) {
        container.innerHTML = '<p style="color: var(--text-muted); text-align:center;">No data yet</p>';
        return;
    }

    const max = Math.max(...data.map(d => d.team_count), 1);
    const colors = ['#6c5ce7', '#00cec9', '#fd79a8', '#fdcb6e', '#55efc4', '#a29bfe'];

    container.innerHTML = `
        <div class="bar-chart">
            ${data.map((d, i) => `
                <div class="bar-item">
                    <div class="bar" style="height: ${(d.team_count / max) * 100}%; background: ${colors[i % colors.length]};" data-value="${d.team_count}"></div>
                    <span class="bar-label" title="${d.title}">${d.title.substring(0, 12)}${d.title.length > 12 ? '…' : ''}</span>
                </div>
            `).join('')}
        </div>
    `;
}

function renderCollegeTable(data) {
    const tbody = document.querySelector('#collegeTable tbody');
    if (!data.length) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color: var(--text-muted);">No data yet</td></tr>';
        return;
    }
    tbody.innerHTML = data.map(d => `
        <tr>
            <td>${d.college}</td>
            <td>${d.teams}</td>
            <td>${d.members}</td>
        </tr>
    `).join('');
}

// ====== Teams ======
async function loadTeams() {
    try {
        const status = document.getElementById('teamStatusFilter')?.value || 'all';
        const search = document.getElementById('teamSearch')?.value || '';
        
        const res = await apiCall(`${API_BASE}/teams?status=${status}&search=${encodeURIComponent(search)}`);
        allTeams = await res.json();
        renderTeams(allTeams);
    } catch (err) {
        console.error('Load teams error:', err);
    }
}

function filterTeams() {
    loadTeams();
}

function renderTeams(teams) {
    const container = document.getElementById('teamsList');
    if (!teams.length) {
        container.innerHTML = '<div style="text-align:center; padding:3rem; color:var(--text-muted);"><i class="fas fa-users" style="font-size:2rem; margin-bottom:1rem; display:block;"></i>No teams found</div>';
        return;
    }

    container.innerHTML = teams.map(team => `
        <div class="team-card">
            <div class="team-card-header">
                <div>
                    <h4>${team.team_name}</h4>
                    <span class="status-badge status-${team.status}">${team.status.replace('_', ' ')}</span>
                </div>
                <div class="team-actions">
                    ${team.status === 'registered' ? `
                        <button class="btn btn-success btn-sm" onclick="updateTeamStatus(${team.id}, 'approved')"><i class="fas fa-check"></i> Approve</button>
                        <button class="btn btn-danger btn-sm" onclick="updateTeamStatus(${team.id}, 'rejected')"><i class="fas fa-times"></i> Reject</button>
                    ` : ''}
                    ${team.status === 'approved' ? `
                        <button class="btn btn-primary btn-sm" onclick="updateTeamStatus(${team.id}, 'checked_in')"><i class="fas fa-door-open"></i> Check In</button>
                    ` : ''}
                    <button class="btn btn-outline btn-sm" onclick="deleteTeam(${team.id})" style="color: var(--accent-red);"><i class="fas fa-trash"></i></button>
                </div>
            </div>
            <div class="team-meta">
                <span><i class="fas fa-envelope"></i> ${team.team_lead_email}</span>
                <span><i class="fas fa-users"></i> ${team.team_size} members</span>
                <span><i class="fas fa-calendar"></i> ${new Date(team.registered_at).toLocaleDateString()}</span>
                ${team.problem_statement_title ? `<span><i class="fas fa-clipboard"></i> ${team.problem_statement_title}</span>` : ''}
            </div>
            <div class="members-grid">
                ${(team.members || []).map(m => `
                    <div class="member-pill">
                        <div class="member-avatar">${m.name.charAt(0).toUpperCase()}</div>
                        <div class="member-info">
                            <span class="name">${m.name} ${m.is_leader ? '👑' : ''}</span>
                            <span class="detail">${m.department} | ${m.year}</span>
                            <span class="detail">${m.email} | ${m.phone}</span>
                            <span class="detail">${m.college}</span>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `).join('');
}

async function updateTeamStatus(id, status) {
    try {
        await apiCall(`${API_BASE}/teams/${id}/status`, 'PATCH', { status });
        showToast(`Team ${status === 'approved' ? 'approved' : status === 'rejected' ? 'rejected' : 'checked in'} successfully!`, 'success');
        loadTeams();
    } catch (err) {
        showToast('Failed to update status', 'error');
    }
}

async function deleteTeam(id) {
    if (!confirm('Are you sure you want to delete this team?')) return;
    try {
        await apiCall(`${API_BASE}/teams/${id}`, 'DELETE');
        showToast('Team deleted', 'success');
        loadTeams();
    } catch (err) {
        showToast('Failed to delete team', 'error');
    }
}

// ====== Problem Statements ======
async function loadProblemStatements() {
    try {
        const res = await apiCall(`${API_BASE}/problem-statements`);
        const data = await res.json();
        renderPSList(data);
    } catch (err) {
        console.error('Load PS error:', err);
    }
}

function renderPSList(items) {
    const container = document.getElementById('psAdminList');
    if (!items.length) {
        container.innerHTML = '<div style="text-align:center; padding:3rem; color:var(--text-muted);"><i class="fas fa-lightbulb" style="font-size:2rem; margin-bottom:1rem; display:block;"></i>No problem statements yet</div>';
        return;
    }

    container.innerHTML = items.map(item => `
        <div class="item-card" style="opacity: ${item.is_active ? '1' : '0.5'}">
            <div class="item-card-header">
                <h4>${item.title}</h4>
                <div style="display:flex; gap:0.5rem;">
                    <button class="btn btn-outline btn-sm" onclick="editPS(${item.id})"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-outline btn-sm" onclick="deletePS(${item.id})" style="color:var(--accent-red)"><i class="fas fa-trash"></i></button>
                </div>
            </div>
            <p>${item.description}</p>
            <div class="item-meta">
                <span class="tag">${item.category}</span>
                <span class="tag" style="background:rgba(${item.difficulty==='easy'?'85,239,196':item.difficulty==='medium'?'253,203,110':'255,107,107'},0.15); color:${item.difficulty==='easy'?'var(--accent-green)':item.difficulty==='medium'?'var(--accent-orange)':'var(--accent-red)'};">${item.difficulty}</span>
                <span>${item.is_active ? '✅ Active' : '❌ Inactive'}</span>
            </div>
        </div>
    `).join('');
}

function showPSModal(editData = null) {
    const title = editData ? 'Edit Problem Statement' : 'Add Problem Statement';
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBody').innerHTML = `
        <form id="psForm" onsubmit="submitPS(event, ${editData ? editData.id : 'null'})">
            <div class="form-group">
                <label>Title</label>
                <input type="text" id="psTitle" value="${editData?.title || ''}" required>
            </div>
            <div class="form-group">
                <label>Description</label>
                <textarea id="psDescription" rows="4" required style="width:100%;padding:0.75rem;background:rgba(10,10,20,0.6);border:1px solid var(--glass-border);border-radius:10px;color:var(--text-primary);font-family:var(--font-body);font-size:0.9rem;outline:none;resize:vertical;">${editData?.description || ''}</textarea>
            </div>
            <div class="form-group">
                <label>Category</label>
                <input type="text" id="psCategory" value="${editData?.category || ''}" required placeholder="e.g., AI/ML, Healthcare, Education">
            </div>
            <div class="form-group">
                <label>Difficulty</label>
                <select id="psDifficulty">
                    <option value="easy" ${editData?.difficulty === 'easy' ? 'selected' : ''}>Easy</option>
                    <option value="medium" ${!editData || editData?.difficulty === 'medium' ? 'selected' : ''}>Medium</option>
                    <option value="hard" ${editData?.difficulty === 'hard' ? 'selected' : ''}>Hard</option>
                </select>
            </div>
            ${editData ? `
                <div class="form-group">
                    <label class="toggle-label">
                        <span>Active</span>
                        <div class="toggle-switch">
                            <input type="checkbox" id="psActive" ${editData.is_active ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </div>
                    </label>
                </div>
            ` : ''}
            <div class="form-actions">
                <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> ${editData ? 'Update' : 'Create'}</button>
            </div>
        </form>
    `;
    openModal();
}

async function editPS(id) {
    try {
        const res = await apiCall(`${API_BASE}/problem-statements`);
        const all = await res.json();
        const item = all.find(p => p.id === id);
        if (item) showPSModal(item);
    } catch (err) {
        showToast('Error loading problem statement', 'error');
    }
}

async function submitPS(e, id) {
    e.preventDefault();
    const data = {
        title: document.getElementById('psTitle').value,
        description: document.getElementById('psDescription').value,
        category: document.getElementById('psCategory').value,
        difficulty: document.getElementById('psDifficulty').value,
    };
    if (id) data.is_active = document.getElementById('psActive').checked;

    try {
        if (id) {
            await apiCall(`${API_BASE}/problem-statements/${id}`, 'PUT', data);
            showToast('Problem statement updated', 'success');
        } else {
            await apiCall(`${API_BASE}/problem-statements`, 'POST', data);
            showToast('Problem statement created', 'success');
        }
        closeModal();
        loadProblemStatements();
    } catch (err) {
        showToast('Failed to save', 'error');
    }
}

async function deletePS(id) {
    if (!confirm('Delete this problem statement?')) return;
    try {
        await apiCall(`${API_BASE}/problem-statements/${id}`, 'DELETE');
        showToast('Problem statement deleted', 'success');
        loadProblemStatements();
    } catch (err) {
        showToast('Failed to delete', 'error');
    }
}

// ====== Announcements ======
async function loadAnnouncements() {
    try {
        const res = await apiCall(`${API_BASE}/announcements`);
        const data = await res.json();
        renderAnnouncementsList(data);
    } catch (err) {
        console.error('Load announcements error:', err);
    }
}

function renderAnnouncementsList(items) {
    const container = document.getElementById('announcementsAdminList');
    if (!items.length) {
        container.innerHTML = '<div style="text-align:center; padding:3rem; color:var(--text-muted);"><i class="fas fa-bullhorn" style="font-size:2rem; margin-bottom:1rem; display:block;"></i>No announcements yet</div>';
        return;
    }

    const priorityColors = { low: '#55efc4', normal: '#6c5ce7', high: '#fdcb6e', urgent: '#ff6b6b' };

    container.innerHTML = items.map(item => `
        <div class="item-card" style="opacity: ${item.is_active ? '1' : '0.5'}; border-left: 3px solid ${priorityColors[item.priority]};">
            <div class="item-card-header">
                <h4>${item.title}</h4>
                <div style="display:flex; gap:0.5rem;">
                    <button class="btn btn-outline btn-sm" onclick="editAnnouncement(${item.id})"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-outline btn-sm" onclick="deleteAnnouncement(${item.id})" style="color:var(--accent-red)"><i class="fas fa-trash"></i></button>
                </div>
            </div>
            <p>${item.message}</p>
            <div class="item-meta">
                <span class="tag" style="background:rgba(${item.priority==='urgent'?'255,107,107':item.priority==='high'?'253,203,110':item.priority==='low'?'85,239,196':'108,92,231'},0.15);">${item.priority}</span>
                <span>${item.is_active ? '✅ Active' : '❌ Inactive'}</span>
                <span>${new Date(item.created_at).toLocaleString()}</span>
            </div>
        </div>
    `).join('');
}

function showAnnouncementModal(editData = null) {
    const title = editData ? 'Edit Announcement' : 'New Announcement';
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBody').innerHTML = `
        <form id="announcementForm" onsubmit="submitAnnouncement(event, ${editData ? editData.id : 'null'})">
            <div class="form-group">
                <label>Title</label>
                <input type="text" id="annTitle" value="${editData?.title || ''}" required>
            </div>
            <div class="form-group">
                <label>Message</label>
                <textarea id="annMessage" rows="4" required style="width:100%;padding:0.75rem;background:rgba(10,10,20,0.6);border:1px solid var(--glass-border);border-radius:10px;color:var(--text-primary);font-family:var(--font-body);font-size:0.9rem;outline:none;resize:vertical;">${editData?.message || ''}</textarea>
            </div>
            <div class="form-group">
                <label>Priority</label>
                <select id="annPriority">
                    <option value="low" ${editData?.priority === 'low' ? 'selected' : ''}>Low</option>
                    <option value="normal" ${!editData || editData?.priority === 'normal' ? 'selected' : ''}>Normal</option>
                    <option value="high" ${editData?.priority === 'high' ? 'selected' : ''}>High</option>
                    <option value="urgent" ${editData?.priority === 'urgent' ? 'selected' : ''}>Urgent</option>
                </select>
            </div>
            ${editData ? `
                <div class="form-group">
                    <label class="toggle-label">
                        <span>Active</span>
                        <div class="toggle-switch">
                            <input type="checkbox" id="annActive" ${editData.is_active ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </div>
                    </label>
                </div>
            ` : ''}
            <div class="form-actions">
                <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> ${editData ? 'Update' : 'Create'}</button>
            </div>
        </form>
    `;
    openModal();
}

async function editAnnouncement(id) {
    try {
        const res = await apiCall(`${API_BASE}/announcements`);
        const all = await res.json();
        const item = all.find(a => a.id === id);
        if (item) showAnnouncementModal(item);
    } catch (err) {
        showToast('Error loading announcement', 'error');
    }
}

async function submitAnnouncement(e, id) {
    e.preventDefault();
    const data = {
        title: document.getElementById('annTitle').value,
        message: document.getElementById('annMessage').value,
        priority: document.getElementById('annPriority').value,
    };
    if (id) data.is_active = document.getElementById('annActive').checked;

    try {
        if (id) {
            await apiCall(`${API_BASE}/announcements/${id}`, 'PUT', data);
            showToast('Announcement updated', 'success');
        } else {
            await apiCall(`${API_BASE}/announcements`, 'POST', data);
            showToast('Announcement published', 'success');
        }
        closeModal();
        loadAnnouncements();
    } catch (err) {
        showToast('Failed to save', 'error');
    }
}

async function deleteAnnouncement(id) {
    if (!confirm('Delete this announcement?')) return;
    try {
        await apiCall(`${API_BASE}/announcements/${id}`, 'DELETE');
        showToast('Announcement deleted', 'success');
        loadAnnouncements();
    } catch (err) {
        showToast('Failed to delete', 'error');
    }
}

// ====== Schedule ======
async function loadSchedule() {
    try {
        const res = await apiCall(`${API_BASE}/schedule`);
        const data = await res.json();
        renderScheduleList(data);
    } catch (err) {
        console.error('Load schedule error:', err);
    }
}

function renderScheduleList(items) {
    const container = document.getElementById('scheduleAdminList');
    if (!items.length) {
        container.innerHTML = '<div style="text-align:center; padding:3rem; color:var(--text-muted);"><i class="fas fa-calendar" style="font-size:2rem; margin-bottom:1rem; display:block;"></i>No schedule events yet</div>';
        return;
    }

    const typeColors = { general: '#6c5ce7', workshop: '#00cec9', break: '#fdcb6e', judging: '#fd79a8', ceremony: '#55efc4' };

    container.innerHTML = items.map(item => `
        <div class="item-card" style="opacity: ${item.is_active ? '1' : '0.5'}; border-left: 3px solid ${typeColors[item.event_type] || '#6c5ce7'};">
            <div class="item-card-header">
                <h4>${item.title}</h4>
                <div style="display:flex; gap:0.5rem;">
                    <button class="btn btn-outline btn-sm" onclick="editSchedule(${item.id})"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-outline btn-sm" onclick="deleteSchedule(${item.id})" style="color:var(--accent-red)"><i class="fas fa-trash"></i></button>
                </div>
            </div>
            <p>${item.description || ''}</p>
            <div class="item-meta">
                <span class="tag">${item.event_type}</span>
                <span><i class="fas fa-clock"></i> ${formatDateTime(item.start_time)}${item.end_time ? ' - ' + formatDateTime(item.end_time) : ''}</span>
                ${item.location ? `<span><i class="fas fa-map-marker-alt"></i> ${item.location}</span>` : ''}
                <span>${item.is_active ? '✅ Active' : '❌ Inactive'}</span>
            </div>
        </div>
    `).join('');
}

function showScheduleModal(editData = null) {
    const title = editData ? 'Edit Schedule Event' : 'Add Schedule Event';
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBody').innerHTML = `
        <form id="scheduleForm" onsubmit="submitSchedule(event, ${editData ? editData.id : 'null'})">
            <div class="form-group">
                <label>Event Title</label>
                <input type="text" id="schTitle" value="${editData?.title || ''}" required>
            </div>
            <div class="form-group">
                <label>Description</label>
                <textarea id="schDescription" rows="3" style="width:100%;padding:0.75rem;background:rgba(10,10,20,0.6);border:1px solid var(--glass-border);border-radius:10px;color:var(--text-primary);font-family:var(--font-body);font-size:0.9rem;outline:none;resize:vertical;">${editData?.description || ''}</textarea>
            </div>
            <div class="form-group">
                <label>Start Time</label>
                <input type="datetime-local" id="schStartTime" value="${editData?.start_time ? editData.start_time.replace(' ', 'T') : ''}" required>
            </div>
            <div class="form-group">
                <label>End Time</label>
                <input type="datetime-local" id="schEndTime" value="${editData?.end_time ? editData.end_time.replace(' ', 'T') : ''}">
            </div>
            <div class="form-group">
                <label>Location</label>
                <input type="text" id="schLocation" value="${editData?.location || ''}">
            </div>
            <div class="form-group">
                <label>Event Type</label>
                <select id="schType">
                    <option value="general" ${editData?.event_type === 'general' ? 'selected' : ''}>General</option>
                    <option value="workshop" ${editData?.event_type === 'workshop' ? 'selected' : ''}>Workshop</option>
                    <option value="break" ${editData?.event_type === 'break' ? 'selected' : ''}>Break</option>
                    <option value="judging" ${editData?.event_type === 'judging' ? 'selected' : ''}>Judging</option>
                    <option value="ceremony" ${editData?.event_type === 'ceremony' ? 'selected' : ''}>Ceremony</option>
                </select>
            </div>
            ${editData ? `
                <div class="form-group">
                    <label class="toggle-label">
                        <span>Active</span>
                        <div class="toggle-switch">
                            <input type="checkbox" id="schActive" ${editData.is_active ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </div>
                    </label>
                </div>
            ` : ''}
            <div class="form-actions">
                <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> ${editData ? 'Update' : 'Create'}</button>
            </div>
        </form>
    `;
    openModal();
}

async function editSchedule(id) {
    try {
        const res = await apiCall(`${API_BASE}/schedule`);
        const all = await res.json();
        const item = all.find(s => s.id === id);
        if (item) showScheduleModal(item);
    } catch (err) {
        showToast('Error loading schedule event', 'error');
    }
}

async function submitSchedule(e, id) {
    e.preventDefault();
    const data = {
        title: document.getElementById('schTitle').value,
        description: document.getElementById('schDescription').value,
        start_time: document.getElementById('schStartTime').value.replace('T', ' '),
        end_time: document.getElementById('schEndTime').value?.replace('T', ' ') || null,
        location: document.getElementById('schLocation').value,
        event_type: document.getElementById('schType').value,
    };
    if (id) data.is_active = document.getElementById('schActive').checked;

    try {
        if (id) {
            await apiCall(`${API_BASE}/schedule/${id}`, 'PUT', data);
            showToast('Schedule updated', 'success');
        } else {
            await apiCall(`${API_BASE}/schedule`, 'POST', data);
            showToast('Schedule event created', 'success');
        }
        closeModal();
        loadSchedule();
    } catch (err) {
        showToast('Failed to save', 'error');
    }
}

async function deleteSchedule(id) {
    if (!confirm('Delete this schedule event?')) return;
    try {
        await apiCall(`${API_BASE}/schedule/${id}`, 'DELETE');
        showToast('Schedule event deleted', 'success');
        loadSchedule();
    } catch (err) {
        showToast('Failed to delete', 'error');
    }
}

// ====== Settings ======
async function loadSettings() {
    try {
        const res = await apiCall(`${API_BASE}/settings`);
        const settings = await res.json();

        document.getElementById('set_event_name').value = settings.event_name || '';
        document.getElementById('set_event_tagline').value = settings.event_tagline || '';
        document.getElementById('set_event_date').value = settings.event_date || '';
        document.getElementById('set_event_venue').value = settings.event_venue || '';
        document.getElementById('set_event_department').value = settings.event_department || '';
        document.getElementById('set_max_teams').value = settings.max_teams || '50';
        document.getElementById('set_contact_email').value = settings.contact_email || '';
        document.getElementById('set_contact_phone').value = settings.contact_phone || '';
        document.getElementById('set_event_description').value = settings.event_description || '';
        document.getElementById('set_registration_open').checked = settings.registration_open === '1';
    } catch (err) {
        console.error('Load settings error:', err);
    }
}

async function saveSettings(e) {
    e.preventDefault();
    const settings = {
        event_name: document.getElementById('set_event_name').value,
        event_tagline: document.getElementById('set_event_tagline').value,
        event_date: document.getElementById('set_event_date').value,
        event_venue: document.getElementById('set_event_venue').value,
        event_department: document.getElementById('set_event_department').value,
        max_teams: document.getElementById('set_max_teams').value,
        contact_email: document.getElementById('set_contact_email').value,
        contact_phone: document.getElementById('set_contact_phone').value,
        event_description: document.getElementById('set_event_description').value,
        registration_open: document.getElementById('set_registration_open').checked ? '1' : '0',
    };

    try {
        await apiCall(`${API_BASE}/settings`, 'PUT', settings);
        showToast('Settings saved successfully!', 'success');
    } catch (err) {
        showToast('Failed to save settings', 'error');
    }
}

// ====== Export ======
async function exportCSV() {
    try {
        const res = await fetch(`${API_BASE}/export/teams`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'synapse_teams_export.csv';
        a.click();
        window.URL.revokeObjectURL(url);
        showToast('CSV exported successfully!', 'success');
    } catch (err) {
        showToast('Export failed', 'error');
    }
}

function printReport() {
    window.print();
}

// ====== Modal ======
function openModal() {
    document.getElementById('modalOverlay').style.display = 'flex';
}

function closeModal() {
    document.getElementById('modalOverlay').style.display = 'none';
}

// Close modal on overlay click
document.addEventListener('click', (e) => {
    if (e.target.id === 'modalOverlay') closeModal();
});

// Close modal on Escape
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
});

// ====== Utilities ======
function formatDateTime(dt) {
    try {
        return new Date(dt.replace(' ', 'T')).toLocaleString('en-US', {
            month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: true
        });
    } catch {
        return dt;
    }
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const icons = {
        success: 'fas fa-check-circle',
        error: 'fas fa-times-circle',
        info: 'fas fa-info-circle'
    };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<i class="${icons[type] || icons.info}"></i><span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideOutRight 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}
