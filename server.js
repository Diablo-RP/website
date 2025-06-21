const express = require('express');
const mysql = require('mysql2');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const nodemailer = require('nodemailer');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
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

// Authentication middleware
const authenticateUser = async (req, res, next) => {
  const characterId = req.headers['character-id'];
  if (!characterId) {
    return res.status(401).json({ error: 'No character ID provided' });
  }

  try {
    const [users] = await db.promise().query(
      'SELECT * FROM users WHERE character_id = ?',
      [characterId]
    );

    if (users.length === 0) {
      return res.status(401).json({ error: 'Invalid character ID' });
    }

    req.user = users[0];
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({ error: 'Error during authentication' });
  }
};

// Admin authentication middleware
const authenticateAdmin = async (req, res, next) => {
  const characterId = req.headers['character-id'];
  if (!characterId) {
    return res.status(401).json({ error: 'No character ID provided' });
  }

  try {
    const [users] = await db.promise().query(
      'SELECT * FROM users WHERE character_id = ? AND is_admin = true',
      [characterId]
    );

    if (users.length === 0) {
      return res.status(403).json({ error: 'Unauthorized: Admin access required' });
    }

    req.user = users[0];
    next();
  } catch (error) {
    console.error('Admin authentication error:', error);
    res.status(500).json({ error: 'Error during authentication' });
  }
};

// Helper function to send email notifications
const sendTicketEmail = async (userEmail, subject, message) => {
  if (!userEmail) return;
  
  try {
    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: userEmail,
      subject: subject,
      text: message
    });
    console.log('Email sent successfully');
  } catch (error) {
    console.error('Error sending email:', error);
  }
};

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

          // Create characters table if it doesn't exist
          const createCharactersTable = `
            CREATE TABLE IF NOT EXISTS characters (
              id INT AUTO_INCREMENT PRIMARY KEY,
              user_id INT NOT NULL,
              first_name VARCHAR(255) NOT NULL,
              last_name VARCHAR(255),
              citizen_id VARCHAR(255) UNIQUE NOT NULL,
              cash DECIMAL(10,2) DEFAULT 0.00,
              val_bank DECIMAL(10,2) DEFAULT 0.00,
              arm_bank DECIMAL(10,2) DEFAULT 0.00,
              rho_bank DECIMAL(10,2) DEFAULT 0.00,
              blk_bank DECIMAL(10,2) DEFAULT 0.00,
              bank DECIMAL(10,2) DEFAULT 0.00,
              blood_money DECIMAL(10,2) DEFAULT 0.00,
              vip_coins INT DEFAULT 0,
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              FOREIGN KEY (user_id) REFERENCES users(id)
            )
          `;
          
          db.query(createCharactersTable, (err) => {
            if (err) {
              console.error('Error creating characters table:', err);
            } else {
              console.log('Characters table ready');
            }
          });
        }
      });
    }
  });
});

// Discord webhook configuration
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const DISCORD_ADMIN_ROLE_ID = process.env.DISCORD_ADMIN_ROLE_ID;
const DISCORD_MOD_ROLE_ID = process.env.DISCORD_MOD_ROLE_ID;
const WEBSITE_URL = process.env.WEBSITE_URL || 'http://localhost:3001';

// Theme colors
const COLORS = {
  bloodRed: 0x8B0000,
  ashBlack: 0x1C1C1C,
  burntGold: 0xD4AF37,
  darkGold: 0x8B7355
};

// Discord notification styling
const DISCORD_COLORS = {
  new: COLORS.bloodRed,      // Blood red for new tickets
  open: COLORS.burntGold,    // Burnt gold for open tickets
  in_progress: COLORS.darkGold, // Dark gold for in-progress
  closed: COLORS.ashBlack,   // Ash black for closed tickets
  response: COLORS.bloodRed  // Blood red for admin responses
};

// Discord notification images
const TICKET_IMAGES = {
  player: `${WEBSITE_URL}/assets/images/player-report.png`,
  technical: `${WEBSITE_URL}/assets/images/technical-issue.png`,
  gameplay: `${WEBSITE_URL}/assets/images/gameplay-issue.png`,
  default: `${WEBSITE_URL}/assets/images/logo.png`
};

// Function to create a styled field
function createField(name, value, inline = false) {
  return {
    name: `**${name}**`,
    value: value ? value : 'N/A',
    inline: inline
  };
}

// Function to create a styled divider
function createDivider() {
  return createField('\u200b', '\u200b', false);
}

