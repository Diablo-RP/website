const express = require('express');
const mysql = require('mysql2');
const bcrypt = require('bcryptjs');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('.')); // Serve static files

// Database configuration
const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: '',  // Leave empty if no password is set
  database: 'rsg_dev',
  port: 3306
};

console.log('Attempting to connect to database with config:', {
  ...dbConfig,
  password: dbConfig.password ? '****' : ''
});

const db = mysql.createConnection(dbConfig);

db.connect((err) => {
  if (err) {
    console.error('Error connecting to database:', err);
    return;
  }
  console.log('Connected to database successfully');
  
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
    // Check if cas_vip_coin table exists
    const [tables] = await db.promise().query('SHOW TABLES LIKE "cas_vip_coin"');
    console.log('Tables:', tables);

    // Get table structure
    const [columns] = await db.promise().query('DESCRIBE cas_vip_coin');
    console.log('VIP Coins table structure:', columns);

    // Get all characters for the steam ID with VIP coins
    const query = 'SELECT p.citizenid, p.money, p.charinfo, p.license, COALESCE(v.amount, 0) as vip_coins ' +
                 'FROM players p ' +
                 'LEFT JOIN cas_vip_coin v ON v.identifier = p.license ' +
                 'ORDER BY p.citizenid';
    console.log('Executing query:', query);
    
    const [players] = await db.promise().query(query);
    console.log('Query result:', players);
    
    if (players.length === 0) {
      return res.status(404).json({ error: 'No players found' });
    }
    
    // Map all characters to their data
    const characters = players.map(player => {
      const moneyData = JSON.parse(player.money);
      const charInfo = JSON.parse(player.charinfo);
      
      return {
        citizenId: player.citizenid,
        firstName: charInfo.firstname,
        lastName: charInfo.lastname,
        vipCoins: parseInt(player.vip_coins) || 0,
        cash: parseFloat(moneyData.cash) || 0,
        valBank: parseFloat(moneyData.valbank) || 0,
        armBank: parseFloat(moneyData.armbank) || 0,
        rhoBank: parseFloat(moneyData.rhobank) || 0,
        blkBank: parseFloat(moneyData.blkbank) || 0,
        bank: parseFloat(moneyData.bank) || 0,
        bloodMoney: parseFloat(moneyData.bloodmoney) || 0
      };
    });

    res.json(characters);
  } catch (error) {
    console.error('Error fetching player info:', error);
    res.status(500).json({ 
      error: 'Error fetching player information',
      details: error.message
    });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
