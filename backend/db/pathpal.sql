-- Create the database
CREATE DATABASE IF NOT EXISTS pathpal_db;
USE pathpal_db;

-- USERS TABLE (Admin and Users)
CREATE TABLE users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(100) NOT NULL UNIQUE,
    phone_number VARCHAR(20) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    user_type ENUM('user', 'admin') DEFAULT 'user',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- DEVICES ADDED BY ADMIN
-- Device Status System:
-- 'available': Device exists but no user has linked it
-- 'linked': Device is currently linked to a user
-- 'unlinked': Device was previously linked but has been unlinked (cannot be linked again)
CREATE TABLE devices (
    device_id INT AUTO_INCREMENT PRIMARY KEY,
    serial_number VARCHAR(11) NOT NULL UNIQUE,
    status ENUM('available', 'linked', 'unlinked') DEFAULT 'available',
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- DEVICES LINKED BY USERS
-- Linked Device Status System:
-- 'active': Device is currently linked and active
-- 'unlinked': Device was unlinked by user (preserves history and reason)
-- 'offline': Device is linked but currently offline
-- unlink_reason: Stores the reason why device was unlinked (shown in tooltips)
CREATE TABLE linked_devices (
    linked_device_id INT AUTO_INCREMENT PRIMARY KEY,
    serial_number VARCHAR(11) NOT NULL,
    device_name VARCHAR(100) NOT NULL,
    user_id INT NOT NULL,
    status ENUM('active', 'unlinked', 'offline') DEFAULT 'active',
    battery_level INT DEFAULT 100,
    linked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    unlink_reason TEXT DEFAULT NULL,
    FOREIGN KEY (user_id) REFERENCES users(user_id),
    FOREIGN KEY (serial_number) REFERENCES devices(serial_number)
);

-- GPS LOCATION LOGS
CREATE TABLE location_logs (
    location_id INT AUTO_INCREMENT PRIMARY KEY,
    serial_number VARCHAR(11) NOT NULL,
    user_id INT NOT NULL,
    latitude DECIMAL(10, 7) NOT NULL,
    longitude DECIMAL(10, 7) NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (serial_number) REFERENCES devices(serial_number),
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- OBSTACLE LOGS
CREATE TABLE obstacle_logs (
    obstacle_id INT AUTO_INCREMENT PRIMARY KEY,
    serial_number VARCHAR(11) NOT NULL,
    user_id INT NOT NULL,
    date DATE NOT NULL,
    time TIME NOT NULL,
    detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    location_lat DECIMAL(10, 7),
    location_lng DECIMAL(10, 7),
    FOREIGN KEY (serial_number) REFERENCES devices(serial_number),
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- DAILY USAGE LOGS
CREATE TABLE usage_logs (
    usage_id INT AUTO_INCREMENT PRIMARY KEY,
    serial_number VARCHAR(11) NOT NULL,
    user_id INT NOT NULL,
    date DATE NOT NULL,
    duration INT DEFAULT 0,
    battery_used INT DEFAULT 0,
    FOREIGN KEY (serial_number) REFERENCES devices(serial_number),
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- EMERGENCY BUTTON LOGS
CREATE TABLE emergency_logs (
    emergency_id INT AUTO_INCREMENT PRIMARY KEY,
    serial_number VARCHAR(11) NOT NULL,
    user_id INT NOT NULL,
    date DATE NOT NULL,
    time TIME NOT NULL,
    location VARCHAR(255),
    pressed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    location_lat DECIMAL(10, 7),
    location_lng DECIMAL(10, 7),
    resolved BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (serial_number) REFERENCES devices(serial_number),
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- NOTIFICATIONS
CREATE TABLE notifications (
    notification_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    message TEXT NOT NULL,
    type ENUM('system', 'emergency', 'device_status') DEFAULT 'system',
    is_read BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- PASSWORD RESET TOKENS
CREATE TABLE password_resets (
    reset_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    token VARCHAR(255) NOT NULL,
    expires_at DATETIME NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);