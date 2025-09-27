// Simple Production Rate Limiter
// Meets all security requirements with simple code structure

// Store request counts for each IP
const requestCounts = new Map();
const loginAttempts = new Map();
const authAttempts = new Map();

// Clean up old entries every 10 minutes
setInterval(() => {
    const now = Date.now();
    for (const [ip, data] of requestCounts.entries()) {
        if (now - data.timestamp > 15 * 60 * 1000) {
            requestCounts.delete(ip);
        }
    }
    for (const [ip, data] of loginAttempts.entries()) {
        if (now - data.timestamp > 10 * 60 * 1000) {
            loginAttempts.delete(ip);
        }
    }
    for (const [ip, data] of authAttempts.entries()) {
        if (now - data.timestamp > 10 * 60 * 1000) {
            authAttempts.delete(ip);
        }
    }
}, 10 * 60 * 1000);

// User rate limiter - 100 requests per 15 minutes
function userRateLimit(req, res, next) {
    const ip = req.ip || req.socket?.remoteAddress || req.connection?.remoteAddress || 'unknown';
    const now = Date.now();
    const maxRequests = 100;
    const windowMs = 15 * 60 * 1000;

    const currentData = requestCounts.get(ip);

    if (!currentData || (now - currentData.timestamp) > windowMs) {
        requestCounts.set(ip, { count: 1, timestamp: now });
    } else {
        currentData.count++;
        requestCounts.set(ip, currentData);

        if (currentData.count > maxRequests) {
            const remainingTime = Math.ceil((windowMs - (now - currentData.timestamp)) / 60000);
            return res.status(429).json({
                success: false,
                message: `Too many requests. Please wait ${remainingTime} minutes.`
            });
        }
    }
    next();
}

// Admin rate limiter - 300 requests per 15 minutes
function adminRateLimit(req, res, next) {
    const ip = req.ip || req.socket?.remoteAddress || req.connection?.remoteAddress || 'unknown';
    const now = Date.now();
    const maxRequests = 300;
    const windowMs = 15 * 60 * 1000;

    const currentData = requestCounts.get(ip);

    if (!currentData || (now - currentData.timestamp) > windowMs) {
        requestCounts.set(ip, { count: 1, timestamp: now });
    } else {
        currentData.count++;
        requestCounts.set(ip, currentData);

        if (currentData.count > maxRequests) {
            const remainingTime = Math.ceil((windowMs - (now - currentData.timestamp)) / 60000);
            return res.status(429).json({
                success: false,
                message: `Too many requests. Please wait ${remainingTime} minutes.`
            });
        }
    }
    next();
}

// Login rate limiter - 5 attempts per 10 minutes
function loginRateLimit(req, res, next) {
    const ip = req.ip || req.socket?.remoteAddress || req.connection?.remoteAddress || 'unknown';
    const now = Date.now();
    const maxAttempts = 5;
    const windowMs = 10 * 60 * 1000;

    const currentData = loginAttempts.get(ip);

    // Initialize or reset window
    if (!currentData || (now - currentData.timestamp) > windowMs) {
        loginAttempts.set(ip, { count: 1, timestamp: now, locked: false });
        return next();
    }

    // If already locked, block without incrementing or extending the window
    if (currentData.locked) {
        const remainingTime = Math.ceil((windowMs - (now - currentData.timestamp)) / 60000);
        return res.status(429).json({
            success: false,
            message: `Too many login attempts. Please wait ${remainingTime} minutes.`
        });
    }

    // Not locked yet; increment count up to max and lock when threshold reached
    if (currentData.count + 1 >= maxAttempts) {
        currentData.count = maxAttempts; // cap at max
        currentData.locked = true;       // lock for the remainder of the window
        loginAttempts.set(ip, currentData);
        const remainingTime = Math.ceil((windowMs - (now - currentData.timestamp)) / 60000);
        return res.status(429).json({
            success: false,
            message: `Too many login attempts. Please wait ${remainingTime} minutes.`
        });
    }

    // Below threshold; just increment and allow
    currentData.count++;
    loginAttempts.set(ip, currentData);
    next();
}

// Auth rate limiter - 20 requests per 10 minutes
function authRateLimit(req, res, next) {
    const ip = req.ip || req.socket?.remoteAddress || req.connection?.remoteAddress || 'unknown';
    const now = Date.now();
    const maxRequests = 20;
    const windowMs = 10 * 60 * 1000;

    const currentData = authAttempts.get(ip);

    if (!currentData || (now - currentData.timestamp) > windowMs) {
        authAttempts.set(ip, { count: 1, timestamp: now });
    } else {
        currentData.count++;
        authAttempts.set(ip, currentData);

        if (currentData.count > maxRequests) {
            const remainingTime = Math.ceil((windowMs - (now - currentData.timestamp)) / 60000);
            return res.status(429).json({
                success: false,
                message: `Too many requests. Please wait ${remainingTime} minutes.`
            });
        }
    }
    next();
}

module.exports = {
    userRateLimit,
    adminRateLimit,
    loginRateLimit,
    authRateLimit
};