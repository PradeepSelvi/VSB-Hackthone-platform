const jwt = require('jsonwebtoken');

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'synapse_hackathon_2026_vsb_secret_key');
        req.admin = decoded;
        next();
    } catch (err) {
        return res.status(403).json({ error: 'Invalid or expired token.' });
    }
}

function authenticateTeamToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access denied. Please log in with your Team ID.' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'synapse_hackathon_2026_vsb_secret_key');
        if (decoded.role !== 'team' && !decoded.teamId) {
            return res.status(403).json({ error: 'Invalid team authorization.' });
        }
        req.team = decoded;
        next();
    } catch (err) {
        return res.status(403).json({ error: 'Session expired. Please log in again.' });
    }
}

module.exports = { authenticateToken, authenticateTeamToken };
