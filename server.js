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
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/admin', adminRoutes);
app.use('/api', publicRoutes);

// Serve admin panel
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Serve main site for all other routes (Express 5 compatible catch-all)
app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initialize database and start server
initializeDatabase();

app.listen(PORT, () => {
    console.log(`\n🚀 SYNAPSE Hackathon Server running at http://localhost:${PORT}`);
    console.log(`📋 Admin Panel: http://localhost:${PORT}/admin`);
    console.log(`🔐 Default Admin: ${process.env.ADMIN_EMAIL || 'admin@synapse.com'} / ${process.env.ADMIN_PASSWORD || 'synapse2026'}\n`);
});
