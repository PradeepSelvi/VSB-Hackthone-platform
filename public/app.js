/* ================================================
   SYNAPSE - Public Site JavaScript
   ================================================ */

const API_BASE = '/api';

// ====== State ======
let problemStatements = [];
let currentStep = 1;
let registrationOpen = true;

// ====== Initialize ======
document.addEventListener('DOMContentLoaded', () => {
    initParticles();
    initNavbar();
    initCodeTyping();
    loadPublicData();
    initRegistrationForm();
    initScrollAnimations();
});

// ====== Particles Animation ======
function initParticles() {
    const container = document.getElementById('particles');
    for (let i = 0; i < 30; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.left = Math.random() * 100 + '%';
        particle.style.animationDelay = Math.random() * 8 + 's';
        particle.style.animationDuration = (6 + Math.random() * 6) + 's';
        const colors = ['#6c5ce7', '#00cec9', '#fd79a8', '#fdcb6e', '#a29bfe'];
        particle.style.background = colors[Math.floor(Math.random() * colors.length)];
        particle.style.width = (2 + Math.random() * 3) + 'px';
        particle.style.height = particle.style.width;
        container.appendChild(particle);
    }
}

// ====== Navbar ======
function initNavbar() {
    const navbar = document.getElementById('navbar');
    const navToggle = document.getElementById('navToggle');
    const navLinks = document.getElementById('navLinks');

    window.addEventListener('scroll', () => {
        navbar.classList.toggle('scrolled', window.scrollY > 50);
    });

    navToggle.addEventListener('click', () => {
        navLinks.classList.toggle('active');
        navToggle.classList.toggle('active');
    });

    // Close mobile menu on link click
    navLinks.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', () => {
            navLinks.classList.remove('active');
            navToggle.classList.remove('active');
        });
    });
}

// ====== Code Typing Animation ======
function initCodeTyping() {
    const codeEl = document.getElementById('codeTyping');
    const codeLines = [
        { text: '<span class="comment"># SYNAPSE - 24hr Hackathon</span>', delay: 0 },
        { text: '<span class="keyword">import</span> <span class="function">innovation</span>', delay: 100 },
        { text: '<span class="keyword">from</span> <span class="function">teams</span> <span class="keyword">import</span> <span class="function">creativity</span>', delay: 200 },
        { text: '', delay: 300 },
        { text: '<span class="decorator">@hackathon</span>(<span class="string">"24_hours"</span>)', delay: 400 },
        { text: '<span class="keyword">class</span> <span class="function">Synapse</span>:', delay: 500 },
        { text: '    venue <span class="operator">=</span> <span class="string">"VSB Engg College"</span>', delay: 600 },
        { text: '    dept <span class="operator">=</span> <span class="string">"AI & Data Science"</span>', delay: 700 },
        { text: '    team_size <span class="operator">=</span> <span class="number">2</span> <span class="operator">to</span> <span class="number">4</span>', delay: 800 },
        { text: '', delay: 900 },
        { text: '    <span class="keyword">def</span> <span class="function">build</span>(self, idea):', delay: 1000 },
        { text: '        solution <span class="operator">=</span> self.<span class="function">innovate</span>(idea)', delay: 1100 },
        { text: '        <span class="keyword">return</span> solution.<span class="function">deploy</span>()', delay: 1200 },
        { text: '', delay: 1300 },
        { text: '<span class="comment"># Let\'s hack! 🚀</span>', delay: 1400 },
        { text: 'synapse <span class="operator">=</span> <span class="function">Synapse</span>()', delay: 1500 },
        { text: 'synapse.<span class="function">start</span>()', delay: 1600 },
    ];

    let currentLine = 0;
    function typeLine() {
        if (currentLine < codeLines.length) {
            const line = codeLines[currentLine];
            setTimeout(() => {
                codeEl.innerHTML += line.text + '\n';
                currentLine++;
                typeLine();
            }, 120);
        }
    }
    typeLine();
}

