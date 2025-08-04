// Simple error handler for PathPal
// This catches errors and shows friendly messages to users

// Handle different types of errors
function handleError(err, req, res, next) {
    console.error('Error occurred:', err);

    // Database connection error
    if (err.code === 'ECONNREFUSED') {
        return res.status(503).json({
            success: false,
            message: 'Database connection failed. Please try again later.'
        });
    }

    // Database table not found
    if (err.code === 'ER_NO_SUCH_TABLE') {
        return res.status(500).json({
            success: false,
            message: 'Database setup error. Please contact administrator.'
        });
    }

    // Duplicate entry (user already exists)
    if (err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({
            success: false,
            message: 'This information already exists. Please use different details.'
        });
    }

    // Network error
    if (err.code === 'ENOTFOUND') {
        return res.status(503).json({
            success: false,
            message: 'Service unavailable. Please try again later.'
        });
    }

    // Default error message
    res.status(500).json({
        success: false,
        message: 'Something went wrong. Please try again.'
    });
}

// Handle 404 errors (page not found)
function handleNotFound(req, res) {
    if (req.path.startsWith('/api/')) {
        res.status(404).json({
            success: false,
            message: 'API endpoint not found'
        });
    } else {
        res.status(404).sendFile(require('path').join(__dirname, '../../public/index.html'));
    }
}

module.exports = {
    handleError,
    handleNotFound
}; 