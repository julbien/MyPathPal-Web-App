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
const { rateLimit, authRateLimit, loginRateLimit } = require('./middleware/rateLimiter');
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

// Rate limiting
app.use('/api/auth', loginRateLimit(5, 10 * 60 * 1000)); // 5 login attempts per 10 minutes
app.use('/api/auth', authRateLimit(20, 10 * 60 * 1000)); // 20 requests per 10 minutes for other auth routes
app.use('/api/', rateLimit(100, 15 * 60 * 1000)); // 100 requests per 15 minutes for general API

// CSRF protection
app.use(createToken);

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

// API routes with CSRF protection
app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', validateToken, require('./routes/admin'));
app.use('/api/user', validateToken, require('./routes/user'));
app.use('/api/devices', validateToken, require('./routes/devices'));

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
}).on('error', (err) => {
    console.error('Server failed to start:', err);
    process.exit(1);
});
