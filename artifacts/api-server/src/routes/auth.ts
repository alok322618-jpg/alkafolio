import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import { User } from "../models/User.js";
import { logger } from "../lib/logger.js";

const router = Router();

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendOtpEmail(email: string, otp: string): Promise<void> {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env["EMAIL_USER"],
      pass: process.env["EMAIL_PASS"],
    },
  });

  await transporter.sendMail({
    from: `"AlkaFolio" <${process.env["EMAIL_USER"]}>`,
    to: email,
    subject: "Your AlkaFolio verification code",
    text: `Your OTP is: ${otp}\n\nThis code expires in 10 minutes.`,
    html: `<p>Your AlkaFolio verification code is: <strong>${otp}</strong></p><p>This code expires in 10 minutes.</p>`,
  });
}

router.post("/auth/signup", async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    res.status(400).json({ error: "email and password are required" });
    return;
  }

  const existing = await User.findOne({ email });
  if (existing) {
    res.status(409).json({ error: "Email already registered" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const otp = generateOtp();
  const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

  const user = await User.create({ email, passwordHash, otp, otpExpiry });

  try {
    await sendOtpEmail(email, otp);
  } catch (err) {
    logger.warn({ err }, "Failed to send OTP email — returning OTP in dev mode");
    res.status(201).json({ message: "User created. Email send failed.", otp, userId: user._id });
    return;
  }

  res.status(201).json({ message: "User created. Check your email for OTP.", userId: user._id });
});

router.post("/auth/verify-otp", async (req, res) => {
  const { email, otp } = req.body as { email?: string; otp?: string };

  if (!email || !otp) {
    res.status(400).json({ error: "email and otp are required" });
    return;
  }

  const user = await User.findOne({ email });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (user.isVerified) {
    res.status(400).json({ error: "Email already verified" });
    return;
  }

  if (!user.otp || !user.otpExpiry || user.otp !== otp || user.otpExpiry < new Date()) {
    res.status(400).json({ error: "Invalid or expired OTP" });
    return;
  }

  user.isVerified = true;
  user.otp = null;
  user.otpExpiry = null;
  await user.save();

  const secret = process.env["JWT_SECRET"]!;
  const token = jwt.sign({ userId: user._id.toString() }, secret, { expiresIn: "7d" });

  res.json({ message: "Email verified successfully", token });
});

router.post("/auth/login", async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    res.status(400).json({ error: "email and password are required" });
    return;
  }

  const user = await User.findOne({ email });
  if (!user) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  if (!user.isVerified) {
    res.status(403).json({ error: "Email not verified. Please verify your OTP first." });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const secret = process.env["JWT_SECRET"]!;
  const token = jwt.sign({ userId: user._id.toString() }, secret, { expiresIn: "7d" });

  res.json({ message: "Login successful", token, userId: user._id });
});

router.post("/auth/resend-otp", async (req, res) => {
  const { email } = req.body as { email?: string };

  if (!email) {
    res.status(400).json({ error: "email is required" });
    return;
  }

  const user = await User.findOne({ email });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (user.isVerified) {
    res.status(400).json({ error: "Email already verified" });
    return;
  }

  const otp = generateOtp();
  user.otp = otp;
  user.otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
  await user.save();

  try {
    await sendOtpEmail(email, otp);
    res.json({ message: "OTP resent successfully" });
  } catch (err) {
    logger.warn({ err }, "Failed to resend OTP email");
    res.status(500).json({ error: "Failed to send OTP email", otp });
  }
});

export default router;
