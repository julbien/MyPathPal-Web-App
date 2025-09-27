const express = require('express');
const router = express.Router();
const db = require('../db');
const { generateToken, tokens } = require('../middleware/csrf');

// Helper to notify all admins (no new files)
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

const isAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.user_type === 'admin') {
        next();
    } else {
        res.status(403).json({ success: false, message: 'Admin access required' });
    }
};

// Get CSRF token endpoint
router.get('/csrf-token', isAdmin, (req, res) => {
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

router.post('/add-device', isAdmin, async (req, res) => {
    try {
        const { serial_number } = req.body;

        if (!serial_number) {
            return res.status(400).json({ success: false, message: 'Serial number is required' });
        }

        const [existingDevices] = await db.execute(
            'SELECT * FROM devices WHERE serial_number = ?',
            [serial_number]
        );

        if (existingDevices.length > 0) {
            return res.status(400).json({ success: false, message: 'Device already exists in system' });
        }

        const [linkedDevices] = await db.execute(
            'SELECT * FROM linked_devices WHERE serial_number = ?',
            [serial_number]
        );

        if (linkedDevices.length > 0) {
            return res.status(400).json({ success: false, message: 'Device is already linked to a user' });
        }

        await db.execute(
            'INSERT INTO devices (serial_number) VALUES (?)',
            [serial_number]
        );

        await notifyAdmins(`Device added: ${serial_number}`, 'system');

        res.status(201).json({
            success: true,
            message: 'Device added successfully'
        });
    } catch (error) {
        console.error('Add device error:', error);
        res.status(500).json({ success: false, message: 'Failed to add device' });
    }
});

router.get('/users', isAdmin, async (req, res) => {
    try {
        const [users] = await db.query(
            'SELECT user_id, username, email, phone_number, user_type, created_at FROM users WHERE user_type != "admin"'
        );
        res.json({ success: true, users });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to fetch users',
            error: error.message 
        });
    }
});

router.get('/devices', isAdmin, async (req, res) => {
    try {
        const [devices] = await db.query(`
            SELECT 
                d.device_id, 
                d.serial_number, 
                d.status,
                d.added_at,
                ld.linked_device_id AS linked_device_id,
                ld.user_id AS linked_user_id,
                ld.device_name,
                ld.linked_at AS linked_at,
                ld.unlink_reason
            FROM devices d
            LEFT JOIN linked_devices ld ON d.serial_number = ld.serial_number
            ORDER BY d.added_at DESC
        `);
        
        const devicesWithType = devices.map(device => {
            let type = 'admin'; // default for unlinked devices
            if (device.linked_device_id && device.status === 'linked') {
                type = 'linked';
            } else if (device.status === 'unlinked') {
                type = 'unlinked';
            }
            
            return {
                ...device,
                type: type
            };
        });
        res.json({ success: true, devices: devicesWithType });
    } catch (error) {
        console.error('Error fetching devices:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to fetch devices',
            error: error.message 
        });
    }
});

router.get('/notifications', isAdmin, async (req, res) => {
    try {
        const limit = req.query.limit ? parseInt(req.query.limit) : 10;
        const [notifications] = await db.query(
            "SELECT notification_id, user_id, message, type, is_read, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
            [req.session.user.user_id, limit]
        );
        res.json({ success: true, notifications });
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch notifications' });
    }
});

// Mark admin notification as read
router.put('/notifications/:notificationId/read', isAdmin, async (req, res) => {
    try {
        const { notificationId } = req.params;
        const adminId = req.session.user.user_id;
        const [result] = await db.query(
            'UPDATE notifications SET is_read = TRUE WHERE notification_id = ? AND user_id = ?',
            [notificationId, adminId]
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

// Mark all admin notifications as read
router.put('/notifications/mark-all-read', isAdmin, async (req, res) => {
    try {
        const adminId = req.session.user.user_id;
        await db.query(
            'UPDATE notifications SET is_read = TRUE WHERE user_id = ? AND is_read = FALSE',
            [adminId]
        );
        res.json({ success: true, message: 'All notifications marked as read' });
    } catch (error) {
        console.error('Error marking all notifications as read:', error);
        res.status(500).json({ success: false, message: 'Failed to mark notifications as read' });
    }
});

router.put('/devices/:deviceId', isAdmin, async (req, res) => {
    try {
        const { deviceId } = req.params;
        const { status } = req.body;

        if (!status) {
            return res.status(400).json({ success: false, message: 'Status is required' });
        }

        const [result] = await db.query(
            'UPDATE devices SET status = ? WHERE device_id = ?',
            [status, deviceId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Device not found' });
        }

        await notifyAdmins(`Device ${deviceId} status updated to ${status}`, 'system');
        res.json({ success: true, message: 'Device status updated' });
    } catch (error) {
        console.error('Update device error:', error);
        res.status(500).json({ success: false, message: 'Failed to update device' });
    }
});

router.get('/devices/count', isAdmin, async (req, res) => {
    try {
        const [adminDevices] = await db.query(`
            SELECT COUNT(*) as count
            FROM devices d
            LEFT JOIN linked_devices ld ON d.serial_number = ld.serial_number
            WHERE ld.serial_number IS NULL
        `);
        const [linkedDevices] = await db.query(`
            SELECT COUNT(*) as count
            FROM linked_devices
        `);
        const total = (adminDevices[0]?.count || 0) + (linkedDevices[0]?.count || 0);
        res.json({ success: true, count: total });
    } catch (error) {
        console.error('Error fetching device count:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch device count' });
    }
});

// Get linked devices only
router.get('/linked-devices', isAdmin, async (req, res) => {
    try {
        const [linkedDevices] = await db.query(`
            SELECT 
                ld.linked_device_id,
                d.device_id,
                ld.user_id,
                ld.linked_at
            FROM linked_devices ld
            JOIN devices d ON ld.serial_number = d.serial_number
            ORDER BY ld.linked_at DESC
        `);
        
        res.json({ success: true, linkedDevices });
    } catch (error) {
        console.error('Error fetching linked devices:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to fetch linked devices',
            error: error.message 
        });
    }
});

router.delete('/devices/:deviceId', isAdmin, async (req, res) => {
    try {
        const { deviceId } = req.params;

        // First check if device exists
        const [devices] = await db.execute(
            'SELECT * FROM devices WHERE device_id = ?',
            [deviceId]
        );

        if (devices.length === 0) {
            return res.status(404).json({ success: false, message: 'Device not found' });
        }

        // Delete the device
        await db.execute(
            'DELETE FROM devices WHERE device_id = ?',
            [deviceId]
        );

        res.json({ success: true, message: 'Device deleted successfully' });
    } catch (error) {
        console.error('Delete device error:', error);
        res.status(500).json({ success: false, message: 'Failed to delete device' });
    }
});

module.exports = router;
