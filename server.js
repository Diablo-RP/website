const express = require('express');
const mysql = require('mysql2');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('.')); // Serve static files

// Email configuration
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

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
      email VARCHAR(255),
      is_admin BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;
  
  db.query(createTableQuery, (err) => {
    if (err) {
      console.error('Error creating users table:', err);
    } else {
      console.log('Users table ready');
      
      // Create tickets table if it doesn't exist
      const createTicketsTable = `
        CREATE TABLE IF NOT EXISTS tickets (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          subject VARCHAR(255) NOT NULL,
          category VARCHAR(50) NOT NULL,
          description TEXT NOT NULL,
          status ENUM('open', 'in_progress', 'closed') DEFAULT 'open',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id)
        )
      `;
      
      db.query(createTicketsTable, (err) => {
        if (err) {
          console.error('Error creating tickets table:', err);
        } else {
          console.log('Tickets table ready');
          
          // Create ticket responses table
          const createResponsesTable = `
            CREATE TABLE IF NOT EXISTS ticket_responses (
              id INT AUTO_INCREMENT PRIMARY KEY,
              ticket_id INT NOT NULL,
              admin_id INT NOT NULL,
              content TEXT NOT NULL,
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (ticket_id) REFERENCES tickets(id),
              FOREIGN KEY (admin_id) REFERENCES users(id)
            )
          `;
          
          db.query(createResponsesTable, (err) => {
            if (err) {
              console.error('Error creating responses table:', err);
            } else {
              console.log('Responses table ready');
            }
          });
        }
      });
    }
  });
});

// Register new user
app.post('/api/register', async (req, res) => {
  console.log('Received registration request:', req.body);
  const { steamId, password, email } = req.body;
  
  if (!steamId || !password || !email) {
    console.error('Missing required fields');
    return res.status(400).json({ error: 'Steam ID, password, and email are required' });
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
      'INSERT INTO users (steam_id, password, character_id, email) VALUES (?, ?, ?, ?)',
      [steamId, hashedPassword, characterId, email]
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
      characterId: user.character_id,
      email: user.email,
      isAdmin: user.is_admin
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

    // First get player info with VIP coins
    const query = 'SELECT p.citizenid, p.money, p.charinfo, COALESCE(v.amount, 0) as vip_coins ' +
                 'FROM players p ' +
                 'LEFT JOIN cas_vip_coin v ON v.identifier = p.citizenid ' +
                 'LIMIT 1';
    console.log('Executing query:', query);
    
    const [players] = await db.promise().query(query);
    console.log('Query result:', players);
    
    if (players.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }
    
    const player = players[0];
    const moneyData = JSON.parse(player.money);
    const charInfo = JSON.parse(player.charinfo);
    console.log('Character Info:', charInfo);
    
    res.json({
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
    });
  } catch (error) {
    console.error('Error fetching player info:', error);
    res.status(500).json({ 
      error: 'Error fetching player information',
      details: error.message
    });
  }
});

// Authentication middleware
const authenticateUser = async (req, res, next) => {
  const characterId = req.headers['character-id'];
  
  if (!characterId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const [users] = await db.promise().query(
      'SELECT * FROM users WHERE character_id = ?',
      [characterId]
    );

    if (users.length === 0) {
      return res.status(401).json({ error: 'Invalid authentication' });
    }

    req.user = users[0]; // Attach user object to request
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
};

// Admin authentication middleware
const authenticateAdmin = async (req, res, next) => {
  const characterId = req.headers['character-id'];
  
  if (!characterId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const [users] = await db.promise().query(
      'SELECT * FROM users WHERE character_id = ? AND is_admin = TRUE',
      [characterId]
    );

    if (users.length === 0) {
      return res.status(401).json({ error: 'Admin access required' });
    }

    req.user = users[0];
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
};

// Helper function to send email notifications
async function sendTicketEmail(userEmail, subject, message) {
  if (!userEmail || !process.env.SMTP_USER) return;

  try {
    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: userEmail,
      subject: `[Diablo County RP] ${subject}`,
      html: message
    });
  } catch (error) {
    console.error('Error sending email:', error);
  }
}

