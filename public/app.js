/* ================================================
   SYNAPSE - Public Site JavaScript
   ================================================ */

const API_BASE = '/api';

// ====== Security Sanitization (XSS Prevention) ======
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

// ====== State ======
let problemStatements = [];
let currentStep = 1;
let registrationOpen = true;

// ====== Spider-Man Web Shoot Page Routing & Drag System ======
let isPageTransitioning = false;
let activePage = 'home';

function initPageRouting() {
    // Intercept clicks on internal navigation links or data-page triggers
    document.addEventListener('click', (e) => {
        const trigger = e.target.closest('[data-page], a[href^="#"]');
        if (!trigger) return;

        // Skip modals or accordion buttons that aren't page transitions
        if (trigger.closest('#teamPortalModal, #psDetailModal, .filter-btn, .nav-toggle, .site-modal, .step')) return;

        let targetPage = trigger.getAttribute('data-page');
        if (!targetPage) {
            const href = trigger.getAttribute('href');
            if (href && href.startsWith('#')) {
                targetPage = href.replace('#', '');
            }
        }

        if (!targetPage) return;
        if (targetPage === 'hero') targetPage = 'home';
        if (targetPage === 'announcements') targetPage = 'updates';

        const validPages = ['home', 'about', 'timeline', 'problems', 'updates', 'register'];
        if (validPages.includes(targetPage)) {
            e.preventDefault();
            switchPage(targetPage);
        }
    });

    // Handle browser back/forward buttons
    window.addEventListener('hashchange', () => {
        let hash = (window.location.hash || '').replace('#', '').trim();
        if (hash === 'hero') hash = 'home';
        if (hash === 'announcements') hash = 'updates';
        if (hash && hash !== activePage) {
            switchPage(hash);
        }
    });

    // Check initial hash on load
    let initialHash = (window.location.hash || '').replace('#', '').trim();
    if (initialHash === 'hero') initialHash = 'home';
    if (initialHash === 'announcements') initialHash = 'updates';
    if (initialHash && document.getElementById(`page-${initialHash}`)) {
        switchPage(initialHash, true);
    } else {
        switchPage('home', true);
    }
}

function switchPage(targetPage, skipAnimation = false) {
    if (!targetPage) targetPage = 'home';
    if (targetPage === 'hero') targetPage = 'home';
    if (targetPage === 'announcements') targetPage = 'updates';

    const targetEl = document.getElementById(`page-${targetPage}`);
    if (!targetEl) return;
    if (activePage === targetPage && !skipAnimation) return;

    const currentEl = document.getElementById(`page-${activePage}`);
    const overlay = document.getElementById('webShootOverlay');

    // Update active state on nav links
    document.querySelectorAll('.nav-link, .nav-logo').forEach(link => {
        const page = link.getAttribute('data-page') || (link.getAttribute('href') || '').replace('#', '');
        if (page === targetPage || (targetPage === 'home' && page === 'hero')) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });

    // Close mobile nav menu if open
    const navLinks = document.getElementById('navLinks');
    const navToggle = document.getElementById('navToggle');
    if (navLinks && navLinks.classList.contains('active')) {
        navLinks.classList.remove('active');
        if (navToggle) navToggle.classList.remove('active');
    }

    if (skipAnimation || !currentEl || currentEl === targetEl) {
        document.querySelectorAll('.page-view').forEach(p => {
            p.classList.remove('active', 'web-drag-out', 'web-drag-in');
        });
        targetEl.classList.add('active');
        activePage = targetPage;
        window.scrollTo({ top: 0, behavior: 'instant' });
        history.replaceState(null, '', `#${targetPage}`);
        revealPageCards(targetEl);
        return;
    }

    if (isPageTransitioning) return;
    isPageTransitioning = true;

    // 1. Fire Spider-Man Web Shoot Animation
    if (overlay) {
        overlay.classList.remove('shooting');
        void overlay.offsetWidth; // Force reflow
        overlay.classList.add('shooting');
    }

    // 2. Drag out current page (web yank)
    currentEl.classList.remove('active', 'web-drag-in');
    currentEl.classList.add('web-drag-out');

    // 3. Sling-shot incoming page into view
    setTimeout(() => {
        currentEl.classList.remove('web-drag-out');

        targetEl.classList.remove('web-drag-out');
        targetEl.classList.add('active', 'web-drag-in');
        activePage = targetPage;
        window.scrollTo({ top: 0, behavior: 'instant' });
        history.replaceState(null, '', `#${targetPage}`);
        revealPageCards(targetEl);

        setTimeout(() => {
            targetEl.classList.remove('web-drag-in');
            if (overlay) overlay.classList.remove('shooting');
            isPageTransitioning = false;
        }, 500);
    }, 280);
}

function revealPageCards(container) {
    if (!container) return;
    container.querySelectorAll('.about-card, .problem-card, .timeline-item, .announcement-card, .stat-card, .glass-card').forEach(el => {
        el.style.opacity = '1';
        el.style.transform = 'translateY(0)';
    });
}

// ====== Admin Shortcut (Ctrl + Shift + A) ======
function initAdminShortcut() {
    window.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'A' || e.key === 'a' || e.code === 'KeyA')) {
            e.preventDefault();
            window.location.href = '/admin.html';
        }
    });
}

// ====== Initialize ======
document.addEventListener('DOMContentLoaded', () => {
    initParticles();
    initNavbar();
    initPageRouting();
    initCodeTyping();
    initFallingTitle();
    loadPublicData();
    initRegistrationForm();
    initScrollAnimations();
    initAdminShortcut();
});

