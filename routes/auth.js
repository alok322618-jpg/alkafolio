import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import { User } from '../models/User.js';

const router = Router();

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendOtpEmail(email, otp) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });
  await transporter.sendMail({
    from: `"AlkaFolio" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Your AlkaFolio verification code',
    html: `<p>Your verification code is: <strong>${otp}</strong></p><p>Expires in 10 minutes.</p>`,
  });
}

// POST /api/auth/signup
router.post('/auth/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: 'Email and password are required' });

    const existing = await User.findOne({ email });
    if (existing && existing.isVerified)
      return res.status(409).json({ message: 'Email already registered' });

    if (existing && !existing.isVerified) {
      await User.deleteOne({ email });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const otp = generateOtp();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    const user = await User.create({ name: name || 'User', email, passwordHash, otp, otpExpiry });

    try {
      await sendOtpEmail(email, otp);
      res.status(201).json({ message: 'OTP sent to your email!', userId: user._id });
    } catch (emailErr) {
      console.error('Email error:', emailErr.message);
      res.status(201).json({ message: 'Account created. Email failed — use this OTP:', otp, userId: user._id });
    }
  } catch (err) {
    console.error('Signup error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// POST /api/auth/verify-otp
router.post('/auth/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp)
      return res.status(400).json({ message: 'Email and OTP are required' });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.isVerified) return res.status(400).json({ message: 'Email already verified' });
    if (!user.otp || user.otp !== otp || user.otpExpiry < new Date())
      return res.status(400).json({ message: 'Invalid or expired OTP' });

    user.isVerified = true;
    user.otp = null;
    user.otpExpiry = null;
    await user.save();

    const token = jwt.sign({ userId: user._id.toString() }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ message: 'Email verified!', token, user: { name: user.name, email: user.email } });
  } catch (err) {
    console.error('Verify OTP error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// POST /api/auth/login
router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: 'Email and password are required' });

    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });
    if (!user.isVerified)
      return res.status(403).json({ message: 'Email not verified. Please verify OTP first.' });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ message: 'Invalid credentials' });

    const token = jwt.sign({ userId: user._id.toString() }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ message: 'Login successful', token, user: { name: user.name, email: user.email } });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// POST /api/auth/resend-otp
router.post('/auth/resend-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required' });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.isVerified) return res.status(400).json({ message: 'Email already verified' });

    const otp = generateOtp();
    user.otp = otp;
    user.otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    try {
      await sendOtpEmail(email, otp);
      res.json({ message: 'OTP resent!' });
    } catch {
      res.status(500).json({ message: 'Failed to send OTP', otp });
    }
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
