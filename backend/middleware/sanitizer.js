// Simple input sanitizer for PathPal
// This cleans user input to prevent basic attacks

// Remove dangerous characters from strings
function sanitizeString(input) {
    if (!input) return input;
    
    return input
        .toString()
        .trim()
        .replace(/[<>]/g, '') // Remove < and > to prevent HTML injection
        .replace(/javascript:/gi, '') // Remove javascript: links
        .replace(/on\w+=/gi, ''); // Remove event handlers
}

// Clean all input fields in request body
function sanitizeInput(req, res, next) {
    if (req.body) {
        // Clean each field in the request body
        Object.keys(req.body).forEach(key => {
            if (typeof req.body[key] === 'string') {
                req.body[key] = sanitizeString(req.body[key]);
            }
        });
    }

    if (req.query) {
        // Clean query parameters
        Object.keys(req.query).forEach(key => {
            if (typeof req.query[key] === 'string') {
                req.query[key] = sanitizeString(req.query[key]);
            }
        });
    }

    next();
}

// Clean specific fields
function sanitizeEmail(email) {
    return sanitizeString(email).toLowerCase();
}

function sanitizeUsername(username) {
    return sanitizeString(username).replace(/[^a-zA-Z0-9_-]/g, '');
}

function sanitizePhone(phone) {
    return sanitizeString(phone).replace(/[^0-9]/g, '');
}

module.exports = {
    sanitizeInput,
    sanitizeEmail,
    sanitizeUsername,
    sanitizePhone
}; 