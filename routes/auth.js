import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';

const router = Router();

function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer '))
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  try {
    const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    req.userId = payload.userId;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendOtpEmail(email, otp) {
  const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: process.env.EMAILJS_SERVICE_ID,
      template_id: process.env.EMAILJS_TEMPLATE_ID,
      user_id: process.env.EMAILJS_PUBLIC_KEY,
      template_params: {
        email: email,
        passcode: otp,
        time: new Date(Date.now() + 10 * 60000).toLocaleTimeString(),
      },
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`EmailJS error ${response.status}: ${text}`);
  }
}

// POST /api/auth/signup
router.post('/auth/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ error: 'name, email and password are required' });

    const existing = await User.findOne({ email });
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const passwordHash = await bcrypt.hash(password, 12);
    const otp = generateOtp();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    const user = await User.create({ name, email, passwordHash, otp, otpExpiry });

    try {
      await sendOtpEmail(email, otp);
      res.status(201).json({ message: 'User created. Check your email for OTP.', userId: user._id });
    } catch (emailErr) {
      res.status(201).json({ message: 'User created. Email send failed.', otp, userId: user._id, emailError: emailErr.message });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/verify-otp
router.post('/auth/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ error: 'email and otp are required' });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.isVerified) return res.status(400).json({ error: 'Email already verified' });
    if (!user.otp || user.otp !== otp || user.otpExpiry < new Date())
      return res.status(400).json({ error: 'Invalid or expired OTP' });

    user.isVerified = true;
    user.otp = null;
    user.otpExpiry = null;
    await user.save();

    const token = jwt.sign({ userId: user._id.toString() }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({
      message: 'Email verified successfully',
      token,
      user: { name: user.name, email: user.email },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/login
router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'email and password are required' });

    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    if (!user.isVerified)
      return res.status(403).json({ error: 'Email not verified. Please verify your OTP first.' });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ userId: user._id.toString() }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({
      message: 'Login successful',
      token,
      userId: user._id,
      user: { name: user.name, email: user.email },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/resend-otp
router.post('/auth/resend-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'email is required' });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.isVerified) return res.status(400).json({ error: 'Email already verified' });

    const otp = generateOtp();
    user.otp = otp;
    user.otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    try {
      await sendOtpEmail(email, otp);
      res.json({ message: 'OTP resent successfully' });
    } catch (emailErr) {
      res.status(500).json({ error: 'Failed to send OTP email', otp, emailError: emailErr.message });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/me
router.get('/auth/me', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('name email');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ name: user.name, email: user.email });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
