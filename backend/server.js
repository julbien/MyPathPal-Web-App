const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const db = require('./db');
require('dotenv').config();

// Import security middleware
const { handleError, handleNotFound } = require('./middleware/errorHandler');
const { sanitizeInput } = require('./middleware/sanitizer');
const { userRateLimit, adminRateLimit } = require('./middleware/rateLimiter');
const { createToken, validateToken } = require('./middleware/csrf');

const app = express();
const port = process.env.PORT || 3000;

// Basic CORS setup
app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true
}));

// Parse request body
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'pathpal-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        sameSite: 'lax'
    }
}));

// Log requests (simple logging)
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// Input sanitization (clean user input)
app.use(sanitizeInput);

// Rate limiting - Apply general limits only to non-auth APIs
app.use('/api/user', userRateLimit);
app.use('/api/admin', adminRateLimit);
app.use('/api/devices', userRateLimit);

// CSRF protection - only for API routes
app.use('/api', createToken);

// Authentication middleware
const isAuthenticated = (req, res, next) => {
    if (!req.session || !req.session.user) {
        if (req.path.startsWith('/api/')) {
            return res.status(401).json({ 
                success: false, 
                message: 'Please login to continue.' 
            });
        } else {
            return res.redirect('/');
        }
    }
    next();
};

// Admin middleware
const isAdmin = (req, res, next) => {
    if (!req.session || !req.session.user) {
        if (req.path.startsWith('/api/')) {
            return res.status(401).json({ 
                success: false, 
                message: 'Please login to continue.' 
            });
        } else {
            return res.redirect('/');
        }
    }
    
    if (req.session.user.user_type !== 'admin') {
        if (req.path.startsWith('/api/')) {
            return res.status(403).json({ 
                success: false, 
                message: 'Admin access required.' 
            });
        } else {
            return res.redirect('/');
        }
    }
    next();
};

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));

// Support route
app.use('/api/support', require('./routes/support'));

// API routes with CSRF protection
app.use('/api/auth', require('./routes/auth'));

// Admin routes - CSRF token endpoint excluded from CSRF validation
app.use('/api/admin', (req, res, next) => {
    if (req.path === '/csrf-token') {
        return next(); // Skip CSRF validation for token endpoint
    }
    return validateToken(req, res, next);
}, require('./routes/admin'));

// User routes - CSRF token endpoint excluded from CSRF validation
app.use('/api/user', (req, res, next) => {
    if (req.path === '/csrf-token') {
        return next(); // Skip CSRF validation for token endpoint
    }
    return validateToken(req, res, next);
}, require('./routes/user'));
// Devices routes - CSRF token endpoint excluded from CSRF validation
app.use('/api/devices', (req, res, next) => {
    if (req.path === '/csrf-token') {
        return next(); // Skip CSRF validation for token endpoint
    }
    return validateToken(req, res, next);
}, require('./routes/devices'));

// Page routes
app.get('/auth/register', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/auth/register.html'));
});

app.get('/user/dashboard', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, '../public/user/dashboard.html'));
});

app.get('/admin/dashboard', isAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin/dashboard.html'));
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// 404 handler
app.use(handleNotFound);

// Error handler (must be last)
app.use(handleError);

// Start server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    // Weekly digest: devices added and users registered in the past 7 days
    try {
        setInterval(async () => {
            const now = new Date();
            const day = now.getDay(); // 1 = Monday
            const hours = now.getHours();
            const minutes = now.getMinutes();
            if (day === 1 && hours === 8 && minutes === 0) {
                try {
                    const [deviceCountRows] = await db.query(
                        'SELECT COUNT(*) AS cnt FROM devices WHERE added_at >= DATE_SUB(CURRENT_DATE, INTERVAL 7 DAY)'
                    );
                    const [userCountRows] = await db.query(
                        'SELECT COUNT(*) AS cnt FROM users WHERE created_at >= DATE_SUB(CURRENT_DATE, INTERVAL 7 DAY)'
                    );
                    const devicesCount = deviceCountRows[0]?.cnt || 0;
                    const usersCount = userCountRows[0]?.cnt || 0;
                    const message = `Weekly digest: ${devicesCount} devices added this week, ${usersCount} users registered this week.`;
                    // Inline notify admins without new file
                    await db.query(
                        "INSERT INTO notifications (user_id, message, type) SELECT user_id, ?, 'system' FROM users WHERE user_type = 'admin'",
                        [message]
                    );
                } catch (e) {
                    console.error('Weekly digest failed:', e);
                }
            }
        }, 60 * 1000); // check every minute
    } catch (e) {
        console.error('Failed to schedule weekly digest:', e);
    }
}).on('error', (err) => {
    console.error('Server failed to start:', err);
    process.exit(1);
});
