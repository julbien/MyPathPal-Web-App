const mysql = require('mysql2/promise');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

async function setupDatabase() {
    let connection;
    try {
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
        });

        console.log('Connected to MySQL server');

        await connection.query('DROP DATABASE IF EXISTS pathpal_db');
        await connection.query('CREATE DATABASE pathpal_db');
        console.log('Database created successfully');

        await connection.query('USE pathpal_db');

        const sqlFile = await fs.readFile(path.join(__dirname, 'pathpal.sql'), 'utf8');
        const statements = sqlFile
            .split(';')
            .filter(stmt => stmt.trim())
            .filter(stmt => !stmt.toLowerCase().includes('create database'));

        for (const statement of statements) {
            if (statement.trim()) {
                await connection.query(statement);
                console.log('Executed SQL statement successfully');
            }
        }

        const [tables] = await connection.query('SHOW TABLES');
        console.log('Created tables:', tables.map(t => Object.values(t)[0]));

        console.log('Database setup completed successfully!');
    } catch (error) {
        console.error('Error setting up database:', error);
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

setupDatabase(); 