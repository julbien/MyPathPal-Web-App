// Simple validation middleware for PathPal
// This helps check if user input is correct before processing

// Check if email is valid
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// Check if phone number is valid (11 digits)
function isValidPhone(phone) {
    const phoneRegex = /^\d{11}$/;
    return phoneRegex.test(phone);
}

// Check if username is valid (3-30 characters)
function isValidUsername(username) {
    return username && username.length >= 3 && username.length <= 30;
}

// Check if password is strong enough (at least 8 characters)
function isValidPassword(password) {
    return password && password.length >= 8;
}

// Check if serial number is valid (5 digits)
function isValidSerialNumber(serial) {
    const serialRegex = /^\d{5}$/;
    return serialRegex.test(serial);
}

// Validate registration form
function validateRegistration(req, res, next) {
    const { username, email, phone, password } = req.body;
    const errors = [];

    // Check username
    if (!username) {
        errors.push('Username is required');
    } else if (!isValidUsername(username)) {
        errors.push('Username must be 3-30 characters long');
    }

    // Check email
    if (!email) {
        errors.push('Email is required');
    } else if (!isValidEmail(email)) {
        errors.push('Please enter a valid email address');
    }

    // Check phone
    if (!phone) {
        errors.push('Phone number is required');
    } else if (!isValidPhone(phone)) {
        errors.push('Please enter a valid 11-digit phone number');
    }

    // Check password
    if (!password) {
        errors.push('Password is required');
    } else if (!isValidPassword(password)) {
        errors.push('Password must be at least 8 characters long');
    }

    // If there are errors, send them back
    if (errors.length > 0) {
        return res.status(400).json({
            success: false,
            message: 'Please fix the following errors:',
            errors: errors
        });
    }

    // If no errors, continue to next step
    next();
}

// Validate login form
function validateLogin(req, res, next) {
    const { usernameOrEmail, password } = req.body;
    const errors = [];

    if (!usernameOrEmail) {
        errors.push('Username or email is required');
    }

    if (!password) {
        errors.push('Password is required');
    }

    if (errors.length > 0) {
        return res.status(400).json({
            success: false,
            message: 'Please fix the following errors:',
            errors: errors
        });
    }

    next();
}

// Validate device serial number
function validateDeviceSerial(req, res, next) {
    const { serial_number } = req.body;
    const errors = [];

    if (!serial_number) {
        errors.push('Serial number is required');
    } else {
        // Remove PPSC- prefix and check if it's 5 digits
        const cleanSerial = serial_number.replace('PPSC-', '');
        if (!isValidSerialNumber(cleanSerial)) {
            errors.push('Serial number must be exactly 5 digits');
        }
    }

    if (errors.length > 0) {
        return res.status(400).json({
            success: false,
            message: 'Please fix the following errors:',
            errors: errors
        });
    }

    next();
}

// Export all functions so other files can use them
module.exports = {
    validateRegistration,
    validateLogin,
    validateDeviceSerial,
    isValidEmail,
    isValidPhone,
    isValidUsername,
    isValidPassword,
    isValidSerialNumber
}; 