// ====== Load Public Data ======
async function loadPublicData() {
    try {
        const [statsRes, psRes, scheduleRes, announcementsRes, settingsRes] = await Promise.all([
            fetch(`${API_BASE}/stats`),
            fetch(`${API_BASE}/problem-statements`),
            fetch(`${API_BASE}/schedule`),
            fetch(`${API_BASE}/announcements`),
            fetch(`${API_BASE}/settings`)
        ]);

        const stats = await statsRes.json();
        const ps = await psRes.json();
        const schedule = await scheduleRes.json();
        const announcements = await announcementsRes.json();
        const settings = await settingsRes.json();

        problemStatements = ps;
        registrationOpen = stats.registrationOpen;

        // Update stats
        animateCounter('statTeams', stats.totalTeams);
        animateCounter('statParticipants', stats.totalParticipants);
        animateCounter('statProblems', stats.totalProblemStatements);

        // Render sections
        renderSchedule(schedule);
        renderProblems(ps);
        renderAnnouncements(announcements);
        populateProblemSelect(ps);
        updateSettings(settings);

        // Check registration status
        if (!registrationOpen) {
            document.getElementById('registrationContainer').querySelector('.step-indicator').style.display = 'none';
            document.getElementById('registrationForm').style.display = 'none';
            document.getElementById('regClosed').style.display = 'block';
        }

    } catch (err) {
        console.error('Error loading data:', err);
    }
}

// ====== Animate Counter ======
function animateCounter(id, target) {
    const el = document.getElementById(id);
    if (!el) return;
    let current = 0;
    const increment = Math.ceil(target / 40);
    const timer = setInterval(() => {
        current += increment;
        if (current >= target) {
            current = target;
            clearInterval(timer);
        }
        el.textContent = current;
    }, 30);
}

// ====== Render Schedule ======
function renderSchedule(schedule) {
    const container = document.getElementById('scheduleTimeline');
    if (!schedule.length) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-calendar-times"></i><p>Schedule coming soon!</p></div>';
        return;
    }

    container.innerHTML = schedule.map(item => {
        const startTime = formatTime(item.start_time);
        const endTime = item.end_time ? formatTime(item.end_time) : '';
        const timeStr = endTime ? `${startTime} - ${endTime}` : startTime;

        return `
            <div class="timeline-item">
                <div class="timeline-content">
                    <span class="event-type-badge badge-${item.event_type}">${item.event_type}</span>
                    <span class="time"><i class="fas fa-clock"></i> ${timeStr}</span>
                    <h4>${item.title}</h4>
                    <p>${item.description || ''}</p>
                    ${item.location ? `<span class="location"><i class="fas fa-map-marker-alt"></i> ${item.location}</span>` : ''}
                </div>
                <div class="timeline-dot"></div>
            </div>
        `;
    }).join('');
}

// ====== Render Problems ======
function renderProblems(problems) {
    const grid = document.getElementById('problemsGrid');
    const filterBar = document.getElementById('filterBar');

    // Generate filter buttons
    const categories = [...new Set(problems.map(p => p.category))];
    filterBar.innerHTML = `<button class="filter-btn active" data-filter="all">All</button>` +
        categories.map(c => `<button class="filter-btn" data-filter="${c}">${c}</button>`).join('');

    // Attach filter events
    filterBar.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            filterBar.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const filter = btn.dataset.filter;
            renderProblemCards(filter === 'all' ? problems : problems.filter(p => p.category === filter));
        });
    });

    renderProblemCards(problems);
}

function renderProblemCards(problems) {
    const grid = document.getElementById('problemsGrid');
    if (!problems.length) {
        grid.innerHTML = '<div class="empty-state"><i class="fas fa-clipboard"></i><p>No problem statements available yet.</p></div>';
        return;
    }

    grid.innerHTML = problems.map((p, i) => `
        <div class="problem-card" style="animation-delay: ${i * 0.1}s">
            <div class="problem-header">
                <span class="problem-id">PS-${String(p.id).padStart(3, '0')}</span>
                <span class="difficulty difficulty-${p.difficulty}">
                    <i class="fas fa-signal"></i> ${p.difficulty}
                </span>
            </div>
            <h3>${p.title}</h3>
            <p>${p.description}</p>
            <div class="problem-meta">
                <span class="problem-category"><i class="fas fa-tag"></i> ${p.category}</span>
            </div>
        </div>
    `).join('');
}

