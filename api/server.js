require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const fetch = require('node-fetch');

const app = express();

// Middleware
app.use(bodyParser.json());
app.use(session({
  secret: 'wizard-secret',
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: process.env.NODE_ENV === 'production',  // Only send cookies over HTTPS in production
    httpOnly: true,
    sameSite: 'strict',  // Protect against CSRF
  },
}));

// In-memory scores (to be replaced with persistent store in production)
const scores = {};

// Discord OAuth config
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI || 'https://wizard-fly.vercel.app/api/callback';

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.get('/api/login/discord', (req, res) => {
  const redirect = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify`;
  res.redirect(redirect);
});

app.get('/api/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) {
    console.error('No code provided');
    return res.status(400).send('No code provided');
  }
  
  try {
    // Request token from Discord
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
    console.log('Token Response:', tokenData); // Log token data for debugging

    if (tokenData.error) {
      console.error('OAuth Error:', tokenData.error);
      return res.status(500).send('OAuth token exchange failed');
    }

    if (!tokenData.access_token) {
      console.error('No access token received');
      return res.status(500).send('Token exchange failed');
    }

    // Fetch user data from Discord
    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    const user = await userResponse.json();
    console.log('Discord User:', user); // Log user data for debugging

    // Store user data in session
    req.session.userId = user.id;
    req.session.username = user.username;

    res.redirect('/');  // Redirect ke halaman utama
  } catch (err) {
    console.error('Callback error:', err);
    res.status(500).send('Auth failed');
  }
});

app.get('/api/user', (req, res) => {
  if (req.session.userId) {
    return res.json({
      id: req.session.userId,
      username: req.session.username,
    });
  }
  res.status(401).json({ message: 'User not logged in' });
});

app.post('/api/submit-score', (req, res) => {
  const { score } = req.body;
  const userId = req.session.userId;
  const username = req.session.username;

  if (!userId || !username) {
    return res.status(401).json({ message: 'User not authenticated' });
  }

  if (!scores[userId] || score > scores[userId].score) {
    scores[userId] = { username: username, score: score };
  }
  res.json({ newHighScore: scores[userId].score });
});

app.get('/api/leaderboard', (req, res) => {
  const leaderboard = Object.values(scores)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
  res.json(leaderboard);
});

// Catch-all route to serve the main HTML file for any non-API requests
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Export the app for Vercel or other platforms
module.exports = app;