// Function to send Discord notification
async function sendDiscordNotification(type, data) {
  if (!DISCORD_WEBHOOK_URL) return;

  try {
    let embed = {
      color: DISCORD_COLORS[type],
      timestamp: new Date().toISOString(),
      url: `${WEBSITE_URL}/admin-tickets.html?id=${data.ticket.id}`,
      thumbnail: {
        url: TICKET_IMAGES[data.ticket.category?.toLowerCase()] || TICKET_IMAGES.default
      },
      author: {
        name: 'Diablo County RP Support',
        icon_url: `${WEBSITE_URL}/assets/images/logo.png`,
        url: WEBSITE_URL
      },
      footer: {
        text: `Ticket #${data.ticket.id} • Diablo County RP`,
        icon_url: `${WEBSITE_URL}/assets/images/logo.png`
      }
    };

    let content = '';

    switch (type) {
      case 'new':
        content = DISCORD_ADMIN_ROLE_ID ? `🚨 <@&${DISCORD_ADMIN_ROLE_ID}> New ticket requires attention!` : '';
        embed = {
          ...embed,
          title: '🎫 New Support Ticket',
          description: `A new support ticket has been created and requires attention.\n\n**Quick Actions**\n• [View Ticket](${WEBSITE_URL}/admin-tickets.html?id=${data.ticket.id})\n• [View All Tickets](${WEBSITE_URL}/admin-tickets.html)`,
          image: {
            url: `${WEBSITE_URL}/assets/images/ticket-banner.png`
          },
          fields: [
            createField('Subject', `\`${data.ticket.subject}\``),
            createField('Category', data.ticket.category, true),
            createField('Priority', getPriorityText(data.ticket.category), true),
            createDivider(),
            createField('Description', data.ticket.description.length > 1024 ? 
              data.ticket.description.substring(0, 1021) + '...' : 
              data.ticket.description),
            createDivider(),
            createField('Submitted By', `\`${data.user.character_id}\``, true),
            createField('Status', '`NEW`', true),
            createField('Created', `<t:${Math.floor(Date.now() / 1000)}:R>`, true)
          ]
        };
        break;

      case 'status':
        content = getStatusMention(data.newStatus);
        embed = {
          ...embed,
          title: `${getStatusEmoji(data.newStatus)} Status Update`,
          description: `The status of ticket [#${data.ticket.id}](${WEBSITE_URL}/admin-tickets.html?id=${data.ticket.id}) has been updated.`,
          fields: [
            createField('Ticket', `\`${data.ticket.subject}\``),
            createDivider(),
            createField('Previous Status', getStatusEmoji(data.ticket.status) + ' ' + data.ticket.status.toUpperCase(), true),
            createField('New Status', getStatusEmoji(data.newStatus) + ' ' + data.newStatus.toUpperCase(), true),
            createField('Updated By', `\`${data.user.character_id}\``, true),
            createField('Updated', `<t:${Math.floor(Date.now() / 1000)}:R>`, true)
          ]
        };
        break;

      case 'response':
        content = data.newStatus === 'closed' ? '' : 
                 (DISCORD_MOD_ROLE_ID ? `⚡ <@&${DISCORD_MOD_ROLE_ID}> Ticket updated` : '');
        embed = {
          ...embed,
          title: '💬 Admin Response',
          description: `An admin has responded to ticket [#${data.ticket.id}](${WEBSITE_URL}/admin-tickets.html?id=${data.ticket.id}).`,
          fields: [
            createField('Ticket', `\`${data.ticket.subject}\``),
            createDivider(),
            createField('Response', data.response.length > 1024 ? 
              data.response.substring(0, 1021) + '...' : 
              data.response),
            createDivider(),
            createField('Status', data.newStatus ? 
              getStatusEmoji(data.newStatus) + ' ' + data.newStatus.toUpperCase() : 
              'Unchanged', true),
            createField('Admin', `\`${data.user.character_id}\``, true),
            createField('Responded', `<t:${Math.floor(Date.now() / 1000)}:R>`, true)
          ]
        };
        break;
    }

    await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        content,
        embeds: [embed]
      })
    });
  } catch (error) {
    console.error('Error sending Discord notification:', error);
  }
}

// Helper functions for Discord notifications
function getPriorityEmoji(category) {
  switch (category.toLowerCase()) {
    case 'player':
      return '🚨'; // High priority
    case 'technical':
      return '⚠️'; // Medium priority
    case 'gameplay':
      return '📝'; // Normal priority
    default:
      return '❓'; // Unknown priority
  }
}

function getPriorityText(category) {
  const emoji = getPriorityEmoji(category);
  switch (category.toLowerCase()) {
    case 'player':
      return `${emoji} HIGH - Player Report`;
    case 'technical':
      return `${emoji} MEDIUM - Technical Issue`;
    case 'gameplay':
      return `${emoji} NORMAL - Gameplay Issue`;
    default:
      return `${emoji} NORMAL - Other Issue`;
  }
}

function getStatusEmoji(status) {
  switch (status.toLowerCase()) {
    case 'open':
      return '🟡'; // Yellow for open
    case 'in_progress':
      return '🔶'; // Orange diamond for in progress
    case 'closed':
      return '🔴'; // Red for closed
    default:
      return '⚪'; // White for unknown
  }
}

