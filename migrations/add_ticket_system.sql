-- Add email and is_admin columns to users table
ALTER TABLE users 
ADD COLUMN email VARCHAR(255) AFTER character_id,
ADD COLUMN is_admin BOOLEAN DEFAULT FALSE AFTER email;

-- Create ticket_responses table if it doesn't exist
CREATE TABLE IF NOT EXISTS ticket_responses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ticket_id INT NOT NULL,
  admin_id INT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ticket_id) REFERENCES tickets(id),
  FOREIGN KEY (admin_id) REFERENCES users(id)
);

-- Make DC-5926 an admin
UPDATE users SET is_admin = TRUE WHERE character_id = 'DC-5926';
