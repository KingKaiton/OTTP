const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

// Temporary database (use a real DB like Supabase/Firestore in production)
const otpStore = new Map();

// Generate OTP and update Intercom user
app.post('/intercom-otp-webhook', async (req, res) => {
  const { user } = req.body.data?.item; // Adjusted for Intercom webhook format
  const email = user?.email;

  if (!email || !user?.id) {
    return res.status(400).json({ error: "Invalid request" });
  }

  // 1. Generate 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 600000; // 10 minutes expiry

  // 2. Store OTP in DB (replace with a real database)
  otpStore.set(email, { otp, expiresAt });

  try {
    // 3. Update Intercom user with OTP
    await axios.patch(
      `https://api.intercom.io/contacts/${user.id}`,
      { custom_attributes: { otp_code: otp } },
      { headers: { Authorization: `Bearer ${process.env.INTERCOM_TOKEN}` } }
    );

    // 4. Send OTP email via Intercom
    await axios.post(
      'https://api.intercom.io/messages',
      {
        message_type: 'email',
        subject: 'Your Verification Code',
        body: `Your OTP is: ${otp} (expires in 10 minutes)`,
        template: 'plain',
        to: { type: 'user', email }
      },
      { headers: { Authorization: `Bearer ${process.env.INTERCOM_TOKEN}` } }
    );

    res.status(200).send('OTP sent!');
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to process OTP' });
  }
});

// Verify OTP endpoint
app.post('/verify-otp', (req, res) => {
  const { email, otp } = req.body;
  const storedData = otpStore.get(email);

  if (!storedData || storedData.otp !== otp) {
    return res.status(400).json({ valid: false });
  }

  if (Date.now() > storedData.expiresAt) {
    return res.status(400).json({ valid: false, error: 'OTP expired' });
  }

  otpStore.delete(email);
  res.json({ valid: true });
});

// Export as Vercel serverless function
module.exports = app;