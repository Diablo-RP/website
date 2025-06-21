-- Create the database if it doesn't exist
CREATE DATABASE IF NOT EXISTS Diablorp;

-- Switch to the database
USE Diablorp;

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    steam_id VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    character_id VARCHAR(255) UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
