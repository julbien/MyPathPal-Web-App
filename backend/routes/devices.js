const express = require('express');
const router = express.Router();
const db = require('../db');

const isAuthenticated = (req, res, next) => {
    if (req.session.user) {
        next();
    } else {
        res.status(401).json({ success: false, message: 'Authentication required' });
    }
};

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
            'SELECT * FROM linked_devices WHERE user_id = ?',
            [userId]
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

        res.status(201).json({ success: true, message: 'Device linked successfully' });
    } catch (error) {
        console.error('Link device error:', error);
        res.status(500).json({ success: false, message: 'Failed to link device' });
    }
});

router.delete('/:deviceId', isAuthenticated, async (req, res) => {
    try {
        const userId = req.session.user.user_id;
        const { deviceId } = req.params;

        const [devices] = await db.execute(
            'SELECT * FROM linked_devices WHERE device_id = ? AND user_id = ?',
            [deviceId, userId]
        );

        if (devices.length === 0) {
            return res.status(404).json({ success: false, message: 'Device not found' });
        }

        await db.execute(
            'DELETE FROM linked_devices WHERE device_id = ?',
            [deviceId]
        );

        res.json({ success: true, message: 'Device deleted successfully' });
    } catch (error) {
        console.error('Delete device error:', error);
        res.status(500).json({ success: false, message: 'Failed to delete device' });
    }
});

module.exports = router;