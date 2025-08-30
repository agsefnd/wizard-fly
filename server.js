require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const fetch = require('node-fetch');

const app = express();

// middleware
app.use(bodyParser.json());
app.use(session({
  secret: 'wizard-secret',
  resave: false,
  saveUninitialized: true
}));

// simpan skor di memory
const scores = {};

// Discord OAuth config
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI || 'http://localhost:3000/api/callback';

// serve file statis (index.html, css, js, assets)
app.use(express.static(path.join(__dirname)));

// root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// debug route (cek Railway jalan)
app.get('/ping', (req, res) => {
  res.send('pong 🧙‍♂️ server is alive!');
});

// login discord
app.get('/api/login/discord', (req, res) => {
  const redirect = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(
    REDIRECT_URI
  )}&response_type=code&scope=identify`;
  res.redirect(redirect);
});

// callback discord
app.get('/api/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.send('No code provided');

  try {
    // tukar code dengan token
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

    // ambil data user
    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const user = await userResponse.json();

    const highScore = scores[user.id] || 0;

    // redirect ke game dengan data user
    res.redirect(
      `/index.html?username=${encodeURIComponent(user.username)}&id=${user.id}&highScore=${highScore}`
    );
  } catch (err) {
    console.error('Callback error:', err);
    res.status(500).send('Auth failed');
  }
});

// submit score
app.post('/api/submit-score', (req, res) => {
  const { userId, score } = req.body;
  if (!scores[userId] || score > scores[userId]) {
    scores[userId] = score;
  }
  res.json({ newHighScore: scores[userId] });
});

// get leaderboard
app.get('/api/leaderboard', (req, res) => {
  const leaderboard = Object.entries(scores)
    .map(([id, score]) => ({ id, username: id, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
  res.json(leaderboard);
});

// listen (gunakan PORT dari Railway)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
