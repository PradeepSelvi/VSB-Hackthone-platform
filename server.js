require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initializeDatabase } = require('./db/database');
const { isSupabaseConfigured } = require('./db/supabase');
const adminRoutes = require('./routes/admin');
const publicRoutes = require('./routes/public');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
const corsOptions = {
    origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Favicon handler
app.get('/favicon.ico', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'logo.jpg'));
});

// API Routes
app.use('/api/admin', adminRoutes);
app.use('/api', publicRoutes);

// Serve admin panel
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// JSON 404 handler for API routes (prevents HTML catch-all hijacking)
app.use('/api', (req, res) => {
    res.status(404).json({ error: `API route not found: ${req.method} ${req.originalUrl}` });
});

// Serve main frontend for non-API GET routes
app.use((req, res) => {
    if (req.method === 'GET') {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    } else {
        res.status(404).json({ error: 'Not found' });
    }
});

// Initialize database and start server
initializeDatabase();

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`\n🚀 SYNAPSE Hackathon Server running at http://localhost:${PORT}`);
        console.log(`📋 Admin Panel: http://localhost:${PORT}/admin`);
        console.log(`🔐 Default Admin: ${process.env.ADMIN_EMAIL || 'admin@synapse.com'} / ${process.env.ADMIN_PASSWORD || 'synapse2026'}\n`);
    });
}

module.exports = app;
