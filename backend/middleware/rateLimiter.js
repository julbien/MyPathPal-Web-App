// Simple rate limiter for PathPal
// This prevents too many requests from the same IP address

// Store request counts for each IP
const requestCounts = new Map();

// Store login attempt counts for each IP (separate from general requests)
const loginAttempts = new Map();

// Clean old entries every 15 minutes
setInterval(() => {
    const now = Date.now();
    for (const [ip, data] of requestCounts.entries()) {
        if (now - data.timestamp > 15 * 60 * 1000) { // 15 minutes
            requestCounts.delete(ip);
        }
    }
    for (const [ip, data] of loginAttempts.entries()) {
        if (now - data.timestamp > 10 * 60 * 1000) { // 10 minutes for login attempts
            loginAttempts.delete(ip);
        }
    }
}, 15 * 60 * 1000); // Clean every 15 minutes

// Rate limiter middleware
function rateLimit(maxRequests = 100, windowMs = 15 * 60 * 1000) {
    return (req, res, next) => {
        const ip = req.ip || req.connection.remoteAddress;
        const now = Date.now();

        // Get current request count for this IP
        const currentData = requestCounts.get(ip);

        if (!currentData || (now - currentData.timestamp) > windowMs) {
            // First request or window expired
            requestCounts.set(ip, {
                count: 1,
                timestamp: now
            });
        } else {
            // Increment count
            currentData.count++;
            requestCounts.set(ip, currentData);

            // Check if limit exceeded
            if (currentData.count > maxRequests) {
                const remainingTime = Math.ceil((windowMs - (now - currentData.timestamp)) / 60000);
                return res.status(429).json({
                    success: false,
                    message: `Too many requests. Please wait ${remainingTime} minutes before trying again.`
                });
            }
        }

        next();
    };
}

// Rate limit specifically for login attempts
function loginRateLimit(maxRequests = 5, windowMs = 10 * 60 * 1000) {
    return (req, res, next) => {
        // Only apply rate limiting to login attempts
        if (req.path === '/login' && req.method === 'POST') {
            const ip = req.ip || req.connection.remoteAddress;
            const now = Date.now();

            // Get current login attempt count for this IP
            const currentData = loginAttempts.get(ip);

            if (!currentData || (now - currentData.timestamp) > windowMs) {
                // First login attempt or window expired
                loginAttempts.set(ip, {
                    count: 1,
                    timestamp: now
                });
            } else {
                // Increment login attempt count
                currentData.count++;
                loginAttempts.set(ip, currentData);

                // Check if limit exceeded
                if (currentData.count > maxRequests) {
                    const remainingTime = Math.ceil((windowMs - (now - currentData.timestamp)) / 60000);
                    return res.status(429).json({
                        success: false,
                        message: `Too many login attempts. Please wait ${remainingTime} minutes before trying again.`
                    });
                }
            }
        }
        
        next();
    };
}

// General rate limit for other auth routes (register, forgot password, etc.)
function authRateLimit(maxRequests = 20, windowMs = 10 * 60 * 1000) {
    return (req, res, next) => {
        // Skip rate limiting for logout and login (login has its own limiter)
        if (req.path === '/logout' && req.method === 'POST') {
            return next();
        }
        if (req.path === '/login' && req.method === 'POST') {
            return next(); // Login is handled by loginRateLimit
        }
        
        // Apply rate limiting for other auth routes
        return rateLimit(maxRequests, windowMs)(req, res, next);
    };
}

module.exports = {
    rateLimit,
    authRateLimit,
    loginRateLimit
}; 