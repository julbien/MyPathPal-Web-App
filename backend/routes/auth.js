const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const https = require('https');
const { loginRateLimit } = require('../middleware/rateLimiter');

// Notify all admins helper (no new files)
async function notifyAdmins(message, type = 'admin') {
    try {
        await db.query(
            "INSERT INTO notifications (user_id, message, type) SELECT user_id, ?, ? FROM users WHERE user_type = 'admin'",
            [message, type]
        );
    } catch (error) {
        console.error('Error notifying admins:', error);
    }
}

// Helper function to create notifications
async function createNotification(userId, message, type = 'system') {
    try {
        await db.query(
            'INSERT INTO notifications (user_id, message, type) VALUES (?, ?, ?)',
            [userId, message, type]
        );
    } catch (error) {
        console.error('Error creating notification:', error);
    }
}

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

// Registration - Step 1: validate inputs, send OTP, store pending data in session
router.post('/register', async (req, res) => {
    try {
        const { username, email, phone, password, recaptchaResponse } = req.body;

        if (!username || !email || !phone || !password) {
            return res.status(400).json({ success: false, message: 'All fields are required' });
        }

        if (!recaptchaResponse) {
            return res.status(400).json({ success: false, message: 'reCAPTCHA verification is required' });
        }

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

        const passwordHash = await bcrypt.hash(password, 10);

        // Generate and send OTP (4-digit to match forgot password)
        const otp = crypto.randomInt(1000, 10000).toString(); // 4-digit
        const otpHash = await bcrypt.hash(otp, 10);
        const otpExpiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes
        const resendCooldownMs = 60 * 1000; // 60s

        req.session.pendingRegistration = {
            username,
            email,
            phone,
            passwordHash,
            otpHash,
            otpExpiresAt,
            lastOtpSentAt: Date.now(),
            resendCooldownMs
        };

        const transporter = nodemailer.createTransport({
            host: process.env.EMAIL_HOST,
            port: process.env.EMAIL_PORT,
            secure: process.env.EMAIL_PORT == 465,
            auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
        });

        await transporter.sendMail({
            from: process.env.EMAIL_FROM,
            to: email,
            subject: 'Your PathPal Registration OTP',
            text: `Your 4-digit registration OTP is: ${otp}. It expires in 10 minutes.`,
            html: `<p>Your 4-digit registration OTP is: <strong>${otp}</strong>. It expires in 10 minutes.</p>`
        });

        res.json({ success: true, message: 'OTP sent to your email.', resendSeconds: Math.floor(resendCooldownMs / 1000) });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ success: false, message: 'Failed to start registration.' });
    }
});

// Registration - Resend OTP
router.post('/register-resend', async (req, res) => {
    try {
        const { email } = req.body;
        const pending = req.session.pendingRegistration;
        if (!pending || pending.email !== email) {
            return res.status(400).json({ success: false, message: 'No pending registration for this email.' });
        }
        const now = Date.now();
        const remaining = (pending.lastOtpSentAt + pending.resendCooldownMs) - now;
        if (remaining > 0) {
            return res.status(429).json({ success: false, message: 'Please wait before resending OTP.', secondsRemaining: Math.ceil(remaining / 1000) });
        }

        const otp = crypto.randomInt(1000, 10000).toString(); // 4-digit
        pending.otpHash = await bcrypt.hash(otp, 10);
        pending.otpExpiresAt = now + 10 * 60 * 1000;
        pending.lastOtpSentAt = now;

        const transporter = nodemailer.createTransport({
            host: process.env.EMAIL_HOST,
            port: process.env.EMAIL_PORT,
            secure: process.env.EMAIL_PORT == 465,
            auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
        });

        await transporter.sendMail({
            from: process.env.EMAIL_FROM,
            to: pending.email,
            subject: 'Your PathPal Registration OTP',
            text: `Your 4-digit registration OTP is: ${otp}. It expires in 10 minutes.`,
            html: `<p>Your 4-digit registration OTP is: <strong>${otp}</strong>. It expires in 10 minutes.</p>`
        });

        res.json({ success: true, message: 'OTP resent.', resendSeconds: Math.floor(pending.resendCooldownMs / 1000) });
    } catch (error) {
        console.error('Resend registration OTP error:', error);
        res.status(500).json({ success: false, message: 'Failed to resend OTP.' });
    }
});

// Registration - Step 2: Verify OTP and create account
router.post('/register-complete', async (req, res) => {
    try {
        const { email, otp } = req.body;
        const pending = req.session.pendingRegistration;

        if (!pending || pending.email !== email) {
            return res.status(400).json({ success: false, message: 'No pending registration for this email.' });
        }

        if (!otp) {
            return res.status(400).json({ success: false, message: 'OTP is required.' });
        }

        if (Date.now() > pending.otpExpiresAt) {
            return res.status(400).json({ success: false, message: 'OTP has expired. Please resend.' });
        }

        const match = await bcrypt.compare(otp, pending.otpHash);
        if (!match) {
            return res.status(400).json({ success: false, message: 'Invalid OTP. Please try again.' });
        }

        const [result] = await db.query(
            'INSERT INTO users (username, email, phone_number, password_hash, user_type) VALUES (?, ?, ?, ?, ?)',
            [pending.username, pending.email, pending.phone, pending.passwordHash, 'user']
        );

        // Create welcome notification for new user
        await createNotification(result.insertId, 'Thank you for registering with MyPathPal! Welcome to our community.', 'system');
        await notifyAdmins(`New user registered: ${result.insertId}`, 'admin');

        delete req.session.pendingRegistration;
        res.json({ success: true, message: 'Registration successful.' });
    } catch (error) {
        console.error('Complete registration error:', error);
        res.status(500).json({ success: false, message: 'Failed to complete registration.' });
    }
});

router.post('/login', loginRateLimit, async (req, res) => {
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

        // Create notification for password reset (user only)
        await createNotification(user.user_id, 'Your password has been successfully reset. If you did not make this change, please contact support immediately.', 'system');
        // Notify admins only if the actor is an admin resetting their own password
        if (req.session.user && req.session.user.user_type === 'admin' && req.session.user.user_id === user.user_id) {
            await notifyAdmins(`Admin ${user.user_id} reset password.`, 'admin');
        }

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
