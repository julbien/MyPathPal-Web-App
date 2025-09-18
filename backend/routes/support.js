const express = require('express');
const nodemailer = require('nodemailer');
const router = express.Router();

// Set your web app's support email here
const PATHPAL_EMAIL = 'maxinepedimato@gmail.com';

// Configure your SMTP transport (Gmail example)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: PATHPAL_EMAIL, // your web app's email
    pass: 'gklk fpax herz bpxm' // replace with your Gmail app password
  }
});

router.post('/', async (req, res) => {
  const { name, email, message } = req.body;
  if (!name || !email || !message) {
    return res.status(400).json({ error: 'All fields are required.' });
  }
  try {
    await transporter.sendMail({
      from: email,
      to: PATHPAL_EMAIL,
      subject: `Support Request from ${name}`,
      text: `Name: ${name}\nEmail: ${email}\nMessage: ${message}`
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to send email.' });
  }
});

module.exports = router;
