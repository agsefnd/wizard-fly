require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs').promises; // Menggunakan fs.promises untuk operasi async
const fetch = require('node-fetch');

const app = express();
const SCORES_FILE = path.join(__dirname, 'scores.json');

// Middleware
app.use(bodyParser.json());
app.use(session({
    secret: 'wizard-secret-key',
    resave: false,
    saveUninitialized: true
}));

// Fungsi untuk membaca dan menulis skor ke file
async function readScores() {
    try {
        const data = await fs.readFile(SCORES_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (err) {
        if (err.code === 'ENOENT') {
            return {};
        }
        throw err;
    }
}

async function writeScores(data) {
    await fs.writeFile(SCORES_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// Root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Login Discord
app.get('/api/login/discord', (req, res) => {
    const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
    const REDIRECT_URI = process.env.REDIRECT_URI;
    const redirect = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(
        REDIRECT_URI
    )}&response_type=code&scope=identify`;
    res.redirect(redirect);
});

// Callback
app.get('/api/callback', async (req, res) => {
    const code = req.query.code;
    const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
    const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
    const REDIRECT_URI = process.env.REDIRECT_URI;
    if (!code) return res.status(400).send('No code provided');

    try {
        const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                grant_type: 'authorization_code',
                code,
                redirect_uri: REDIRECT_URI,
            }),
        });
        const tokenData = await tokenResponse.json();

        const userResponse = await fetch('https://discord.com/api/users/@me', {
            headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        const user = await userResponse.json();

        // Simpan data pengguna di sesi untuk keamanan
        req.session.userId = user.id;
        req.session.username = user.username;
        req.session.avatar = user.avatar;

        res.redirect('/');
    } catch (err) {
        console.error('Callback error:', err);
        res.status(500).send('Auth failed');
    }
});

// Submit score
app.post('/api/submit-score', async (req, res) => {
    const { score } = req.body;
    const userId = req.session.userId;
    const username = req.session.username;

    if (!userId || !username) {
        return res.status(401).json({ message: 'User not authenticated' });
    }

    const scores = await readScores();
    if (!scores[userId] || score > scores[userId].score) {
        scores[userId] = { username, score };
        await writeScores(scores);
    }

    res.json({ newHighScore: scores[userId].score });
});

// Leaderboard
app.get('/api/leaderboard', async (req, res) => {
    const scores = await readScores();
    const leaderboard = Object.values(scores)
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);
    res.json(leaderboard);
});

// Get user info
app.get('/api/user', (req, res) => {
    if (req.session.userId) {
        return res.json({
            id: req.session.userId,
            username: req.session.username,
            avatar: req.session.avatar
        });
    }
    res.status(401).json({ message: 'User not logged in' });
});

// Export app untuk Vercel
module.exports = app;

// Dev local
if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));
}