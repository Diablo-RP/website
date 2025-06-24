const express = require('express');
const mysql = require('mysql2');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const nodemailer = require('nodemailer');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
require('dotenv').config();
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const { 
  Client, 
  GatewayIntentBits, 
  ActivityType, 
  Partials 
} = require('discord.js');

// PayPal configuration
const PAYPAL_CLIENT_ID = 'AZLUOzUrxbmSfcgkUnygNj1R2VLv7h09GlS-GW-0aESQNcxald90D58h4j25bUP_NLDUkCVGJ_cLuoV1';
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET; // Make sure to add this to your .env file
const PAYPAL_API = 'https://api-m.paypal.com';

// Discord configuration
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_REDIRECT_URI = `${process.env.WEBSITE_URL}/api/discord/callback`;

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // Serve static files from current directory

// Add this to handle HTML file requests
app.get('*.html', (req, res) => {
  res.sendFile(__dirname + req.path);
});

// Session configuration
const sessionConfig = {
  name: 'session',
  secret: 'secret',
  store: new MySQLStore({
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: '',
    database: 'rsg_dev'
  }),
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 7 // 1 week
  }
};

app.use(session(sessionConfig));

// Initialize Discord bot if token is provided
let discord = null;
if (process.env.DISCORD_BOT_TOKEN) {
  try {
    discord = new Client({ 
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages
      ] 
    });

    discord.login(process.env.DISCORD_BOT_TOKEN)
      .then(() => {
        console.log('Discord bot connected successfully');
        // Set bot status
        discord.user.setPresence({
          activities: [{ name: 'Support Tickets', type: ActivityType.Watching }],
          status: 'online'
        });
      })
      .catch(error => {
        console.warn('Failed to initialize Discord bot:', error.message);
        discord = null;
      });

    // Add ready event handler
    discord.on('ready', () => {
      console.log(`Logged in as ${discord.user.tag}!`);
    });

  } catch (error) {
    console.warn('Failed to initialize Discord bot:', error.message);
    discord = null;
  }
}

// Login endpoint
app.post('/api/login', async (req, res) => {
  try {
    const { characterId, password } = req.body;
    
    // Query the database for the user
    const [users] = await db.promise().query(
      'SELECT * FROM users WHERE character_id = ?',
      [characterId]
    );

    if (users.length === 0) {
      return res.status(401).json({ error: 'Invalid character ID or password' });
    }

    const user = users[0];
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid character ID or password' });
    }

    // Store user info in session
    req.session.user = {
      id: user.id,
      characterId: user.character_id,
      isAdmin: user.is_admin === 1
    };

    // Send back user info (excluding sensitive data)
    res.json({
      userId: user.id,
      characterId: user.character_id,
      isAdmin: user.is_admin === 1,
      message: 'Login successful'
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

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
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'You must be logged in to access this endpoint' });
  }

  try {
    const [users] = await db.promise().query(
      'SELECT * FROM users WHERE id = ?',
      [req.session.user.id]
    );

    if (users.length === 0) {
      return res.status(401).json({ error: 'Invalid user session' });
    }

    req.user = users[0];
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Admin authentication middleware
const authenticateAdmin = async (req, res, next) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'You must be logged in to access this endpoint' });
  }

  try {
    const [users] = await db.promise().query(
      'SELECT * FROM users WHERE id = ? AND is_admin = true',
      [req.session.user.id]
    );

    if (users.length === 0) {
      return res.status(403).json({ error: 'Unauthorized: Admin access required' });
    }

    req.user = users[0];
    next();
  } catch (error) {
    console.error('Admin authentication error:', error);
    res.status(500).json({ error: 'Internal server error' });
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

          // Create transactions table if it doesn't exist
          const createTransactionsTable = `
            CREATE TABLE IF NOT EXISTS transactions (
              id INT AUTO_INCREMENT PRIMARY KEY,
              order_id VARCHAR(255) NOT NULL,
              payer_id VARCHAR(255) NOT NULL,
              payment_id VARCHAR(255) NOT NULL,
              item_name VARCHAR(255) NOT NULL,
              amount DECIMAL(10,2) NOT NULL,
              status ENUM('pending', 'completed', 'failed') DEFAULT 'pending',
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
          `;
          
          db.query(createTransactionsTable, (err) => {
            if (err) {
              console.error('Error creating transactions table:', err);
            } else {
              console.log('Transactions table ready');
            }
          });

          // Create subscriptions table
          const createSubscriptionsTable = `
            CREATE TABLE IF NOT EXISTS subscriptions (
              id INT AUTO_INCREMENT PRIMARY KEY,
              subscription_id VARCHAR(255) NOT NULL,
              user_id INT,
              tier VARCHAR(50) NOT NULL,
              status ENUM('active', 'cancelled', 'expired') DEFAULT 'active',
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              expires_at TIMESTAMP NULL DEFAULT NULL,
              FOREIGN KEY (user_id) REFERENCES users(id)
            )
          `;
          
          db.query(createSubscriptionsTable, (err) => {
            if (err) {
              console.error('Error creating subscriptions table:', err);
            } else {
              console.log('Subscriptions table ready');
            }
          });
        }
      });
    }
  });
});

