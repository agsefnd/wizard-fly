require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
app.use(bodyParser.json());
app.use(session({ secret: 'wizard-secret', resave: false, saveUninitialized: true }));

// Simpan skor di memori
// Format: { userId: { username, score } }
const scores = {};

// Discord OAuth config
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI || 'http://localhost:3000/api/callback';

// Serve file statis (HTML, CSS, JS, gambar)
app.use(express.static(path.join(__dirname)));

// Serve index.html saat akses root /
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Login via Discord
app.get('/api/login/discord', (req, res) => {
  const redirect = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(
    REDIRECT_URI
  )}&response_type=code&scope=identify`;
  res.redirect(redirect);
});

// Callback dari Discord
app.get('/api/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.send('No code provided');

  // Tukar code dengan access_token
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

  // Ambil data user
  const userResponse = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  const user = await userResponse.json();

  // Simpan user dengan skor awal (0 jika belum ada)
  const highScore = scores[user.id]?.score || 0;
  scores[user.id] = { username: user.username, score: highScore };

  // Redirect balik ke game dengan data user
  res.redirect(
    `/index.html?username=${encodeURIComponent(user.username)}&id=${user.id}&highScore=${highScore}`
  );
});

// Submit skor (update hanya jika lebih tinggi)
app.post('/api/submit-score', (req, res) => {
  const { userId, score } = req.body;

  if (!scores[userId]) {
    scores[userId] = { username: "Player", score };
  }

  if (score > scores[userId].score) {
    scores[userId].score = score;
  }

  res.json({ newHighScore: scores[userId].score });
});

// Ambil leaderboard (Top 10)
app.get('/api/leaderboard', (req, res) => {
  const leaderboard = Object.entries(scores)
    .map(([id, data]) => ({ id, username: data.username, score: data.score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  res.json(leaderboard);
});

app.listen(3000, () => console.log('✅ Server running on http://localhost:3000'));
