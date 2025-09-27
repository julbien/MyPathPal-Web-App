# MyPathPal
## Features

### **User Features**
- **Device Management**: Link/unlink devices, view device status
- **Real-time Monitoring**: Battery level, movement tracking, obstacle detection
- **Emergency System**: Emergency button functionality with location tracking
- **Usage Analytics**: Detailed usage statistics and battery consumption
- **Notifications**: Real-time notifications for device events

### **Admin Features**
- **User Management**: View and manage all registered users
- **Device Administration**: Monitor all devices in the system
- **Statistics Dashboard**: Comprehensive analytics and reporting
- **System Monitoring**: Real-time system health and performance
- **Notification Management**: Admin notification system

### **Security Features**
- **Rate Limiting**: Different limits for users (100 req/15min) and admins (300 req/15min)
- **CSRF Protection**: Cross-site request forgery protection
- **Input Sanitization**: XSS and injection attack prevention
- **Session Management**: Secure user authentication
- **Login Protection**: 5 attempts per 10 minutes with IP lockout

## Technology Stack

- **Backend**: Node.js, Express.js
- **Database**: MySQL
- **Frontend**: HTML5, CSS3, JavaScript, Bootstrap 5
- **Libraries**: DataTables, SweetAlert2, Chart.js
- **Security**: CSRF tokens, Rate limiting, Input sanitization

## 📋 Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher)
- MySQL (v8.0 or higher)
- Git Bash (for Windows users)

## Installation & Setup

### 1. **Clone the Repository**
```bash
git clone <repository-url>
cd PathPal-Web-Application-main
```

### 2. **Install Dependencies**
```bash
npm install
```

### 3. **Set Up Environment Variables**
Create a `.env` file in the root directory

### 4. **Database Setup**
1. Open the pathpal_db.sql file, copy all the SQL code inside it, then paste it into your SQL editor (like phpMyAdmin > SQL tab) and click Execute.

### 5. **Create Admin User**
```bash
node backend/scripts/create-admin.js
```

### 6. **Start the Application**
```bash
node backend/server.js
```

### 7. **Access the Application**
- **Landing Page**: http://localhost:3000

## 📁 Project Structure

```
PathPal-Web-Application-main/
├── backend/
│   ├── db/
│   │   └── pathpal.sql          # Database schema
│   ├── middleware/
│   │   ├── csrf.js              # CSRF protection
│   │   ├── errorHandler.js      # Error handling
│   │   ├── rateLimiter.js       # Rate limiting
│   │   ├── sanitizer.js         # Input sanitization
│   │   └── validation.js        # Input validation
│   ├── routes/
│   │   ├── admin.js             # Admin API routes
│   │   ├── auth.js              # Authentication routes
│   │   ├── devices.js           # Device management routes
│   │   ├── support.js           # Support routes
│   │   └── user.js              # User API routes
│   ├── scripts/
│   │   ├── create-admin.js      # Admin user creation
│   │   └── setup-db.js          # Database setup
│   └── server.js                # Main server file
├── public/
│   ├── admin/                   # Admin interface
│   ├── auth/                    # Authentication pages
│   ├── components/              # Reusable components
│   ├── css/
│   │   └── main.css             # Main stylesheet
│   ├── js/                      # JavaScript files
│   └── user/                    # User interface
└── README.md
```

**Note**: Make sure you have Node.js, npm, and MySQL installed before running the application.

