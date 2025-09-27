const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

// Notify all admins helper (no new files)
async function notifyAdmins(message, type = 'system') {
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
const { generateToken, tokens } = require('../middleware/csrf');

const isAuthenticated = (req, res, next) => {
    if (req.session.user) {
        next();
    } else {
        res.status(401).json({ success: false, message: 'Authentication required' });
    }
};

// Get CSRF token endpoint for devices
router.get('/csrf-token', isAuthenticated, (req, res) => {
    try {
        const token = generateToken();
        const userId = req.session.user.user_id;
        
        // Store token with user ID and timestamp
        tokens.set(token, {
            userId: userId,
            timestamp: Date.now()
        });

        res.json({
            success: true,
            token: token
        });
    } catch (error) {
        console.error('Error generating CSRF token:', error);
        res.status(500).json({ success: false, message: 'Failed to generate CSRF token' });
    }
});

router.get('/check-link/:serialNumber', isAuthenticated, async (req, res) => {
    try {
        const { serialNumber } = req.params;
        
        const [devices] = await db.execute(
            'SELECT * FROM devices WHERE serial_number = ?',
            [serialNumber]
        );

        if (devices.length === 0) {
            return res.json({ 
                success: false,
                message: 'Device does not exist in the system',
                isLinked: false,
                canLink: false
            });
        }

        const device = devices[0];

        // Check if device is unlinked
        if (device.status === 'unlinked') {
            return res.json({ 
                success: false,
                message: 'This device has been unlinked and cannot be linked again',
                isLinked: false,
                canLink: false
            });
        }

        const [linkedDevices] = await db.execute(
            'SELECT * FROM linked_devices WHERE serial_number = ?',
            [serialNumber]
        );

        if (linkedDevices.length > 0) {
            return res.json({ 
                success: false,
                message: 'Device is already linked to another user',
                isLinked: true,
                canLink: false
            });
        }

        res.json({ 
            success: true,
            message: 'Device exists and can be linked',
            isLinked: false,
            canLink: true
        });
    } catch (error) {
        console.error('Check device link error:', error);
        res.status(500).json({ success: false, message: 'Failed to check device status' });
    }
});

router.get('/', isAuthenticated, async (req, res) => {
    try {
        const userId = req.session.user.user_id;
        const [devices] = await db.execute(
            'SELECT linked_device_id AS device_id, serial_number, device_name, user_id, linked_at FROM linked_devices WHERE user_id = ? AND status = ?',
            [userId, 'active']
        );
        res.json({ success: true, devices });
    } catch (error) {
        console.error('Get devices error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch devices' });
    }
});

router.post('/', isAuthenticated, async (req, res) => {
    try {
        const userId = req.session.user.user_id;
        const { deviceSerial, deviceName } = req.body;

        if (!deviceSerial || !deviceName) {
            return res.status(400).json({ success: false, message: 'All fields are required' });
        }

        const [devices] = await db.execute(
            'SELECT * FROM devices WHERE serial_number = ?',
            [deviceSerial]
        );

        if (devices.length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Device does not exist in the system' 
            });
        }

        const device = devices[0];
        
        // Check if device is unlinked
        if (device.status === 'unlinked') {
            return res.status(400).json({ 
                success: false, 
                message: 'This device has been unlinked and cannot be linked again' 
            });
        }

        const [existingLinks] = await db.execute(
            'SELECT * FROM linked_devices WHERE serial_number = ?',
            [deviceSerial]
        );

        if (existingLinks.length > 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Device is already linked to another user' 
            });
        }

        await db.execute(
            'INSERT INTO linked_devices (serial_number, device_name, user_id) VALUES (?, ?, ?)',
            [deviceSerial, deviceName, userId]
        );

        // Update device status to linked
        await db.execute(
            'UPDATE devices SET status = ? WHERE serial_number = ?',
            ['linked', deviceSerial]
        );

        // Create notification for device linking (user only)
        await createNotification(userId, `Device "${deviceName}" (${deviceSerial}) has been successfully linked to your account.`, 'device_status');

        res.status(201).json({ success: true, message: 'Device linked successfully' });
    } catch (error) {
        console.error('Link device error:', error);
        res.status(500).json({ success: false, message: 'Failed to link device' });
    }
});