// Ticket endpoints
app.post('/api/tickets', authenticateUser, async (req, res) => {
  try {
    const { subject, category, description } = req.body;

    if (!subject || !category || !description) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const [result] = await db.promise().query(
      'INSERT INTO tickets (user_id, subject, category, description) VALUES (?, ?, ?, ?)',
      [req.user.id, subject, category, description]
    );

    res.json({
      success: true,
      ticketId: result.insertId,
      message: 'Ticket created successfully'
    });
  } catch (error) {
    console.error('Error creating ticket:', error);
    res.status(500).json({ error: 'Failed to create ticket' });
  }
});

app.get('/api/tickets', authenticateUser, async (req, res) => {
  try {
    const [tickets] = await db.promise().query(
      `SELECT id, subject, category, description, status, created_at, updated_at 
       FROM tickets 
       WHERE user_id = ? 
       ORDER BY created_at DESC`,
      [req.user.id]
    );

    res.json({ tickets });
  } catch (error) {
    console.error('Error fetching tickets:', error);
    res.status(500).json({ error: 'Failed to fetch tickets' });
  }
});

app.patch('/api/tickets/:id', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Missing status field' });
    }

    const [result] = await db.promise().query(
      'UPDATE tickets SET status = ? WHERE id = ? AND user_id = ?',
      [status, id, req.user.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Ticket not found or unauthorized' });
    }

    res.json({
      success: true,
      message: 'Ticket status updated successfully'
    });
  } catch (error) {
    console.error('Error updating ticket:', error);
    res.status(500).json({ error: 'Failed to update ticket' });
  }
});

// Admin ticket endpoints
app.get('/api/admin/tickets', authenticateAdmin, async (req, res) => {
  try {
    const { status, category, search } = req.query;
    let query = `
      SELECT t.*, u.character_id, u.email,
        (SELECT JSON_ARRAYAGG(
          JSON_OBJECT(
            'id', r.id,
            'content', r.content,
            'created_at', r.created_at,
            'admin_id', r.admin_id
          )
        )
        FROM ticket_responses r
        WHERE r.ticket_id = t.id) as responses
      FROM tickets t
      JOIN users u ON t.user_id = u.id
      WHERE 1=1
    `;
    
    const params = [];
    
    if (status) {
      query += ' AND t.status = ?';
      params.push(status);
    }
    
    if (category) {
      query += ' AND t.category = ?';
      params.push(category);
    }
    
    if (search) {
      query += ' AND (t.subject LIKE ? OR t.description LIKE ? OR u.character_id LIKE ?)';
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }
    
    query += ' ORDER BY t.created_at DESC';
    
    const [tickets] = await db.promise().query(query, params);
    
    // Parse the JSON responses
    tickets.forEach(ticket => {
      ticket.responses = ticket.responses ? JSON.parse(ticket.responses) : [];
    });

    res.json({ tickets });
  } catch (error) {
    console.error('Error fetching tickets:', error);
    res.status(500).json({ error: 'Failed to fetch tickets' });
  }
});

app.post('/api/admin/tickets/:id/respond', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { response, status, sendEmail } = req.body;

    // Start a transaction
    const connection = await db.promise().getConnection();
    await connection.beginTransaction();

    try {
      // Add the response
      await connection.query(
        'INSERT INTO ticket_responses (ticket_id, admin_id, content) VALUES (?, ?, ?)',
        [id, req.user.id, response]
      );

      // Update ticket status
      if (status) {
        await connection.query(
          'UPDATE tickets SET status = ? WHERE id = ?',
          [status, id]
        );
      }

      // Get user's email if notification requested
      if (sendEmail) {
        const [tickets] = await connection.query(
          `SELECT u.email, t.subject 
           FROM tickets t 
           JOIN users u ON t.user_id = u.id 
           WHERE t.id = ?`,
          [id]
        );

        if (tickets.length > 0 && tickets[0].email) {
          await sendTicketEmail(
            tickets[0].email,
            `Ticket Update: ${tickets[0].subject}`,
            `
              <h2>Your ticket has been updated</h2>
              <p>An admin has responded to your ticket:</p>
              <div style="background: #f5f5f5; padding: 15px; margin: 10px 0;">
                ${response}
              </div>
              <p>Current status: ${status}</p>
              <p>You can view the full ticket details by logging into your account.</p>
            `
          );
        }
      }

      await connection.commit();
      res.json({ success: true });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Error responding to ticket:', error);
    res.status(500).json({ error: 'Failed to respond to ticket' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
