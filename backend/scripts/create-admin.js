const bcrypt = require('bcrypt');
const db = require('../db');

async function createAdminUser() {
    try {
        const username = 'admin';
        const email = 'admin@pathpal.com';
        const phone = '1234567890';
        const password = 'admin123';
        const userType = 'admin';

        const hashedPassword = await bcrypt.hash(password, 10);

        await db.query(
            'INSERT INTO users (username, email, phone_number, password_hash, user_type) VALUES (?, ?, ?, ?, ?)',
            [username, email, phone, hashedPassword, userType]
        );

        console.log('Admin user created successfully!');
        console.log('Username: admin');
        console.log('Password: admin123');
        process.exit(0);
    } catch (error) {
        console.error('Error creating admin user:', error);
        process.exit(1);
    }
}

createAdminUser();