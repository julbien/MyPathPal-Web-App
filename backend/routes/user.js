const express = require('express');
const router = express.Router();
const db = require('../db');

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
const bcrypt = require('bcrypt');
const { generateToken, tokens } = require('../middleware/csrf');

const isAuthenticated = (req, res, next) => {
    if (req.session.user) {
        next();
    } else {
        res.status(401).json({ success: false, message: 'Authentication required' });
    }
};

// Get CSRF token endpoint for users
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

router.get('/profile', isAuthenticated, async (req, res) => {
    try {
        if (!req.session.user || !req.session.user.user_id) {
            return res.status(401).json({ success: false, message: 'User not authenticated' });
        }

        const userId = req.session.user.user_id;

        const [users] = await db.query(
            'SELECT user_id, username, email, phone_number, user_type FROM users WHERE user_id = ?',
            [userId]
        );

        if (users.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const user = users[0];

        res.json({ 
            success: true, 
            user: {
                user_id: user.user_id,
                username: user.username,
                email: user.email,
                phone: user.phone_number,
                user_type: user.user_type
            }
        });
    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to fetch profile',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

router.get('/devices', isAuthenticated, async (req, res) => {
    try {
        const userId = req.session.user.user_id;
        const [devices] = await db.query(
            'SELECT * FROM devices WHERE user_id = ?',
            [userId]
        );
        res.json({ success: true, devices });
    } catch (error) {
        console.error('Get devices error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch devices' });
    }
});

router.put('/profile', isAuthenticated, async (req, res) => {
    try {
        const userId = req.session.user.user_id;
        const { username, email, phone } = req.body;

        if (!username && !email && !phone) {
            return res.status(400).json({ success: false, message: 'No fields to update' });
        }

        if (email) {
            const [existingUser] = await db.query(
                'SELECT user_id FROM users WHERE email = ? AND user_id != ?',
                [email, userId]
            );
            if (existingUser.length > 0) {
                return res.status(400).json({ success: false, message: 'Email already in use' });
            }
        }

        if (phone) {
            const [existingPhone] = await db.query(
                'SELECT user_id FROM users WHERE phone_number = ? AND user_id != ?',
                [phone, userId]
            );
            if (existingPhone.length > 0) {
                return res.status(400).json({ success: false, message: 'Phone number already in use' });
            }
        }

        const updates = [];
        const values = [];
        if (username) {
            updates.push('username = ?');
            values.push(username);
        }
        if (email) {
            updates.push('email = ?');
            values.push(email);
        }
        if (phone) {
            updates.push('phone_number = ?');
            values.push(phone);
        }
        values.push(userId);

        const [result] = await db.query(
            `UPDATE users SET ${updates.join(', ')} WHERE user_id = ?`,
            values
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Create notification for profile update
        await createNotification(userId, 'Your profile has been successfully updated.', 'system');

        res.json({ success: true, message: 'Profile updated successfully' });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ success: false, message: 'Failed to update profile' });
    }
});

router.post('/verify-password', isAuthenticated, async (req, res) => {
    try {
        const userId = req.session.user.user_id;
        const { currentPassword } = req.body;
        if (!currentPassword) {
            return res.status(400).json({ success: false, message: 'Current password is required' });
        }
        const [users] = await db.query('SELECT password_hash FROM users WHERE user_id = ?', [userId]);
        if (users.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        const valid = await bcrypt.compare(currentPassword, users[0].password_hash);
        if (!valid) {
            return res.status(401).json({ success: false, message: 'Incorrect password' });
        }
        res.json({ success: true, message: 'Password verified' });
    } catch (error) {
        console.error('Verify password error:', error);
        res.status(500).json({ success: false, message: 'Failed to verify password' });
    }
});

router.post('/change-password', isAuthenticated, async (req, res) => {
    try {
        const userId = req.session.user.user_id;
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ success: false, message: 'Current and new password are required' });
        }
        const [users] = await db.query('SELECT password_hash FROM users WHERE user_id = ?', [userId]);
        if (users.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        const valid = await bcrypt.compare(currentPassword, users[0].password_hash);
        if (!valid) {
            return res.status(401).json({ success: false, message: 'Incorrect current password' });
        }
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await db.query('UPDATE users SET password_hash = ? WHERE user_id = ?', [hashedPassword, userId]);
        
        // Create notification for password change
        await createNotification(userId, 'Your password has been successfully changed. If you did not make this change, please contact support immediately.', 'system');
        
        res.json({ success: true, message: 'Password changed successfully' });
    } catch (error) {
        console.error('Error changing password:', error);
        res.status(500).json({ success: false, message: 'Failed to change password' });
    }
});

router.get('/notifications', isAuthenticated, async (req, res) => {
    try {
        const limit = req.query.limit ? parseInt(req.query.limit) : 10;
        const [notifications] = await db.query(
            'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
            [req.session.user.user_id, limit]
        );
        res.json({ success: true, notifications });
    } catch (error) {
        console.error('Error fetching user notifications:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch notifications' });
    }
});

// Mark single notification as read
router.put('/notifications/:notificationId/read', isAuthenticated, async (req, res) => {
    try {
        const { notificationId } = req.params;
        const userId = req.session.user.user_id;
        
        const [result] = await db.query(
            'UPDATE notifications SET is_read = TRUE WHERE notification_id = ? AND user_id = ?',
            [notificationId, userId]
        );
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Notification not found' });
        }
        
        res.json({ success: true, message: 'Notification marked as read' });
    } catch (error) {
        console.error('Error marking notification as read:', error);
        res.status(500).json({ success: false, message: 'Failed to mark notification as read' });
    }
});

// Mark all notifications as read
router.put('/notifications/mark-all-read', isAuthenticated, async (req, res) => {
    try {
        const userId = req.session.user.user_id;
        
        await db.query(
            'UPDATE notifications SET is_read = TRUE WHERE user_id = ? AND is_read = FALSE',
            [userId]
        );
        
        res.json({ success: true, message: 'All notifications marked as read' });
    } catch (error) {
        console.error('Error marking all notifications as read:', error);
        res.status(500).json({ success: false, message: 'Failed to mark all notifications as read' });
    }
});

router.get('/device/status', isAuthenticated, async (req, res) => {
    try {
        const userId = req.session.user.user_id;
        const [devices] = await db.query(
            'SELECT serial_number, device_name, status, battery_level FROM linked_devices WHERE user_id = ? ORDER BY linked_at DESC LIMIT 1',
            [userId]
        );
        if (devices.length === 0) {
            return res.json({ success: true, device: null });
        }
        res.json({ success: true, device: devices[0] });
    } catch (error) {
        console.error('Error fetching device status:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch device status' });
    }
});

module.exports = router;