// Device unlink - Step 1: Send OTP to email (similar to registration)
router.post('/unlink-request/:deviceId', isAuthenticated, async (req, res) => {
    try {
        const userId = req.session.user.user_id;
        const { deviceId } = req.params;
        const { unlinkReason } = req.body;
        
        // Validate unlink reason
        if (!unlinkReason || unlinkReason.trim().length < 5) {
            return res.status(400).json({ 
                success: false, 
                message: 'Please provide a reason for unlinking (at least 5 characters)' 
            });
        }
        
        console.log('Unlink request for device:', deviceId, 'by user:', userId, 'reason:', unlinkReason); // Debug log

        // Check if device exists and belongs to user
        const [devices] = await db.execute(
            'SELECT ld.linked_device_id, ld.serial_number, ld.device_name, u.email FROM linked_devices ld JOIN users u ON ld.user_id = u.user_id WHERE ld.linked_device_id = ? AND ld.user_id = ?',
            [deviceId, userId]
        );

        if (devices.length === 0) {
            console.log('Device not found for user:', userId, 'device:', deviceId); // Debug log
            return res.status(404).json({ success: false, message: 'Device not found' });
        }

        const device = devices[0];
        const userEmail = device.email;
        console.log('Found device:', device, 'User email:', userEmail); // Debug log

        // Generate OTP (same as registration)
        const otp = crypto.randomInt(1000, 10000).toString(); // 4-digit
        const otpHash = await bcrypt.hash(otp, 10);
        const otpExpiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes
        const resendCooldownMs = 60 * 1000; // 60s

        // Store OTP in session (same as registration)
        req.session.pendingUnlink = {
            deviceId: deviceId,
            deviceName: device.device_name,
            serialNumber: device.serial_number,
            userEmail: userEmail,
            unlinkReason: unlinkReason || 'User requested unlink',
            otpHash,
            otpExpiresAt,
            lastOtpSentAt: Date.now(),
            resendCooldownMs
        };

        // Check if email configuration is available
        if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
            console.log('Email configuration missing, using development mode');
            console.log('OTP for device unlink:', otp); // Log OTP in development
        } else {
            // Send email (same pattern as registration)
            const transporter = nodemailer.createTransport({
                host: process.env.EMAIL_HOST,
                port: process.env.EMAIL_PORT,
                secure: process.env.EMAIL_PORT == 465,
                auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
            });

            console.log('Sending email to:', userEmail, 'with OTP:', otp); // Debug log
            
            await transporter.sendMail({
                from: process.env.EMAIL_FROM,
                to: userEmail,
                subject: 'Your PathPal Device Unlink OTP',
                text: `Your 4-digit device unlink OTP is: ${otp}. It expires in 10 minutes.`,
                html: `<p>Your 4-digit device unlink OTP is: <strong>${otp}</strong>. It expires in 10 minutes.</p>`
            });

            console.log('Email sent successfully'); // Debug log
        }

        res.json({ 
            success: true, 
            message: 'OTP sent to your email.', 
            resendSeconds: Math.floor(resendCooldownMs / 1000),
            deviceName: device.device_name
        });
    } catch (error) {
        console.error('Device unlink request error:', error);
        console.error('Error details:', error.message, error.stack); // More detailed error logging
        res.status(500).json({ 
            success: false, 
            message: 'Failed to send OTP.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Device unlink - Step 2: Verify OTP and unlink (similar to registration-complete)
router.post('/unlink-verify', isAuthenticated, async (req, res) => {
    try {
        const { otp } = req.body;
        const pending = req.session.pendingUnlink;

        if (!pending) {
            return res.status(400).json({ success: false, message: 'No pending unlink request for this device.' });
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

        // Get device info before unlinking
        const [deviceInfo] = await db.execute(
            'SELECT serial_number FROM linked_devices WHERE linked_device_id = ? AND user_id = ?',
            [pending.deviceId, req.session.user.user_id]
        );

        if (deviceInfo.length === 0) {
            return res.status(404).json({ success: false, message: 'Device not found' });
        }

        const serialNumber = deviceInfo[0].serial_number;

        // Update linked_devices status to unlinked instead of deleting
        await db.execute(
            'UPDATE linked_devices SET status = ?, unlink_reason = ? WHERE linked_device_id = ? AND user_id = ?',
            ['unlinked', pending.unlinkReason, pending.deviceId, req.session.user.user_id]
        );

        // Update devices table status to unlinked
        await db.execute(
            'UPDATE devices SET status = ? WHERE serial_number = ?',
            ['unlinked', serialNumber]
        );

        // Create notification for device unlinking (user only)
        await createNotification(req.session.user.user_id, `Device "${pending.deviceName}" has been successfully unlinked from your account.`, 'device_status');

        delete req.session.pendingUnlink;
        res.json({ 
            success: true, 
            message: `Device "${pending.deviceName}" has been successfully unlinked.`,
            deviceName: pending.deviceName
        });
    } catch (error) {
        console.error('Device unlink verify error:', error);
        res.status(500).json({ success: false, message: 'Failed to unlink device.' });
    }
});


module.exports = router;