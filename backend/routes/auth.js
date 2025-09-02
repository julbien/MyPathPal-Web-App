const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const https = require('https');

// Function to verify reCAPTCHA
async function verifyRecaptcha(recaptchaResponse) {
    return new Promise((resolve, reject) => {
        const secretKey = '6Ldq6JMrAAAAAEuAAvnY8qbA0kf_UPLXz3Of2ZtL'; 
        const url = `https://www.google.com/recaptcha/api/siteverify?secret=${secretKey}&response=${recaptchaResponse}`;
        
        https.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    resolve(result.success);
                } catch (error) {
                    reject(error);
                }
            });
        }).on('error', (error) => {
            reject(error);
        });
    });
}

router.post('/register', async (req, res) => {
    try {
        const { username, email, phone, password, recaptchaResponse } = req.body;

        if (!username || !email || !phone || !password) {
            return res.status(400).json({ success: false, message: 'All fields are required' });
        }

        if (!recaptchaResponse) {
            return res.status(400).json({ success: false, message: 'reCAPTCHA verification is required' });
        }

        // Verify reCAPTCHA
        const isRecaptchaValid = await verifyRecaptcha(recaptchaResponse);
        if (!isRecaptchaValid) {
            return res.status(400).json({ success: false, message: 'reCAPTCHA verification failed' });
        }

        const [existingUser] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        if (existingUser.length > 0) {
            return res.status(400).json({ success: false, message: 'Email already exists' });
        }

        const [existingUsername] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
        if (existingUsername.length > 0) {
            return res.status(400).json({ success: false, message: 'Username already exists' });
        }

        const [existingPhone] = await db.query('SELECT * FROM users WHERE phone_number = ?', [phone]);
        if (existingPhone.length > 0) {
            return res.status(400).json({ success: false, message: 'Phone number already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        await db.query(
            'INSERT INTO users (username, email, phone_number, password_hash, user_type) VALUES (?, ?, ?, ?, ?)',
            [username, email, phone, hashedPassword, 'user']
        );

        res.status(201).json({ success: true, message: 'Registration successful' });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ success: false, message: 'Registration failed' });
    }
});

router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email and password are required' });
        }

        const [users] = await db.query(
            'SELECT * FROM users WHERE email = ?',
            [email]
        );

        if (users.length === 0) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        const user = users[0];

        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        req.session.user = {
            user_id: user.user_id,
            username: user.username,
            email: user.email,
            user_type: user.user_type
        };

       res.json({
            success: true,
            user: {
                user_id: user.user_id,
                username: user.username,
                email: user.email,
                phone: user.phone_number, 
                user_type: user.user_type
            },
            message: 'Login successful'
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, message: 'Login failed', error: error.message, stack: error.stack });
    }
});

router.post('/forgot-password/', async (req, res) => {
    try {
        const { email } = req.body;
        const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);

        if (users.length === 0) {
            return res.json({ success: true, message: 'If a user with that email exists, a password reset OTP has been sent.' });
        }

        const user = users[0];
        const otp = crypto.randomInt(1000, 10000).toString();
        const expires = new Date(Date.now() + 10 * 60 * 1000);
        const hashedOtp = await bcrypt.hash(otp, 10);

        await db.query('DELETE FROM password_resets WHERE user_id = ? AND used = FALSE', [user.user_id]);

        await db.query(
            'INSERT INTO password_resets (user_id, token, expires_at, used) VALUES (?, ?, ?, FALSE)',
            [user.user_id, hashedOtp, expires]
        );

        const transporter = nodemailer.createTransport({
            host: process.env.EMAIL_HOST,
            port: process.env.EMAIL_PORT,
            secure: process.env.EMAIL_PORT == 465,
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
            },
        });

        await transporter.sendMail({
            from: process.env.EMAIL_FROM,
            to: email,
            subject: 'Your Password Reset OTP',
            text: `Your password reset OTP is: ${otp}. It will expire in 10 minutes.`,
            html: `<p>Your password reset OTP is: <strong>${otp}</strong>. It will expire in 10 minutes.</p>`,
        });
        
        res.json({ success: true, message: 'A password reset OTP has been sent to your email.' });

    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ success: false, message: 'Failed to send password reset email.' });
    }
});

router.post('/verify-otp', async (req, res) => {
    try {
        const { email, otp } = req.body;
        const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        
        if (users.length === 0) {
            return res.status(400).json({ success: false, message: 'Invalid OTP or email.' });
        }
        
        const user = users[0];
        const now = new Date();

        const [resets] = await db.query(
            'SELECT * FROM password_resets WHERE user_id = ? AND used = FALSE AND expires_at > ? ORDER BY expires_at DESC LIMIT 1',
            [user.user_id, now]
        );

        if (resets.length === 0) {
            return res.status(400).json({ success: false, message: 'OTP has expired or is invalid.' });
        }

        const reset = resets[0];
        const validOtp = await bcrypt.compare(otp, reset.token);
        if (!validOtp) {
            return res.status(400).json({ success: false, message: 'Invalid OTP.' });
        }

        res.json({ success: true, message: 'OTP verified successfully.' });
        
    } catch (error) {
        console.error('Verify OTP error:', error);
        res.status(500).json({ success: false, message: 'Failed to verify OTP.' });
    }
});

router.post('/reset-password', async (req, res) => {
    try {
        const { email, otp, newPassword } = req.body;
        const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);

        if (users.length === 0) {
            return res.status(400).json({ success: false, message: 'Invalid request.' });
        }
        
        const user = users[0];
        const now = new Date();

        const [resets] = await db.query(
            'SELECT * FROM password_resets WHERE user_id = ? AND used = FALSE AND expires_at > ? ORDER BY expires_at DESC LIMIT 1',
            [user.user_id, now]
        );

        if (resets.length === 0) {
            return res.status(400).json({ success: false, message: 'Your password reset token has expired. Please try again.' });
        }

        const reset = resets[0];
        const validOtp = await bcrypt.compare(otp, reset.token);
        if (!validOtp) {
            return res.status(400).json({ success: false, message: 'Invalid token. Please try again.' });
        }
        
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await db.query('UPDATE users SET password_hash = ? WHERE email = ?', [hashedPassword, email]);
        await db.query('UPDATE password_resets SET used = TRUE WHERE reset_id = ?', [reset.reset_id]);

        res.json({ success: true, message: 'Password has been reset successfully.' });
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ success: false, message: 'Failed to reset password.' });
    }
});

router.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Logout failed' });
        }
        res.json({ success: true, message: 'Logout successful' });
    });
});

module.exports = router;