// Discord OAuth2 endpoints
app.get('/api/discord/auth', (req, res) => {
  const characterId = req.query.characterId;
  if (!characterId) {
    return res.status(400).json({ error: 'Character ID is required' });
  }

  // Store characterId in session for verification during callback
  req.session.linkCharacterId = characterId;

  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: DISCORD_REDIRECT_URI,
    response_type: 'code',
    scope: 'identify',
    state: characterId
  });

  res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
});

app.get('/api/discord/callback', async (req, res) => {
  const { code, state } = req.query;
  const characterId = state;

  if (!code || !characterId) {
    return res.status(400).send('Missing required parameters');
  }

  try {
    // Exchange code for access token
    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: DISCORD_REDIRECT_URI
      })
    });

    const tokenData = await tokenResponse.json();

    // Get user info
    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`
      }
    });

    const userData = await userResponse.json();

    // Store Discord info in database
    const [result] = await db.promise().query(
      'INSERT INTO discord_links (character_id, discord_id, discord_username) VALUES (?, ?, ?) ' +
      'ON DUPLICATE KEY UPDATE discord_username = ?',
      [characterId, userData.id, userData.username, userData.username]
    );

    // Send success message back to opener window
    res.send(`
      <script>
        window.opener.postMessage({
          type: 'DISCORD_LINKED',
          discordId: '${userData.id}',
          username: '${userData.username}'
        }, 'http://localhost:3001');
        window.close();
      </script>
    `);

  } catch (error) {
    console.error('Discord auth error:', error);
    res.status(500).send('Error linking Discord account');
  }
});

app.post('/api/discord/unlink', async (req, res) => {
  const { characterId } = req.body;
  if (!characterId) {
    return res.status(400).json({ error: 'Character ID is required' });
  }

  try {
    await db.promise().query(
      'DELETE FROM discord_links WHERE character_id = ?',
      [characterId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Discord unlink error:', error);
    res.status(500).json({ error: 'Error unlinking Discord account' });
  }
});

// Add this endpoint to check Discord link status
app.get('/api/discord/status/:characterId', async (req, res) => {
  const { characterId } = req.params;
  
  try {
    const [rows] = await db.promise().query(
      'SELECT discord_id, discord_username FROM discord_links WHERE character_id = ?',
      [characterId]
    );

    if (rows.length > 0) {
      res.json({
        isLinked: true,
        discordUsername: rows[0].discord_username,
        discordId: rows[0].discord_id
      });
    } else {
      res.json({
        isLinked: false
      });
    }
  } catch (error) {
    console.error('Error checking Discord status:', error);
    res.status(500).json({ error: 'Failed to check Discord status' });
  }
});

// Ticket endpoints
app.post('/api/tickets', authenticateUser, async (req, res) => {
  try {
    const { subject, category, description, discordId } = req.body;

    if (!subject || !category || !description) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Insert the ticket
    const [result] = await db.promise().query(
      'INSERT INTO tickets (user_id, subject, category, description) VALUES (?, ?, ?, ?)',
      [req.session.user.id, subject, category, description]
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
        user: req.session.user
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
      [req.session.user.id]
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
      [status, id, req.session.user.id]
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
        user: req.session.user
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
        [id, req.session.user.id, response]
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
          user: req.session.user
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

// Authentication check endpoint
app.get('/api/check-auth', (req, res) => {
  if (!req.session || !req.session.user) {
    return res.json({ isAuthenticated: false });
  }
  res.json({ isAuthenticated: true });
});

// Process subscription endpoint
app.post('/api/process-subscription', async (req, res) => {
  // Check if user is authenticated
  if (!req.session || !req.session.user) {
    return res.status(401).json({ 
      success: false, 
      message: 'You must be logged in to subscribe' 
    });
  }

  try {
    const { subscriptionID, tier } = req.body;
    const userId = req.session.user.id;

    // Verify subscription with PayPal
    const response = await fetch(`${PAYPAL_API}/v1/billing/subscriptions/${subscriptionID}`, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64')}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();
    
    if (data.status === 'ACTIVE') {
      // Check if user already has an active subscription
      const [existingSub] = await db.promise().query(
        'SELECT * FROM subscriptions WHERE user_id = ? AND status = ?',
        [userId, 'active']
      );

      if (existingSub.length > 0) {
        // Update existing subscription
        await db.promise().query(
          'UPDATE subscriptions SET status = ? WHERE user_id = ? AND status = ?',
          ['cancelled', userId, 'active']
        );
      }

      // Insert new subscription
      await db.promise().query(
        'INSERT INTO subscriptions (subscription_id, user_id, tier, status) VALUES (?, ?, ?, ?)',
        [subscriptionID, userId, tier, 'active']
      );

      res.json({ 
        success: true, 
        message: 'Subscription processed successfully' 
      });
    } else {
      res.status(400).json({ 
        success: false, 
        message: 'Subscription activation failed' 
      });
    }
  } catch (error) {
    console.error('Subscription processing error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error processing subscription' 
    });
  }
});

// Process PayPal payment
app.post('/api/process-payment', async (req, res) => {
  try {
    const { orderID, payerID, paymentID, itemName } = req.body;

    // Verify the payment with PayPal
    const response = await fetch(`${PAYPAL_API}/v2/checkout/orders/${orderID}/capture`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64')}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();

    if (data.status === 'COMPLETED') {
      // Save the transaction to database
      await db.promise().query(
        'INSERT INTO transactions (order_id, payer_id, payment_id, item_name, amount, status) VALUES (?, ?, ?, ?, ?, ?)',
        [orderID, payerID, paymentID, itemName, data.purchase_units[0].amount.value, 'completed']
      );

      res.json({ success: true, message: 'Payment processed successfully' });
    } else {
      res.status(400).json({ success: false, message: 'Payment failed' });
    }
  } catch (error) {
    console.error('Payment processing error:', error);
    res.status(500).json({ success: false, message: 'Error processing payment' });
  }
});

// Process PayPal subscription
app.post('/api/process-subscription', async (req, res) => {
  try {
    const { subscriptionID, tier } = req.body;

    // Verify the subscription with PayPal
    const response = await fetch(`${PAYPAL_API}/v1/billing/subscriptions/${subscriptionID}`, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64')}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();

    if (data.status === 'ACTIVE') {
      // Save the subscription to database
      await db.promise().query(
        'INSERT INTO subscriptions (subscription_id, tier, status) VALUES (?, ?, ?)',
        [subscriptionID, tier, 'active']
      );

      res.json({ success: true, message: 'Subscription processed successfully' });
    } else {
      res.status(400).json({ success: false, message: 'Subscription activation failed' });
    }
  } catch (error) {
    console.error('Subscription processing error:', error);
    res.status(500).json({ success: false, message: 'Error processing subscription' });
  }
});

// Webhook to handle subscription status updates
app.post('/api/subscription-webhook', async (req, res) => {
  try {
    const event = req.body;

    // Verify webhook authenticity with PayPal
    // Implementation depends on PayPal webhook verification method

    if (event.event_type === 'BILLING.SUBSCRIPTION.CANCELLED') {
      await db.promise().query(
        'UPDATE subscriptions SET status = ? WHERE subscription_id = ?',
        ['cancelled', event.resource.id]
      );
    } else if (event.event_type === 'BILLING.SUBSCRIPTION.EXPIRED') {
      await db.promise().query(
        'UPDATE subscriptions SET status = ? WHERE subscription_id = ?',
        ['expired', event.resource.id]
      );
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ success: false });
  }
});

// Discord notification styling
const DISCORD_COLORS = {
  new: 0x8B0000,      // Blood red for new tickets
  open: 0xD4AF37,    // Burnt gold for open tickets
  in_progress: 0x8B7355, // Dark gold for in-progress
  closed: 0x1C1C1C,   // Ash black for closed tickets
  response: 0x8B0000  // Blood red for admin responses
};

// Discord notification images
const DISCORD_IMAGES = {
  new: `${process.env.WEBSITE_URL}/assets/images/ticket-banner.png`,
  open: `${process.env.WEBSITE_URL}/assets/images/ticket-banner.png`,
  closed: `${process.env.WEBSITE_URL}/assets/images/ticket-banner.png`,
  response: `${process.env.WEBSITE_URL}/assets/images/ticket-banner.png`,
  player: `${process.env.WEBSITE_URL}/assets/images/player-report.png`,
  technical: `${process.env.WEBSITE_URL}/assets/images/technical-issue.png`,
  gameplay: `${process.env.WEBSITE_URL}/assets/images/gameplay-issue.png`,
  other: `${process.env.WEBSITE_URL}/assets/images/ticket-banner.png`
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
  if (!discord) {
    console.log('Discord notification skipped - bot not initialized');
    return;
  }

  try {
    let embed = {
      color: DISCORD_COLORS[type],
      timestamp: new Date().toISOString(),
      url: `${process.env.WEBSITE_URL}/admin-tickets.html?id=${data.ticket.id}`,
      thumbnail: {
        url: DISCORD_IMAGES[data.ticket.category?.toLowerCase()] || DISCORD_IMAGES.other
      },
      author: {
        name: 'Diablo County RP Support',
        icon_url: `${process.env.WEBSITE_URL}/assets/images/logo.png`,
        url: process.env.WEBSITE_URL
      },
      footer: {
        text: `Ticket #${data.ticket.id} • Diablo County RP`,
        icon_url: `${process.env.WEBSITE_URL}/assets/images/logo.png`
      }
    };

    let content = '';

    switch (type) {
      case 'new':
        content = DISCORD_ADMIN_ROLE_ID ? `🚨 <@&${DISCORD_ADMIN_ROLE_ID}> New ticket requires attention!` : '';
        embed = {
          ...embed,
          title: '🎫 New Support Ticket',
          description: `A new support ticket has been created and requires attention.\n\n**Quick Actions**\n• [View Ticket](${process.env.WEBSITE_URL}/admin-tickets.html?id=${data.ticket.id})\n• [View All Tickets](${process.env.WEBSITE_URL}/admin-tickets.html)`,
          image: {
            url: `${process.env.WEBSITE_URL}/assets/images/ticket-banner.png`
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
          description: `The status of ticket [#${data.ticket.id}](${process.env.WEBSITE_URL}/admin-tickets.html?id=${data.ticket.id}) has been updated.`,
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
          description: `An admin has responded to ticket [#${data.ticket.id}](${process.env.WEBSITE_URL}/admin-tickets.html?id=${data.ticket.id}).`,
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

    // Add thumbnail if available
    const thumbnailUrl = DISCORD_IMAGES[type] || 
                        DISCORD_IMAGES[data.ticket.category?.toLowerCase()] || 
                        DISCORD_IMAGES.other;
    if (thumbnailUrl) {
      embed.thumbnail = { url: thumbnailUrl };
    }

    // Send the notification
    await discord.channels.cache.get(DISCORD_WEBHOOK_CHANNEL_ID).send({ content, embeds: [embed] });
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

// Player info endpoint
app.get('/api/player-info', authenticateUser, async (req, res) => {
  try {
    console.log('Player info request received');
    const characterId = req.session.user.characterId;
    console.log('Character ID:', characterId);

    // Try different formats of the character ID
    const plainId = characterId.replace('DC-', '');
    const dcId = 'DC-' + plainId;
    console.log('Trying IDs:', { plainId, dcId });

    // Debug query to see what's in the players table
    const debugQuery = `SELECT citizenid FROM players LIMIT 5`;
    const [debugResults] = await db.promise().query(debugQuery);
    console.log('Sample citizenids in players table:', debugResults);

    // First check if the player exists - try all possible formats
    const playerQuery = `
      SELECT p.citizenid, p.money, p.charinfo, p.license
      FROM players p 
      WHERE p.citizenid = ?
         OR p.citizenid = ?
         OR p.citizenid = LOWER(?)
         OR p.citizenid = LOWER(?)`;
    
    console.log('Executing player query:', playerQuery);
    const [players] = await db.promise().query(playerQuery, [characterId, plainId, characterId, plainId]);
    console.log('Player query results:', players);
    
    if (players.length === 0) {
      console.log('No player found');
      return res.status(404).json({ error: 'Player not found' });
    }

    const player = players[0];
    const actualCitizenId = player.citizenid;
    console.log('Found player with citizenid:', actualCitizenId);

    // Get VIP coins - try both formats of ID
    const vipQuery = `
      SELECT amount as vip_coins
      FROM cas_vip_coin
      WHERE identifier = ? OR identifier = ?`;
    
    console.log('Executing VIP query:', vipQuery);
    const [vipResults] = await db.promise().query(vipQuery, [actualCitizenId, characterId]);
    
    try {
      const moneyData = JSON.parse(player.money || '{}');
      const charInfo = JSON.parse(player.charinfo || '{}');
      console.log('Parsed money data:', moneyData);
      console.log('Parsed char info:', charInfo);

      res.json({
        citizenId: player.citizenid,
        firstName: charInfo.firstname || '',
        lastName: charInfo.lastname || '',
        license: player.license,
        vipCoins: vipResults.length > 0 ? parseInt(vipResults[0].vip_coins) : 0,
        diabloCoins: 0, // We'll add this back once we confirm VIP coins work
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
    console.error('Full error details:', error.stack);
    res.status(500).json({ error: 'Failed to fetch player info', details: error.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
