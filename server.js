const express = require('express');
const axios = require('axios');
const { sql } = require('@vercel/postgres');
require('dotenv').config();

const app = express();
app.use(express.json());

const { CLIENT_ID, CLIENT_SECRET, REDIRECT_URI } = process.env;

// Fungsi untuk membuat tabel (akan dijalankan secara otomatis oleh Vercel)
async function createTables() {
    try {
        await sql`
            CREATE TABLE IF NOT EXISTS users (
                discord_id VARCHAR(255) PRIMARY KEY,
                username VARCHAR(255) NOT NULL,
                high_score INT DEFAULT 0
            );
        `;
        console.log('User table created or already exists.');
    } catch (err) {
        console.error('Error creating user table:', err.stack);
    }
}
createTables();

// --- API ENDPOINTS ---

app.get('/api/login/discord', (req, res) => {
    const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify`;
    res.redirect(authUrl);
});

app.get('/api/auth/discord/callback', async (req, res) => {
    const { code } = req.query;
    if (!code) {
        return res.status(400).send('No code provided.');
    }

    try {
        const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', new URLSearchParams({
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: REDIRECT_URI,
            scope: 'identify'
        }), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        const { access_token } = tokenResponse.data;
        const userResponse = await axios.get('https://discord.com/api/v10/users/@me', {
            headers: {
                'Authorization': `Bearer ${access_token}`
            }
        });

        const user = userResponse.data;
        
        const result = await sql`
            INSERT INTO users (discord_id, username) 
            VALUES (${user.id}, ${user.username}) 
            ON CONFLICT (discord_id) DO UPDATE SET username = ${user.username}
            RETURNING high_score;
        `;
        const userHighScore = result.rows[0].high_score;

        res.redirect(`/?username=${encodeURIComponent(user.username)}&id=${user.id}&highScore=${userHighScore}`);

    } catch (error) {
        console.error('Error during Discord auth:', error.response?.data || error.message);
        res.status(500).send('Authentication failed.');
    }
});

app.post('/api/submit-score', async (req, res) => {
    const { userId, score } = req.body;
    if (!userId || typeof score === 'undefined') {
        return res.status(400).send('Invalid data provided.');
    }

    try {
        const result = await sql`SELECT high_score FROM users WHERE discord_id = ${userId};`;
        const currentHighScore = result.rows.length > 0 ? result.rows[0].high_score : 0;

        let newHighScore = currentHighScore;
        if (score > currentHighScore) {
            newHighScore = score;
            await sql`
                UPDATE users SET high_score = ${newHighScore} WHERE discord_id = ${userId};
            `;
        }
        res.json({ newHighScore: newHighScore });
    } catch (error) {
        console.error('Error submitting score:', error);
        res.status(500).send('Error submitting score.');
    }
});

app.get('/api/leaderboard', async (req, res) => {
    try {
        const result = await sql`
            SELECT username, high_score FROM users ORDER BY high_score DESC LIMIT 10;
        `;
        const leaderboardData = result.rows.map(row => ({
            username: row.username,
            score: row.high_score
        }));
        res.json(leaderboardData);
    } catch (error) {
        console.error('Error fetching leaderboard:', error);
        res.status(500).send('Error fetching leaderboard.');
    }
});

module.exports = app;