// ====== Render Announcements ======
function renderAnnouncements(announcements) {
    const list = document.getElementById('announcementsList');
    if (!announcements.length) {
        list.innerHTML = '<div class="empty-state"><i class="fas fa-bell-slash"></i><p>No announcements yet. Check back soon!</p></div>';
        return;
    }

    const priorityIcons = {
        low: 'fas fa-info-circle',
        normal: 'fas fa-bullhorn',
        high: 'fas fa-exclamation-triangle',
        urgent: 'fas fa-fire'
    };

    list.innerHTML = announcements.map(a => `
        <div class="announcement-card">
            <div class="announcement-priority priority-${a.priority}">
                <i class="${priorityIcons[a.priority] || 'fas fa-bullhorn'}"></i>
            </div>
            <div class="announcement-body">
                <h4>${a.title}</h4>
                <p>${a.message}</p>
                <span class="announcement-time"><i class="fas fa-clock"></i> ${formatDate(a.created_at)}</span>
            </div>
        </div>
    `).join('');
}

// ====== Populate Problem Statement Select ======
function populateProblemSelect(problems) {
    const select = document.getElementById('problemStatement');
    problems.forEach(p => {
        const option = document.createElement('option');
        option.value = p.id;
        option.textContent = `[${p.category}] ${p.title} (${p.difficulty})`;
        select.appendChild(option);
    });
}

// ====== Update Settings ======
function updateSettings(settings) {
    if (settings.contact_email) {
        const el = document.getElementById('contactEmail');
        if (el) el.textContent = settings.contact_email;
    }
    if (settings.contact_phone) {
        const el = document.getElementById('contactPhone');
        if (el) el.textContent = settings.contact_phone;
    }
}

// ====== Registration Form ======
function initRegistrationForm() {
    const form = document.getElementById('registrationForm');
    const teamSizeSelect = document.getElementById('teamSize');

    teamSizeSelect.addEventListener('change', () => {
        generateMemberForms(parseInt(teamSizeSelect.value));
    });

    form.addEventListener('submit', handleRegistration);
}

