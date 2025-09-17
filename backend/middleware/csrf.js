// Simple CSRF protection for PathPal
// This prevents cross-site request forgery attacks

const crypto = require('crypto');

// Store tokens in memory (in production, use Redis or database)
const tokens = new Map();

// Generate a random token
function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

// Create CSRF token middleware
function createToken(req, res, next) {
    // Only create token if session exists and user is authenticated
    if (req.session && req.session.user) {
        const token = generateToken();
        const userId = req.session.user.user_id;
        
        // Store token with user ID and timestamp
        tokens.set(token, {
            userId: userId,
            timestamp: Date.now()
        });

        // Add token to response headers
        res.setHeader('X-CSRF-Token', token);
    }
    next();
}

// Validate CSRF token middleware
function validateToken(req, res, next) {
    // Skip validation for GET requests
    if (req.method === 'GET') {
        return next();
    }

    // Skip validation if session is not available
    if (!req.session) {
        return next();
    }

    const token = req.headers['x-csrf-token'] || req.body._csrf;
    
    if (!token) {
        return res.status(403).json({
            success: false,
            message: 'CSRF token missing. Please refresh the page and try again.'
        });
    }

    const tokenData = tokens.get(token);
    
    if (!tokenData) {
        return res.status(403).json({
            success: false,
            message: 'Invalid CSRF token. Please refresh the page and try again.'
        });
    }

    // Check if token is expired (5 minutes)
    if (Date.now() - tokenData.timestamp > 5 * 60 * 1000) {
        tokens.delete(token);
        return res.status(403).json({
            success: false,
            message: 'CSRF token expired. Please refresh the page and try again.'
        });
    }

    // Check if token belongs to current user
    if (req.session && req.session.user && tokenData.userId !== req.session.user.user_id) {
        return res.status(403).json({
            success: false,
            message: 'Invalid CSRF token. Please refresh the page and try again.'
        });
    }

    // Don't remove token immediately - allow multiple uses within 5 minutes
    // This is needed for multi-step processes like OTP verification
    next();
}

// Clean expired tokens every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [token, data] of tokens.entries()) {
        if (now - data.timestamp > 5 * 60 * 1000) { // 5 minutes
            tokens.delete(token);
        }
    }
}, 5 * 60 * 1000); // Clean every 5 minutes

module.exports = {
    createToken,
    validateToken,
    generateToken,
    tokens
}; 