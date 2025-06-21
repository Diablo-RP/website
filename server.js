const express = require('express');
const mysql = require('mysql2');
const bcrypt = require('bcryptjs');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('.')); // Serve static files

// Database connection
// Database configuration
const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: '',  // Leave empty if no password is set
  database: 'rsg_dev',
  port: 3306
};

console.log('Attempting to connect to database with config:', dbConfig);

const db = mysql.createConnection(dbConfig);

db.connect((err) => {
  if (err) {
    console.error('Error connecting to database:', err);
    return;
  }
  console.log('Connected to MySQL database');
  
  // Create users table if it doesn't exist
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      steam_id VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      character_id VARCHAR(255) UNIQUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;
  
  db.query(createTableQuery, (err) => {
    if (err) {
      console.error('Error creating users table:', err);
    } else {
      console.log('Users table ready');
    }
  });
});

// Register new user
app.post('/api/register', async (req, res) => {
  console.log('Received registration request:', req.body);
  const { steamId, password } = req.body;
  
  if (!steamId || !password) {
    console.error('Missing required fields');
    return res.status(400).json({ error: 'Steam ID and password are required' });
  }
  
  try {
    // Check if steam ID already exists
    const [existingUsers] = await db.promise().query(
      'SELECT * FROM users WHERE steam_id = ?',
      [steamId]
    );
    
    if (existingUsers.length > 0) {
      console.log('Steam ID already exists:', steamId);
      return res.status(400).json({ error: 'Steam ID already registered' });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Generate unique character ID (DC-XXXX format)
    const characterId = 'DC-' + Math.floor(1000 + Math.random() * 9000);
    
    // Insert new user
    await db.promise().query(
      'INSERT INTO users (steam_id, password, character_id) VALUES (?, ?, ?)',
      [steamId, hashedPassword, characterId]
    );
    
    console.log('Account created successfully for Steam ID:', steamId);
    res.status(200).json({ message: 'Account created successfully', characterId });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Error creating account: ' + error.message });
  }
});

// Login endpoint
app.post('/api/login', async (req, res) => {
  const { characterId, password } = req.body;
  
  if (!characterId || !password) {
    return res.status(400).json({ error: 'Please provide both character ID and password' });
  }
  
  try {
    // Find user by character ID
    const [users] = await db.promise().query(
      'SELECT * FROM users WHERE character_id = ?',
      [characterId]
    );
    
    if (users.length === 0) {
      return res.status(401).json({ error: 'Invalid character ID or password' });
    }
    
    const user = users[0];
    
    // Verify password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid character ID or password' });
    }
    
    // Return user info
    res.json({ 
      message: 'Login successful',
      userId: user.id,
      characterId: user.character_id
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Error during login' });
  }
});

// Get player info
app.get('/api/player-info', async (req, res) => {
  try {
    // Get user info from players table with all money columns
    const [players] = await db.promise().query(
      'SELECT citizenid, money, bank, crypto FROM players LIMIT 1'
    );
    
    if (players.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }
    
    const player = players[0];
    res.json({
      citizenId: player.citizenid,
      cash: parseInt(player.money) || 0,
      bank: parseInt(player.bank) || 0,
      crypto: parseInt(player.crypto) || 0
    });
  } catch (error) {
    console.error('Error fetching player info:', error);
    res.status(500).json({ error: 'Error fetching player information' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