// ====== Falling-apart Hero Title (hover each letter -> plunge to bottom) ======
function initFallingTitle() {
    const heroTitle = document.querySelector('.hero-title');
    if (!heroTitle || heroTitle.dataset.fallingInit) return;
    heroTitle.dataset.fallingInit = '1';

    const titleLine = heroTitle.querySelector('.title-line');
    const titleSub = heroTitle.querySelector('.title-sub');

    function splitIntoChars(el) {
        if (!el) return;
        const rawText = el.textContent.trim();
        el.innerHTML = [...rawText].map(c => {
            if (c === ' ') {
                return '<span class="fall-space">&nbsp;</span>';
            }
            return `<span class="fall-char">${c}</span>`;
        }).join('');
    }

    splitIntoChars(titleLine);
    splitIntoChars(titleSub);

    function triggerCharFall(ch) {
        if (ch.classList.contains('falling')) return;

        const rect = ch.getBoundingClientRect();
        const heroRect = heroTitle.getBoundingClientRect();

        // Drop completely past the bottom of the viewport
        const dropDistance = Math.max(window.innerHeight - rect.top + 220, 800);
        const ty = (dropDistance + Math.random() * 250).toFixed(0) + 'px';

        // Lateral break apart: outward drift based on position relative to center
        const centerOffset = (rect.left + rect.width / 2) - (heroRect.left + heroRect.width / 2);
        const dir = centerOffset >= 0 ? 1 : -1;
        const tx = (dir * (40 + Math.random() * 120) + (Math.random() - 0.5) * 60).toFixed(0) + 'px';

        // Realistic tumbling rotation as it falls
        const rot = ((Math.random() - 0.5) * 360).toFixed(0) + 'deg';

        // Snappy responsive fall
        const dur = (0.75 + Math.random() * 0.3).toFixed(2) + 's';

        ch.style.setProperty('--tx', tx);
        ch.style.setProperty('--ty', ty);
        ch.style.setProperty('--rot', rot);
        ch.style.setProperty('--dur', dur);
        ch.style.setProperty('--delay', '0s');

        ch.classList.add('falling');

        // Smoothly slingshot character back into place after 2.2s
        setTimeout(() => {
            ch.classList.remove('falling');
        }, 2200);
    }

    const allChars = heroTitle.querySelectorAll('.fall-char');
    allChars.forEach(ch => {
        ch.addEventListener('mouseenter', () => triggerCharFall(ch));
        ch.addEventListener('touchstart', () => triggerCharFall(ch), { passive: true });
    });
}

