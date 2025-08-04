const express = require('express');
const router = express.Router();
const db = require('../db');

const isAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.user_type === 'admin') {
        next();
    } else {
        res.status(403).json({ success: false, message: 'Admin access required' });
    }
};

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
                ld.linked_at AS linked_at
            FROM devices d
            LEFT JOIN linked_devices ld ON d.serial_number = ld.serial_number
        `);
        
        const devicesWithType = devices.map(device => ({
            ...device,
            type: device.linked_device_id ? 'linked' : 'admin'
        }));
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
        res.json({ success: true, notifications: [] });
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch notifications' });
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

module.exports = router;