function generateMemberForms(count) {
    const container = document.getElementById('membersContainer');
    if (!count || isNaN(count)) {
        container.innerHTML = '';
        return;
    }

    const years = ['1st Year', '2nd Year', '3rd Year', '4th Year'];
    const departments = [
        'AI & Data Science', 'Computer Science', 'Information Technology',
        'Electronics & Communication', 'Electrical & Electronics', 'Mechanical',
        'Civil', 'Biomedical', 'Chemical', 'Other'
    ];

    container.innerHTML = '';
    for (let i = 0; i < count; i++) {
        const isLeader = i === 0;
        container.innerHTML += `
            <div class="member-card">
                <div class="member-card-header">
                    <h4><i class="fas fa-user"></i> Member ${i + 1}</h4>
                    ${isLeader ? '<span class="leader-badge"><i class="fas fa-crown"></i> Team Leader</span>' : ''}
                </div>
                <div class="member-fields">
                    <div class="form-group">
                        <label>Name <span class="required">*</span></label>
                        <input type="text" name="member_name_${i}" placeholder="Full name" required>
                    </div>
                    <div class="form-group">
                        <label>Email <span class="required">*</span></label>
                        <input type="email" name="member_email_${i}" placeholder="Email address" required>
                    </div>
                    <div class="form-group">
                        <label>Phone <span class="required">*</span></label>
                        <input type="tel" name="member_phone_${i}" placeholder="Phone number" required pattern="[0-9]{10}">
                    </div>
                    <div class="form-group">
                        <label>Year <span class="required">*</span></label>
                        <select name="member_year_${i}" required>
                            <option value="">Select year</option>
                            ${years.map(y => `<option value="${y}">${y}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Department <span class="required">*</span></label>
                        <select name="member_dept_${i}" required>
                            <option value="">Select department</option>
                            ${departments.map(d => `<option value="${d}">${d}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>College <span class="required">*</span></label>
                        <input type="text" name="member_college_${i}" placeholder="College name" required value="V.S.B Engineering College, Karur">
                    </div>
                </div>
            </div>
        `;
    }
}

// ====== Step Navigation ======
function nextStep(step) {
    if (!validateCurrentStep()) return;

    if (step === 3) {
        renderReview();
    }

    currentStep = step;
    updateStepUI();
}

function prevStep(step) {
    currentStep = step;
    updateStepUI();
}

function updateStepUI() {
    // Update step indicators
    document.querySelectorAll('.step').forEach(s => {
        const stepNum = parseInt(s.dataset.step);
        s.classList.remove('active', 'completed');
        if (stepNum === currentStep) s.classList.add('active');
        if (stepNum < currentStep) s.classList.add('completed');
    });

    // Update form steps
    document.querySelectorAll('.form-step').forEach(s => s.classList.remove('active'));
    document.getElementById(`step${currentStep}`).classList.add('active');
}

function validateCurrentStep() {
    if (currentStep === 1) {
        const teamName = document.getElementById('teamName').value.trim();
        const teamSize = document.getElementById('teamSize').value;
        if (!teamName) {
            showToast('Please enter a team name', 'error');
            return false;
        }
        if (!teamSize) {
            showToast('Please select team size', 'error');
            return false;
        }
        // Generate member forms if not done
        const container = document.getElementById('membersContainer');
        if (!container.children.length) {
            generateMemberForms(parseInt(teamSize));
        }
        return true;
    }

    if (currentStep === 2) {
        const teamSize = parseInt(document.getElementById('teamSize').value);
        for (let i = 0; i < teamSize; i++) {
            const name = document.querySelector(`[name="member_name_${i}"]`)?.value.trim();
            const email = document.querySelector(`[name="member_email_${i}"]`)?.value.trim();
            const phone = document.querySelector(`[name="member_phone_${i}"]`)?.value.trim();
            const year = document.querySelector(`[name="member_year_${i}"]`)?.value;
            const dept = document.querySelector(`[name="member_dept_${i}"]`)?.value;
            const college = document.querySelector(`[name="member_college_${i}"]`)?.value.trim();

            if (!name || !email || !phone || !year || !dept || !college) {
                showToast(`Please fill all details for Member ${i + 1}`, 'error');
                return false;
            }

            // Email validation
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                showToast(`Invalid email for Member ${i + 1}`, 'error');
                return false;
            }

            // Phone validation
            if (!/^[0-9]{10}$/.test(phone)) {
                showToast(`Invalid phone number for Member ${i + 1} (10 digits required)`, 'error');
                return false;
            }
        }
        return true;
    }

    return true;
}

function renderReview() {
    const reviewContent = document.getElementById('reviewContent');
    const teamName = document.getElementById('teamName').value;
    const teamSize = parseInt(document.getElementById('teamSize').value);
    const psSelect = document.getElementById('problemStatement');
    const psText = psSelect.options[psSelect.selectedIndex].text;

    let html = `
        <div class="review-section">
            <h4><i class="fas fa-users"></i> TEAM INFORMATION</h4>
            <div class="review-row">
                <span class="review-label">Team Name</span>
                <span class="review-value">${teamName}</span>
            </div>
            <div class="review-row">
                <span class="review-label">Team Size</span>
                <span class="review-value">${teamSize} Members</span>
            </div>
            <div class="review-row">
                <span class="review-label">Problem Statement</span>
                <span class="review-value">${psSelect.value ? psText : 'Not Selected'}</span>
            </div>
        </div>
    `;

    for (let i = 0; i < teamSize; i++) {
        const name = document.querySelector(`[name="member_name_${i}"]`).value;
        const email = document.querySelector(`[name="member_email_${i}"]`).value;
        const phone = document.querySelector(`[name="member_phone_${i}"]`).value;
        const year = document.querySelector(`[name="member_year_${i}"]`).value;
        const dept = document.querySelector(`[name="member_dept_${i}"]`).value;
        const college = document.querySelector(`[name="member_college_${i}"]`).value;

        html += `
            <div class="review-section">
                <h4><i class="fas fa-user"></i> MEMBER ${i + 1} ${i === 0 ? '(Leader)' : ''}</h4>
                <div class="review-row"><span class="review-label">Name</span><span class="review-value">${name}</span></div>
                <div class="review-row"><span class="review-label">Email</span><span class="review-value">${email}</span></div>
                <div class="review-row"><span class="review-label">Phone</span><span class="review-value">${phone}</span></div>
                <div class="review-row"><span class="review-label">Year</span><span class="review-value">${year}</span></div>
                <div class="review-row"><span class="review-label">Department</span><span class="review-value">${dept}</span></div>
                <div class="review-row"><span class="review-label">College</span><span class="review-value">${college}</span></div>
            </div>
        `;
    }

    reviewContent.innerHTML = html;
}

// ====== Handle Registration ======
async function handleRegistration(e) {
    e.preventDefault();

    const submitBtn = document.getElementById('submitBtn');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner"></span> Submitting...';

    const teamName = document.getElementById('teamName').value.trim();
    const teamSize = parseInt(document.getElementById('teamSize').value);
    const psId = document.getElementById('problemStatement').value;

    const members = [];
    for (let i = 0; i < teamSize; i++) {
        members.push({
            name: document.querySelector(`[name="member_name_${i}"]`).value.trim(),
            email: document.querySelector(`[name="member_email_${i}"]`).value.trim(),
            phone: document.querySelector(`[name="member_phone_${i}"]`).value.trim(),
            year: document.querySelector(`[name="member_year_${i}"]`).value,
            department: document.querySelector(`[name="member_dept_${i}"]`).value,
            college: document.querySelector(`[name="member_college_${i}"]`).value.trim(),
            is_leader: i === 0
        });
    }

    try {
        const res = await fetch(`${API_BASE}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                team_name: teamName,
                problem_statement_id: psId || null,
                members
            })
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.error || 'Registration failed');
        }

        // Show success
        document.getElementById('registrationForm').style.display = 'none';
        document.querySelector('.step-indicator').style.display = 'none';
        document.getElementById('successMessage').style.display = 'block';
        document.getElementById('registrationDetails').innerHTML = `
            <div class="review-section" style="text-align:left; margin-bottom: 1.5rem;">
                <div class="review-row"><span class="review-label">Team ID</span><span class="review-value">#${data.teamId}</span></div>
                <div class="review-row"><span class="review-label">Team Name</span><span class="review-value">${data.teamName}</span></div>
            </div>
        `;

        showToast('Team registered successfully!', 'success');

        // Reload stats
        loadPublicData();

    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Registration';
    }
}

function resetRegistration() {
    document.getElementById('registrationForm').style.display = 'block';
    document.getElementById('registrationForm').reset();
    document.querySelector('.step-indicator').style.display = 'flex';
    document.getElementById('successMessage').style.display = 'none';
    document.getElementById('membersContainer').innerHTML = '';
    currentStep = 1;
    updateStepUI();
}

// ====== Scroll Animations ======
function initScrollAnimations() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, { threshold: 0.1 });

    document.querySelectorAll('.about-card, .problem-card, .timeline-item, .announcement-card').forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(30px)';
        el.style.transition = 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)';
        observer.observe(el);
    });
}

// ====== Utility Functions ======
function formatTime(datetime) {
    try {
        const d = new Date(datetime);
        return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    } catch {
        return datetime;
    }
}

function formatDate(datetime) {
    try {
        const d = new Date(datetime);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
        return datetime;
    }
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const icons = {
        success: 'fas fa-check-circle',
        error: 'fas fa-times-circle',
        info: 'fas fa-info-circle',
        warning: 'fas fa-exclamation-triangle'
    };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<i class="${icons[type]}"></i><span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideOutRight 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}