// ====== Particles Animation ======
function initParticles() {
    const container = document.getElementById('particles');
    for (let i = 0; i < 30; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.left = Math.random() * 100 + '%';
        particle.style.animationDelay = Math.random() * 8 + 's';
        particle.style.animationDuration = (6 + Math.random() * 6) + 's';
        const colors = ['#cc0000', '#ff3333', '#1565c0', '#ff1744', '#d0cdd8', '#42a5f5', '#ff6f00'];
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
    if (!codeEl) return;
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
        const results = await Promise.allSettled([
            fetch(`${API_BASE}/stats`).then(r => r.ok ? r.json() : null),
            fetch(`${API_BASE}/problem-statements`).then(r => r.ok ? r.json() : []),
            fetch(`${API_BASE}/schedule`).then(r => r.ok ? r.json() : []),
            fetch(`${API_BASE}/announcements`).then(r => r.ok ? r.json() : []),
            fetch(`${API_BASE}/settings`).then(r => r.ok ? r.json() : {})
        ]);

        const stats = results[0].status === 'fulfilled' && results[0].value ? results[0].value : { totalTeams: 0, totalParticipants: 0, totalProblemStatements: 25, registrationOpen: true };
        const ps = results[1].status === 'fulfilled' && Array.isArray(results[1].value) ? results[1].value : [];
        const schedule = results[2].status === 'fulfilled' && Array.isArray(results[2].value) ? results[2].value : [];
        const announcements = results[3].status === 'fulfilled' && Array.isArray(results[3].value) ? results[3].value : [];
        const settings = results[4].status === 'fulfilled' && results[4].value ? results[4].value : {};

        problemStatements = ps;
        registrationOpen = stats.registrationOpen !== false;

        // Update stats
        if (stats) {
            animateCounter('statTeams', stats.totalTeams || 0);
            animateCounter('statParticipants', stats.totalParticipants || 0);
            animateCounter('statProblems', stats.totalProblemStatements || ps.length || 25);
        }

        // Render sections safely
        if (schedule) renderSchedule(schedule);
        if (ps) {
            renderProblems(ps);
            renderProblemTicker(ps);
        }
        if (announcements) renderAnnouncements(announcements);
        if (ps) populateProblemSelect(ps);
        if (settings) updateSettings(settings);

        // Check registration status
        if (!registrationOpen) {
            const rc = document.getElementById('registrationContainer');
            if (rc) {
                const si = rc.querySelector('.step-indicator');
                if (si) si.style.display = 'none';
            }
            const rf = document.getElementById('registrationForm');
            if (rf) rf.style.display = 'none';
            const rcMsg = document.getElementById('regClosed');
            if (rcMsg) rcMsg.style.display = 'block';
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

// ====== Problem Statements Running Marquee Ticker ======
function renderProblemTicker(problems) {
    const tracks = [
        document.getElementById('psTickerContent'),
        document.getElementById('psTickerContentProblems')
    ].filter(Boolean);

    if (!tracks.length) return;
    if (!problems || !problems.length) {
        tracks.forEach(track => {
            track.innerHTML = `
                <span class="ps-ticker-item">📌 Problem Statements will be announced shortly! Stay tuned!</span>
            `;
        });
        return;
    }

    const itemsHtml = problems.map((p) => {
        const psNum = p.ps_number != null ? `PS #${String(p.ps_number).padStart(2, '0')}` : `PS-${String(p.id).padStart(2, '0')}`;
        const cat = p.category ? `<span class="ps-ticker-cat">${escapeHtml(p.category)}</span>` : '';
        const desc = p.description ? escapeHtml(p.description.trim()) : '';
        return `
            <div class="ps-ticker-item" onclick="handleTickerPSClick(${p.id})" title="Click to view full details for ${escapeHtml(p.title)}">
                <span class="ps-ticker-pin">📌</span>
                <span class="ps-ticker-num">${psNum}</span>
                <span class="ps-ticker-title">${escapeHtml(p.title)}:</span>
                <span class="ps-ticker-desc">${desc}</span>
                ${cat}
                <span class="ps-ticker-sep">•</span>
            </div>
        `;
    }).join('');

    const totalItems = problems.length * 2;
    const scrollSec = Math.max(90, Math.round(totalItems * 6.5));

    tracks.forEach(track => {
        // Duplicate content twice to create a seamless infinite loop
        track.innerHTML = itemsHtml + itemsHtml;
        track.style.animationDuration = `${scrollSec}s`;
    });
}

function handleTickerPSClick(id) {
    if (typeof switchPage === 'function') {
        switchPage('problems');
    }
    setTimeout(() => {
        if (typeof openPSDetail === 'function') {
            openPSDetail(id);
        }
    }, 280);
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
        <div class="problem-card" style="animation-delay: ${Math.min(i * 0.05, 1)}s">
            <div class="problem-header">
                <span class="problem-id">PS-${String(p.ps_number || p.id).padStart(3, '0')}</span>
                <span class="difficulty difficulty-${p.difficulty}">
                    <i class="fas fa-signal"></i> ${p.difficulty}
                </span>
            </div>
            <h3>${p.title}</h3>
            <p>${p.description ? (p.description.length > 150 ? p.description.substring(0, 150) + '...' : p.description) : ''}</p>
            <div class="problem-meta" style="display: flex; justify-content: space-between; align-items: center; margin-top: 1rem;">
                <span class="problem-category"><i class="fas fa-tag"></i> ${p.category}</span>
                <button class="btn btn-outline btn-sm" onclick="openPSDetail(${p.id})" style="padding: 0.35rem 0.8rem; font-size: 0.82rem;">
                    <i class="fas fa-eye"></i> Details
                </button>
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
    if (!select) return;
    // Reset options to prevent duplicate entries on repeated loads (Issue #12)
    select.innerHTML = '<option value="">-- Choose a Problem Statement (Optional) --</option>';
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

        const teamCode = data.teamCode || ('SYN' + String(data.teamId).padStart(3, '0'));
        const defaultPassword = data.defaultPassword || 'Syanp2K26';

        document.getElementById('registrationDetails').innerHTML = `
            <div class="credentials-banner">
                <span style="font-size: 0.85rem; text-transform: uppercase; letter-spacing: 1.5px; color: var(--accent-secondary); font-weight: 600;">Allocated Team ID</span>
                <div class="team-id-display">${teamCode}</div>
                <div class="copy-btn-group">
                    <button class="btn btn-outline btn-sm" onclick="copyToClipboard('${teamCode}')"><i class="fas fa-copy"></i> Copy Team ID</button>
                </div>
                <div class="credential-item" style="margin-top: 1rem;">
                    <span><i class="fas fa-key"></i> Team Leader Password:</span>
                    <strong style="color: var(--accent-cyan); font-family: var(--font-mono); font-size: 1.05rem;">${defaultPassword}</strong>
                </div>
                <p style="font-size: 0.88rem; color: var(--text-secondary); margin-top: 0.9rem; line-height: 1.5;">
                    Please save this ID! Your team leader will use <strong>${teamCode}</strong> and password <strong>${defaultPassword}</strong> to log in. Your problem statement will be shuffled and unlocked automatically upon check-in at the V.S.B. registration desk.
                </p>
                <div style="margin-top: 1.25rem;">
                    <button class="btn btn-primary" onclick="quickLoginTeam('${teamCode}', '${defaultPassword}')">
                        <i class="fas fa-sign-in-alt"></i> Open Team Leader Dashboard
                    </button>
                </div>
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
    if (!datetime) return '';
    try {
        const d = new Date(typeof datetime === 'string' && datetime.includes(' ') && !datetime.includes('T') ? datetime.replace(' ', 'T') : datetime);
        if (isNaN(d.getTime())) return escapeHtml(String(datetime));
        return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    } catch {
        return escapeHtml(String(datetime || ''));
    }
}

function formatDate(datetime) {
    if (!datetime) return '';
    try {
        const d = new Date(typeof datetime === 'string' && datetime.includes(' ') && !datetime.includes('T') ? datetime.replace(' ', 'T') : datetime);
        if (isNaN(d.getTime())) return escapeHtml(String(datetime));
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
        return escapeHtml(String(datetime || ''));
    }
}

function formatDateTime(datetime) {
    if (!datetime) return '';
    try {
        const d = new Date(typeof datetime === 'string' && datetime.includes(' ') && !datetime.includes('T') ? datetime.replace(' ', 'T') : datetime);
        if (isNaN(d.getTime())) return escapeHtml(String(datetime));
        return d.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        });
    } catch {
        return escapeHtml(String(datetime || ''));
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
    toast.innerHTML = `<i class="${icons[type] || icons.info}"></i><span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideOutRight 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// ====== Copy to Clipboard Helper ======
function copyToClipboard(text) {
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => {
            showToast(`Copied ${text} to clipboard!`, 'success');
        }).catch(() => {
            fallbackCopy(text);
        });
    } else {
        fallbackCopy(text);
    }
}

function fallbackCopy(text) {
    const el = document.createElement('textarea');
    el.value = text;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    showToast(`Copied ${text} to clipboard!`, 'success');
}

// ====== Problem Statement Detail Modal ======
function openPSDetail(id) {
    const ps = problemStatements.find(p => p.id === id);
    if (!ps) return;

    const modal = document.getElementById('psDetailModal');
    const titleEl = document.getElementById('psDetailModalTitle');
    const bodyEl = document.getElementById('psDetailModalBody');

    titleEl.innerHTML = `<i class="fas fa-file-code"></i> PS-${String(ps.ps_number || ps.id).padStart(3, '0')}: ${escapeHtml(ps.title)}`;

    bodyEl.innerHTML = `
        <div class="ps-detail-card">
            <div style="display: flex; gap: 0.5rem; margin-bottom: 1rem; flex-wrap: wrap;">
                <span class="problem-category"><i class="fas fa-tag"></i> ${escapeHtml(ps.category)}</span>
                <span class="difficulty difficulty-${escapeHtml(ps.difficulty)}"><i class="fas fa-signal"></i> ${escapeHtml(ps.difficulty)}</span>
            </div>
            
            <div class="ps-detail-section" style="margin-top: 0; padding-top: 0; border-top: none;">
                <h5><i class="fas fa-bullseye"></i> Problem Statement</h5>
                <p>${escapeHtml(ps.description)}</p>
            </div>

            ${ps.problem_faced ? `
            <div class="ps-detail-section">
                <h5><i class="fas fa-exclamation-triangle"></i> Problem Faced & Challenges</h5>
                <p>${escapeHtml(ps.problem_faced)}</p>
            </div>
            ` : ''}

            ${ps.suggested_solution ? `
            <div class="ps-detail-section">
                <h5><i class="fas fa-lightbulb"></i> Suggested Approach & Solution</h5>
                <p>${escapeHtml(ps.suggested_solution)}</p>
            </div>
            ` : ''}
        </div>
        <div style="text-align: right;">
            <button class="btn btn-outline" onclick="closePSModal()">Close</button>
        </div>
    `;

    modal.style.display = 'flex';
}

function closePSModal() {
    const modal = document.getElementById('psDetailModal');
    if (modal) modal.style.display = 'none';
}

// ====== Team Portal & Leader Dashboard ======
let teamCountdownInterval = null;

function openTeamPortal() {
    const modal = document.getElementById('teamPortalModal');
    modal.style.display = 'flex';

    const token = localStorage.getItem('synapse_team_token');
    if (token) {
        loadTeamDashboard();
    } else {
        renderTeamLoginForm();
    }
}

function closeTeamPortal() {
    const modal = document.getElementById('teamPortalModal');
    if (modal) modal.style.display = 'none';
    if (teamCountdownInterval) {
        clearInterval(teamCountdownInterval);
        teamCountdownInterval = null;
    }
}

function renderTeamLoginForm(prefillCode = '') {
    const bodyEl = document.getElementById('teamPortalBody');
    const titleEl = document.getElementById('teamPortalTitle');
    titleEl.innerHTML = `<i class="fas fa-id-badge"></i> Team Leader Login`;

    bodyEl.innerHTML = `
        <div style="max-width: 440px; margin: 0 auto;">
            <p style="color: var(--text-secondary); margin-bottom: 1.5rem; text-align: center; font-size: 0.95rem;">
                Sign in with your assigned <strong>SYN Team ID</strong> to view your team profile and access your unlocked problem statement.
            </p>
            <form onsubmit="handleTeamLogin(event)">
                <div class="form-group" style="margin-bottom: 1.25rem;">
                    <label style="display: block; margin-bottom: 0.5rem; color: var(--text-secondary); font-size: 0.9rem;">
                        <i class="fas fa-id-card"></i> Team ID (SYN ID)
                    </label>
                    <input type="text" id="loginTeamCode" value="${prefillCode}" placeholder="e.g. SYN001" required 
                           style="width: 100%; padding: 0.8rem 1rem; border-radius: 8px; background: rgba(10,10,15,0.7); border: 1px solid rgba(108,92,231,0.3); color: white; font-family: var(--font-mono); font-size: 1.1rem; text-transform: uppercase;">
                </div>
                <div class="form-group" style="margin-bottom: 1.5rem;">
                    <label style="display: block; margin-bottom: 0.5rem; color: var(--text-secondary); font-size: 0.9rem;">
                        <i class="fas fa-lock"></i> Password
                    </label>
                    <input type="password" id="loginTeamPassword" value="Syanp2K26" placeholder="Password (default: Syanp2K26)" required 
                           style="width: 100%; padding: 0.8rem 1rem; border-radius: 8px; background: rgba(10,10,15,0.7); border: 1px solid rgba(108,92,231,0.3); color: white; font-family: var(--font-mono);">
                    <span style="display: block; font-size: 0.8rem; color: var(--text-muted); margin-top: 0.4rem;">
                        <i class="fas fa-info-circle"></i> Common password for all teams: <code>Syanp2K26</code>
                    </span>
                </div>
                <button type="submit" class="btn btn-primary btn-lg" style="width: 100%; justify-content: center;" id="teamLoginBtn">
                    <i class="fas fa-sign-in-alt"></i> Login to Dashboard
                </button>
            </form>
            <div style="text-align: center; margin-top: 1.5rem; font-size: 0.88rem; color: var(--text-muted);">
                Don't have a Team ID yet? <span style="color: var(--accent-secondary); font-weight: 600;">Ask The Coordinators for confirmation</span>
            </div>
        </div>
    `;
}

async function handleTeamLogin(e) {
    e.preventDefault();
    const btn = document.getElementById('teamLoginBtn');
    const code = document.getElementById('loginTeamCode').value.trim();
    const pass = document.getElementById('loginTeamPassword').value;

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Signing in...';

    try {
        const res = await fetch(`${API_BASE}/team/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ team_code: code, password: pass })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Login failed');

        localStorage.setItem('synapse_team_token', data.token);
        localStorage.setItem('synapse_team_info', JSON.stringify(data.team));
        showToast('Signed in successfully!', 'success');
        loadTeamDashboard();
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Login to Dashboard';
        }
    }
}

async function quickLoginTeam(code, password) {
    openTeamPortal();
    try {
        const res = await fetch(`${API_BASE}/team/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ team_code: code, password: password })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Login failed');

        localStorage.setItem('synapse_team_token', data.token);
        localStorage.setItem('synapse_team_info', JSON.stringify(data.team));
        loadTeamDashboard();
    } catch (err) {
        renderTeamLoginForm(code);
    }
}

async function loadTeamDashboard() {
    const token = localStorage.getItem('synapse_team_token');
    if (!token) return renderTeamLoginForm();

    const bodyEl = document.getElementById('teamPortalBody');
    bodyEl.innerHTML = `
        <div style="text-align: center; padding: 3rem; color: var(--text-muted);">
            <div class="spinner" style="width: 32px; height: 32px; margin-bottom: 1rem;"></div>
            <p>Loading your team dashboard...</p>
        </div>
    `;

    try {
        const res = await fetch(`${API_BASE}/team/dashboard`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.status === 401 || res.status === 403 || res.status === 404) {
            localStorage.removeItem('synapse_team_token');
            localStorage.removeItem('synapse_team_info');
            return renderTeamLoginForm();
        }
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load dashboard');

        renderTeamDashboard(data);
    } catch (err) {
        showToast(err.message, 'error');
        renderTeamLoginForm();
    }
}

function renderTeamDashboard(data) {
    const titleEl = document.getElementById('teamPortalTitle');
    const bodyEl = document.getElementById('teamPortalBody');
    const team = data.team;
    const ps = data.problem_statement;

    titleEl.innerHTML = `<i class="fas fa-users-cog"></i> Team Dashboard: ${team.team_name} (${team.team_code})`;

    const statusBadges = {
        registered: '<span class="status-badge status-registered" style="background:rgba(253,203,110,0.2); color:var(--accent-orange); padding:0.25rem 0.75rem; border-radius:12px; font-size:0.82rem; font-weight:600;"><i class="fas fa-clock"></i> Registered</span>',
        approved: '<span class="status-badge status-approved" style="background:rgba(108,92,231,0.2); color:var(--accent-secondary); padding:0.25rem 0.75rem; border-radius:12px; font-size:0.82rem; font-weight:600;"><i class="fas fa-check-circle"></i> Approved</span>',
        checked_in: '<span class="status-badge status-checked_in" style="background:rgba(85,239,196,0.2); color:var(--accent-green); padding:0.25rem 0.75rem; border-radius:12px; font-size:0.82rem; font-weight:600;"><i class="fas fa-check-double"></i> Checked In (Active)</span>',
        rejected: '<span class="status-badge status-rejected" style="background:rgba(255,107,107,0.2); color:var(--accent-red); padding:0.25rem 0.75rem; border-radius:12px; font-size:0.82rem; font-weight:600;"><i class="fas fa-times-circle"></i> Rejected</span>'
    };

    bodyEl.innerHTML = `
        <!-- Top Team Bar -->
        <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(20,20,35,0.6); padding: 1rem 1.25rem; border-radius: var(--border-radius); border: 1px solid rgba(255,255,255,0.06); margin-bottom: 1.5rem; flex-wrap: wrap; gap: 0.75rem;">
            <div style="display: flex; align-items: center; gap: 0.75rem;">
                <span class="team-id-display" style="font-size: 1.4rem; margin: 0;">${escapeHtml(team.team_code)}</span>
                <div>
                    <h4 style="margin: 0; color: var(--text-primary); font-size: 1.1rem;">${escapeHtml(team.team_name)}</h4>
                    <span style="font-size: 0.8rem; color: var(--text-muted);"><i class="fas fa-envelope"></i> ${escapeHtml(team.team_lead_email)}</span>
                </div>
            </div>
            <div style="display: flex; align-items: center; gap: 0.75rem;">
                ${statusBadges[team.status] || ''}
                <button class="btn btn-outline btn-sm" onclick="teamLogout()" style="padding: 0.35rem 0.75rem; font-size: 0.82rem;">
                    <i class="fas fa-sign-out-alt"></i> Logout
                </button>
            </div>
        </div>

        <!-- Problem Statement Status Area -->
        ${data.isCheckedIn && ps ? `
            <div class="ps-unlocked-card">
                <div class="ps-unlocked-header">
                    <div>
                        <span class="ps-unlocked-badge"><i class="fas fa-unlock-alt"></i> Problem Statement Unlocked & Active!</span>
                        <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.4rem;">
                            <i class="fas fa-calendar-check" style="color: var(--accent-green);"></i> Checked in at: <strong style="color: var(--text-primary);">${team.checked_in_at ? formatDateTime(team.checked_in_at) : 'Active'}</strong>
                        </div>
                        <div style="font-size: 0.85rem; color: var(--accent-orange); margin-top: 0.25rem;">
                            <i class="fas fa-flag-checkered"></i> 24-Hour Code Freeze Deadline: <strong>${team.checked_in_at ? formatDateTime(new Date(new Date(team.checked_in_at).getTime() + 24 * 60 * 60 * 1000)) : 'Active'}</strong>
                        </div>
                    </div>
                    <div class="countdown-clock" id="teamCountdown">
                        <i class="fas fa-stopwatch"></i> <span id="countdownTimerText">24:00:00</span>
                    </div>
                </div>

                <div class="ps-detail-card" style="margin-bottom: 0;">
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.8rem;">
                        <span style="font-family: var(--font-display); font-weight: 700; color: var(--accent-cyan); font-size: 1.15rem;">
                            PS-${String(ps.ps_number || ps.id).padStart(3, '0')}: ${escapeHtml(ps.title)}
                        </span>
                        <div style="display: flex; gap: 0.5rem;">
                            <span class="problem-category"><i class="fas fa-tag"></i> ${escapeHtml(ps.category)}</span>
                            <span class="difficulty difficulty-${escapeHtml(ps.difficulty)}"><i class="fas fa-signal"></i> ${escapeHtml(ps.difficulty)}</span>
                        </div>
                    </div>

                    <div class="ps-detail-section" style="margin-top: 0; padding-top: 0; border-top: none;">
                        <h5><i class="fas fa-bullseye"></i> Problem Statement</h5>
                        <p>${escapeHtml(ps.description)}</p>
                    </div>

                    ${ps.problem_faced ? `
                    <div class="ps-detail-section">
                        <h5><i class="fas fa-exclamation-triangle"></i> Problem Faced & Challenges</h5>
                        <p>${escapeHtml(ps.problem_faced)}</p>
                    </div>
                    ` : ''}

                    ${ps.suggested_solution ? `
                    <div class="ps-detail-section">
                        <h5><i class="fas fa-lightbulb"></i> Suggested Approach & Architecture</h5>
                        <p>${escapeHtml(ps.suggested_solution)}</p>
                    </div>
                    ` : ''}
                </div>
            </div>
        ` : `
            <div class="ps-locked-card">
                <div class="ps-locked-icon">
                    <i class="fas fa-lock"></i>
                </div>
                <h4 style="font-family: var(--font-display); color: var(--accent-orange); margin-bottom: 0.5rem;">
                    Problem Statement Locked
                </h4>
                <p style="color: var(--text-secondary); max-width: 580px; margin: 0 auto 1.25rem; font-size: 0.95rem; line-height: 1.6;">
                    Your problem statement is queued. It will be <strong>shuffled and unlocked automatically with your 24-hour timer</strong> as soon as the Admin marks your team as Checked In at the venue desk!
                </p>
                <div style="display: flex; flex-direction: column; gap: 0.4rem; background: rgba(10,10,15,0.7); border: 1px solid rgba(255,255,255,0.08); padding: 0.9rem 1.25rem; border-radius: 8px; font-size: 0.88rem; color: var(--text-secondary); max-width: 560px; margin: 0 auto; text-align: left;">
                    <div><i class="fas fa-university" style="color: var(--accent-secondary); width: 20px;"></i> <strong>Event:</strong> ${escapeHtml(data.settings?.event_name || 'SYNAPSE')} - ${escapeHtml(data.settings?.event_tagline || '24-Hour Hackathon')}</div>
                    <div><i class="fas fa-microchip" style="color: var(--accent-secondary); width: 20px;"></i> <strong>Dept:</strong> ${escapeHtml(data.settings?.event_department || 'Department of AI & Data Science')}</div>
                    <div><i class="fas fa-map-marker-alt" style="color: var(--accent-cyan); width: 20px;"></i> <strong>Venue:</strong> ${escapeHtml(data.settings?.event_venue || 'V.S.B Engineering College, Karur')}</div>
                    <div><i class="fas fa-calendar-check" style="color: var(--accent-green); width: 20px;"></i> <strong>Registered:</strong> ${formatDateTime(team.registered_at)}</div>
                    <div><i class="fas fa-envelope" style="color: var(--accent-orange); width: 20px;"></i> <strong>Contact:</strong> ${escapeHtml(data.settings?.contact_email || 'synapse@vsb.edu.in')} | ${escapeHtml(data.settings?.contact_phone || '+91 98765 43210')}</div>
                </div>
            </div>
        `}

        <!-- Live Announcements from Admin -->
        <div style="background: rgba(20,20,35,0.7); border: 1px solid rgba(255,255,255,0.06); border-radius: var(--border-radius); padding: 1.25rem; margin-bottom: 1.5rem;">
            <h5 style="font-family: var(--font-display); font-size: 0.95rem; color: var(--text-primary); margin-bottom: 0.75rem; display: flex; align-items: center; gap: 0.5rem;">
                <i class="fas fa-bullhorn" style="color: var(--accent-cyan);"></i> Live Hackathon Updates (${(data.announcements || []).length})
            </h5>
            ${(data.announcements && data.announcements.length > 0) ? `
                <div style="display: flex; flex-direction: column; gap: 0.75rem;">
                    ${data.announcements.map(a => `
                        <div style="background: rgba(10,10,20,0.5); border-left: 3px solid ${a.priority === 'urgent' ? 'var(--accent-red)' : a.priority === 'high' ? 'var(--accent-orange)' : 'var(--accent-cyan)'}; padding: 0.75rem 1rem; border-radius: 6px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.3rem; flex-wrap: wrap; gap: 0.5rem;">
                                <strong style="color: var(--text-primary); font-size: 0.9rem;">${escapeHtml(a.title)}</strong>
                                <span style="font-size: 0.75rem; color: var(--text-muted);"><i class="fas fa-clock"></i> ${formatDateTime(a.created_at)}</span>
                            </div>
                            <p style="margin: 0; font-size: 0.85rem; color: var(--text-secondary); line-height: 1.5;">${escapeHtml(a.message)}</p>
                        </div>
                    `).join('')}
                </div>
            ` : `
                <p style="margin: 0; font-size: 0.85rem; color: var(--text-muted);"><i class="fas fa-info-circle"></i> No announcements posted yet. Real-time updates from organizers will appear here.</p>
            `}
        </div>

        <!-- Project Submission Area -->
        <div class="submission-card">
            <h5 style="font-family: var(--font-display); font-size: 1rem; color: var(--text-primary); margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.5rem;">
                <i class="fas fa-code-branch"></i> Project Submission & Deliverables
            </h5>
            <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1rem;">
                You can save or update your project links at any time during the 24-hour hackathon.
            </p>
            <form onsubmit="saveProjectSubmission(event)">
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem; margin-bottom: 1rem;">
                    <div class="form-group">
                        <label style="display: block; font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.4rem;">
                            <i class="fab fa-github"></i> GitHub Repository URL
                        </label>
                        <input type="url" id="sub_repo" value="${escapeHtml(team.project_repo || '')}" placeholder="https://github.com/..." 
                               style="width: 100%; padding: 0.65rem 0.9rem; border-radius: 8px; background: rgba(10,10,15,0.6); border: 1px solid rgba(255,255,255,0.1); color: white; font-size: 0.9rem;">
                    </div>
                    <div class="form-group">
                        <label style="display: block; font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.4rem;">
                            <i class="fas fa-globe"></i> Live Demo / Video / Presentation Link
                        </label>
                        <input type="url" id="sub_demo" value="${escapeHtml(team.project_demo || '')}" placeholder="https://..." 
                               style="width: 100%; padding: 0.65rem 0.9rem; border-radius: 8px; background: rgba(10,10,15,0.6); border: 1px solid rgba(255,255,255,0.1); color: white; font-size: 0.9rem;">
                    </div>
                </div>
                <!-- Supabase Cloud Storage File Upload -->
                <div class="form-group" style="margin-bottom: 1.25rem; padding: 1rem; border-radius: 8px; background: rgba(10,10,25,0.5); border: 1px dashed rgba(255,255,255,0.18);">
                    <label style="display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.6rem;">
                        <span><i class="fas fa-cloud-upload-alt" style="color: var(--accent-cyan);"></i> Project File / PPT / ZIP / PDF (Supabase Storage)</span>
                        <span style="font-size: 0.72rem; color: var(--accent-cyan); font-family: var(--font-mono); background: rgba(0, 206, 201, 0.1); padding: 0.15rem 0.5rem; border-radius: 4px;">Max 50MB</span>
                    </label>
                    <div style="display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap;">
                        <input type="file" id="sub_file_input" accept=".zip,.rar,.tar.gz,.pdf,.pptx,.ppt,.docx,.png,.jpg" 
                               style="font-size: 0.82rem; color: var(--text-secondary); background: transparent; flex: 1; min-width: 200px;">
                        <button type="button" class="btn btn-outline btn-sm" id="uploadFileBtn" onclick="uploadSubmissionFile()">
                            <i class="fas fa-cloud-upload-alt"></i> Upload to Cloud
                        </button>
                    </div>
                    <div id="uploadStatusMsg" style="margin-top: 0.5rem; font-size: 0.8rem;"></div>
                    ${team.submission_file_url ? `
                        <div id="uploadedFileLink" style="margin-top: 0.6rem; padding: 0.5rem 0.8rem; background: rgba(108,92,231,0.15); border: 1px solid rgba(108,92,231,0.3); border-radius: 6px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
                            <span style="font-size: 0.82rem; color: #a29bfe;"><i class="fas fa-check-circle" style="color: var(--accent-green);"></i> Active File Stored in Cloud</span>
                            <a href="${safeUrl(team.submission_file_url)}" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-sm" style="font-size: 0.75rem; padding: 0.25rem 0.65rem; text-decoration: none;">
                                <i class="fas fa-external-link-alt"></i> View / Download Stored File
                            </a>
                        </div>
                    ` : `
                        <div id="uploadedFileLink" style="display: none; margin-top: 0.6rem; padding: 0.5rem 0.8rem; background: rgba(108,92,231,0.15); border: 1px solid rgba(108,92,231,0.3); border-radius: 6px; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;"></div>
                    `}
                </div>
                <div class="form-group" style="margin-bottom: 1rem;">
                    <label style="display: block; font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.4rem;">
                        <i class="fas fa-sticky-note"></i> Tech Stack & Implementation Notes
                    </label>
                    <textarea id="sub_notes" rows="2" placeholder="Mention libraries, AI models, and architecture used..." 
                              style="width: 100%; padding: 0.65rem 0.9rem; border-radius: 8px; background: rgba(10,10,15,0.6); border: 1px solid rgba(255,255,255,0.1); color: white; font-size: 0.9rem;">${escapeHtml(team.submission_notes || '')}</textarea>
                </div>
                <button type="submit" class="btn btn-primary btn-sm" id="subBtn">
                    <i class="fas fa-save"></i> Save Submission Details
                </button>
            </form>
        </div>
    `;

    // Start live countdown timer if checked in
    if (data.isCheckedIn && team.checked_in_at) {
        startCountdownTimer(team.checked_in_at);
    }
}

function startCountdownTimer(startTimeStr) {
    if (teamCountdownInterval) clearInterval(teamCountdownInterval);

    const timerEl = document.getElementById('countdownTimerText');
    if (!timerEl) return;

    const parsedDate = new Date(typeof startTimeStr === 'string' && startTimeStr.includes(' ') && !startTimeStr.includes('T') ? startTimeStr.replace(' ', 'T') : startTimeStr);
    const startTime = parsedDate.getTime();
    if (isNaN(startTime)) {
        timerEl.textContent = 'Active';
        return;
    }

    // 24 Hours duration in milliseconds
    const duration = 24 * 60 * 60 * 1000;
    const endTime = startTime + duration;

    function update() {
        const now = Date.now();
        const diff = endTime - now;

        if (diff <= 0) {
            timerEl.textContent = '00:00:00 (Time Up!)';
            timerEl.style.color = 'var(--accent-red)';
            clearInterval(teamCountdownInterval);
            return;
        }

        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);

        timerEl.textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    update();
    teamCountdownInterval = setInterval(update, 1000);
}

async function uploadSubmissionFile() {
    const fileInput = document.getElementById('sub_file_input');
    const statusMsg = document.getElementById('uploadStatusMsg');
    const uploadBtn = document.getElementById('uploadFileBtn');
    const token = localStorage.getItem('synapse_team_token');

    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        showToast('Please select a file to upload first.', 'error');
        return;
    }

    const file = fileInput.files[0];
    if (file.size > 52428800) { // 50MB
        showToast('File exceeds 50MB limit.', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('file', file);

    uploadBtn.disabled = true;
    uploadBtn.innerHTML = '<span class="spinner"></span> Uploading...';
    statusMsg.innerHTML = '<span style="color: var(--accent-cyan);"><i class="fas fa-spinner fa-spin"></i> Uploading to Supabase cloud storage...</span>';

    try {
        const res = await fetch(`${API_BASE}/team/upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Upload failed');

        statusMsg.innerHTML = `<span style="color: var(--accent-green);"><i class="fas fa-check-circle"></i> ${data.message}</span>`;
        showToast('File uploaded successfully!', 'success');

        const linkContainer = document.getElementById('uploadedFileLink');
        if (linkContainer) {
            linkContainer.style.display = 'flex';
            linkContainer.innerHTML = `
                <span style="font-size: 0.82rem; color: #a29bfe;"><i class="fas fa-check-circle" style="color: var(--accent-green);"></i> Stored: ${data.fileName}</span>
                <a href="${data.fileUrl}" target="_blank" class="btn btn-primary btn-sm" style="font-size: 0.75rem; padding: 0.25rem 0.65rem; text-decoration: none;">
                    <i class="fas fa-external-link-alt"></i> View Stored File
                </a>
            `;
        }
    } catch (err) {
        statusMsg.innerHTML = `<span style="color: var(--accent-red);"><i class="fas fa-exclamation-triangle"></i> ${err.message}</span>`;
        showToast(err.message, 'error');
    } finally {
        uploadBtn.disabled = false;
        uploadBtn.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> Upload to Cloud';
    }
}

async function saveProjectSubmission(e) {
    e.preventDefault();
    const token = localStorage.getItem('synapse_team_token');
    const btn = document.getElementById('subBtn');
    const repo = document.getElementById('sub_repo').value.trim();
    const demo = document.getElementById('sub_demo').value.trim();
    const notes = document.getElementById('sub_notes').value.trim();

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Saving...';

    try {
        const res = await fetch(`${API_BASE}/team/submit`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                project_repo: repo,
                project_demo: demo,
                submission_notes: notes
            })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to save');
        showToast('Project submission saved successfully!', 'success');
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-save"></i> Save Submission Details';
        }
    }
}

function teamLogout() {
    localStorage.removeItem('synapse_team_token');
    localStorage.removeItem('synapse_team_info');
    if (teamCountdownInterval) {
        clearInterval(teamCountdownInterval);
        teamCountdownInterval = null;
    }
    showToast('Signed out of team portal', 'info');
    renderTeamLoginForm();
}