function getStatusMention(status) {
  switch (status.toLowerCase()) {
    case 'open':
      return DISCORD_ADMIN_ROLE_ID ? `🚨 <@&${DISCORD_ADMIN_ROLE_ID}> New ticket opened!` : '';
    case 'in_progress':
      return DISCORD_MOD_ROLE_ID ? `⚡ <@&${DISCORD_MOD_ROLE_ID}> Ticket in progress` : '';
    case 'closed':
      return '';
    default:
      return '';
  }
}

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

// Player info endpoint
app.get('/api/player-info', authenticateUser, async (req, res) => {
  try {
    console.log('Player info request received');
    console.log('Character ID:', req.headers['character-id']);

    // Get player info directly from players table
    const query = `
      SELECT p.citizenid, p.money, p.charinfo, COALESCE(v.amount, 0) as vip_coins 
      FROM players p 
      LEFT JOIN cas_vip_coin v ON v.identifier = p.citizenid 
      LIMIT 1`;
    
    console.log('Executing query:', query);
    
    const [players] = await db.promise().query(query);
    console.log('Query result:', players);

    if (players.length === 0) {
      console.log('No player found');
      return res.status(404).json({ error: 'Player not found' });
    }

    const player = players[0];
    console.log('Raw player data:', player);
    
    try {
      const moneyData = JSON.parse(player.money || '{}');
      const charInfo = JSON.parse(player.charinfo || '{}');
      console.log('Parsed money data:', moneyData);
      console.log('Parsed char info:', charInfo);

      res.json({
        citizenId: player.citizenid,
        firstName: charInfo.firstname || '',
        lastName: charInfo.lastname || '',
        vipCoins: parseInt(player.vip_coins) || 0,
        cash: parseFloat(moneyData.cash) || 0,
        valBank: parseFloat(moneyData.valbank) || 0,
        armBank: parseFloat(moneyData.armbank) || 0,
        rhoBank: parseFloat(moneyData.rhobank) || 0,
        blkBank: parseFloat(moneyData.blkbank) || 0,
        bank: parseFloat(moneyData.bank) || 0,
        bloodMoney: parseFloat(moneyData.bloodmoney) || 0
      });
    } catch (parseError) {
      console.error('Error parsing player data:', parseError);
      res.status(500).json({ error: 'Error parsing player data', details: parseError.message });
    }
  } catch (error) {
    console.error('Error fetching player info:', error);
    res.status(500).json({ error: 'Failed to fetch player info', details: error.message });
  }
});

// Ticket endpoints
app.post('/api/tickets', authenticateUser, async (req, res) => {
  try {
    const { subject, category, description } = req.body;

    if (!subject || !category || !description) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Insert the ticket
    const [result] = await db.promise().query(
      'INSERT INTO tickets (user_id, subject, category, description) VALUES (?, ?, ?, ?)',
      [req.user.id, subject, category, description]
    );

    // Get the created ticket
    const [tickets] = await db.promise().query(
      'SELECT * FROM tickets WHERE id = ?',
      [result.insertId]
    );

    if (tickets.length > 0) {
      // Send Discord notification
      await sendDiscordNotification('new', {
        ticket: tickets[0],
        user: req.user
      });
    }

    res.json({ 
      message: 'Ticket created successfully',
      ticket: tickets[0]
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

    // Update the ticket
    await db.promise().query(
      'UPDATE tickets SET status = ? WHERE id = ? AND user_id = ?',
      [status, id, req.user.id]
    );

    // Get updated ticket
    const [tickets] = await db.promise().query(
      'SELECT * FROM tickets WHERE id = ?',
      [id]
    );

    if (tickets.length > 0) {
      // Send Discord notification
      await sendDiscordNotification('status', {
        ticket: tickets[0],
        newStatus: status,
        user: req.user
      });
    }

    res.json({ success: true });
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

      // Update ticket status if provided
      if (status) {
        await connection.query(
          'UPDATE tickets SET status = ? WHERE id = ?',
          [status, id]
        );
      }

      // Get the ticket details
      const [tickets] = await connection.query(
        'SELECT t.*, u.email, u.character_id FROM tickets t JOIN users u ON t.user_id = u.id WHERE t.id = ?',
        [id]
      );

      if (tickets.length > 0) {
        // Send Discord notification
        await sendDiscordNotification('response', {
          ticket: tickets[0],
          response,
          newStatus: status,
          user: req.user
        });

        // Send email if requested
        if (sendEmail && tickets[0].email) {
          await sendTicketEmail(
            tickets[0].email,
            `Ticket Update: ${tickets[0].subject}`,
            `
              <h2>Your ticket has been updated</h2>
              <p>An admin has responded to your ticket:</p>
              <div style="background: #f5f5f5; padding: 15px; margin: 10px 0;">
                ${response}
              </div>
              <p>Current status: ${status || tickets[0].status}</p>
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
