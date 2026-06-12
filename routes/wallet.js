import { Router } from 'express';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { ethers } from 'ethers';
import TonWeb from 'tonweb';
import jwt from 'jsonwebtoken';
import { Wallet } from '../models/Wallet.js';

const router = Router();

const connection = new Connection('https://api.mainnet-beta.solana.com');
const ethProvider = new ethers.JsonRpcProvider('https://eth.llamarpc.com');
const tonweb = new TonWeb(new TonWeb.HttpProvider('https://toncenter.com/api/v2/jsonRPC'));

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

async function fetchBalance(address, chain) {
  if (chain === 'solana') {
    const pubKey = new PublicKey(address);
    const lamports = await connection.getBalance(pubKey);
    const balance = lamports / LAMPORTS_PER_SOL;
    return { balance, unit: 'SOL' };
  }
  if (chain === 'ethereum') {
    const wei = await ethProvider.getBalance(address);
    return { balance: parseFloat(ethers.formatEther(wei)), unit: 'ETH' };
  }
  if (chain === 'ton') {
    const nanotons = await tonweb.getBalance(address);
    return { balance: Number(nanotons) / 1e9, unit: 'TON' };
  }
  throw new Error(`Unsupported chain: ${chain}`);
}

// GET /api/wallets
router.get('/wallets', requireAuth, async (req, res) => {
  try {
    const wallets = await Wallet.find({ userId: req.userId }).sort({ createdAt: -1 });
    res.json({ wallets });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/wallets
router.post('/wallets', requireAuth, async (req, res) => {
  try {
    const { address, chain, label } = req.body;
    if (!address || !chain)
      return res.status(400).json({ error: 'address and chain are required' });
    if (!['solana', 'ethereum', 'ton'].includes(chain))
      return res.status(400).json({ error: "chain must be 'solana', 'ethereum', or 'ton'" });

    const existing = await Wallet.findOne({ userId: req.userId, address, chain });
    if (existing) return res.status(409).json({ error: 'Wallet already added' });

    const wallet = await Wallet.create({ userId: req.userId, address, chain, label: label || '' });
    res.status(201).json({ wallet });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/wallets/:id
router.delete('/wallets/:id', requireAuth, async (req, res) => {
  try {
    const wallet = await Wallet.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!wallet) return res.status(404).json({ error: 'Wallet not found' });
    res.json({ message: 'Wallet removed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/wallets/balances — must be before /:id/balance
router.get('/wallets/balances', requireAuth, async (req, res) => {
  try {
    const wallets = await Wallet.find({ userId: req.userId });
    const results = await Promise.allSettled(
      wallets.map(async (w) => {
        const { balance, unit } = await fetchBalance(w.address, w.chain);
        return { id: w._id, address: w.address, chain: w.chain, label: w.label, balance, unit };
      })
    );
    const balances = results.map((r, i) =>
      r.status === 'fulfilled'
        ? r.value
        : {
            id: wallets[i]._id,
            address: wallets[i].address,
            chain: wallets[i].chain,
            label: wallets[i].label,
            balance: null,
            error: 'Failed to fetch balance',
          }
    );
    res.json({ balances });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/wallets/:id/balance
router.get('/wallets/:id/balance', requireAuth, async (req, res) => {
  try {
    const wallet = await Wallet.findOne({ _id: req.params.id, userId: req.userId });
    if (!wallet) return res.status(404).json({ error: 'Wallet not found' });
    const { balance, unit } = await fetchBalance(wallet.address, wallet.chain);
    res.json({ address: wallet.address, chain: wallet.chain, balance, unit });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
