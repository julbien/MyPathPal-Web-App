# PathPal

## How to Access and Use This Project from Git

### 1. **Clone the Repository**
Open your terminal and run:
```sh
git clone <repository-url>
```
*Replace `<repository-url>` with your actual GitHub repo link 

### 2. **Navigate to the Project Directory**
```sh
cd pathpal
```

### 3. **Install Dependencies**
```sh
npm install
```

## 3.1. **Install Nodemailer**
This project uses [Nodemailer](https://nodemailer.com/) for sending emails (e.g., for authentication or notifications).
Install it with:
```sh
npm install nodemailer
```

### 4. **Set Up Environment Variables**
- Copy the example `.env` file (if available) or create your own `.env` file in the root directory.
- Fill in the required environment variables (database, email, etc.).

### 5. **Set Up the Database**
- Import the SQL schema:
  - Open your MySQL client (e.g., phpMyAdmin, MySQL Workbench, or CLI)
  - Run the script in `backend/scripts/pathpal.sql` to create the necessary tables.

### 5.1. **Create an Admin User**
After setting up the database, create an initial admin user by running:
```sh
node backend/scripts/create-admin.js
```
Follow the prompts to set up the admin credentials.

### 6. **Run the Backend Server**
```sh
node backend/server.js
```

### 7. **Access the App**
- Open your browser and go to:
  - `http://localhost:3000` (or the port specified in your `.env`)

---

## Notes
- Make sure you have Node.js, npm, and MySQL installed.
