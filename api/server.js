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
// Format: { userId: { username: '...', score: ... } }
const scores = {};

// Discord OAuth config
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;

// serve file statis DARI FOLDER public
app.use(express.static(path.join(__dirname, 'public')));

// debug
app.get('/ping', (req, res) => res.send('pong 🧙‍♂️ server is alive!'));

// login discord
app.get('/api/login/discord', (req, res) => {
  const redirect = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(
    REDIRECT_URI
  )}&response_type=code&scope=identify`;
  res.redirect(redirect);
});

// callback
app.get('/api/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.send('No code provided');
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
    
    // Alihkan langsung ke halaman utama
    res.redirect('/');
  } catch (err) {
    console.error('Callback error:', err);
    res.status(500).send('Auth failed');
  }
});

// get user info
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

// submit score
app.post('/api/submit-score', (req, res) => {
  const { score } = req.body;
  const userId = req.session.userId;
  const username = req.session.username;
  
  if (!userId || !username) {
    return res.status(401).json({ message: 'User not authenticated' });
  }
  
  // Perbarui skor dengan nama pengguna
  if (!scores[userId] || score > scores[userId].score) {
    scores[userId] = { username: username, score: score };
  }
  res.json({ newHighScore: scores[userId].score });
});

// leaderboard
app.get('/api/leaderboard', (req, res) => {
  const leaderboard = Object.values(scores)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
  res.json(leaderboard);
});

// 👉 Export app (biar Vercel bisa pakai handler)
module.exports = app;

// Dev local
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));
}
