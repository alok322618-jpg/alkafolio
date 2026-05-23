import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import mongoose from 'mongoose';
import authRoutes from './routes/auth.js';
import walletRoutes from './routes/wallet.js';
import chatRoutes from './routes/chat.js';
import pricesRoutes from './routes/prices.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());

// Serve static frontend files
app.use(express.static(join(__dirname, 'public')));

// Health check
app.get('/api/healthz', (_req, res) => res.json({ status: 'ok' }));

// API Routes
app.use('/api', authRoutes);
app.use('/api', walletRoutes);
app.use('/api', chatRoutes);
app.use('/api', pricesRoutes);

// Fallback: serve index.html for any non-API route
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(join(__dirname, 'public', 'index.html'));
  }
});

// Connect to MongoDB then start server
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('MONGODB_URI environment variable is required');
  process.exit(1);
}

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('MongoDB connected');
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => console.log(`AlkaFolio API running on port ${PORT}`));
  })
  .catch(err => {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  });
