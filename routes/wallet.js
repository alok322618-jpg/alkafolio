import { Router } from 'express';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { ethers } from 'ethers';
import TonWeb from 'tonweb';
import jwt from 'jsonwebtoken';
import { Wallet } from '../models/Wallet.js';
import { Snapshot } from '../models/Snapshot.js';
import { getCachedPrices } from './prices.js';

const router = Router();

// Use dedicated RPC if set in env (Helius/QuickNode free tiers avoid rate limits)
const connection = new Connection(
  process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
  'confirmed'
);
// eth.llamarpc.com went down (HTTP 525) — keep the RPC URL configurable
// via ETH_RPC_URL so it can be swapped from the Render dashboard without a redeploy
const ethProvider = new ethers.JsonRpcProvider(
  process.env.ETH_RPC_URL || 'https://ethereum-rpc.publicnode.com'
);
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

const MAX_WALLETS = 5;

function isValidAddress(address, chain) {
  if (typeof address !== 'string') return false;
  const a = address.trim();
  if (chain === 'ethereum') return /^0x[0-9a-fA-F]{40}$/.test(a);
  if (chain === 'solana') return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a);
  if (chain === 'ton') return a.length >= 40 && a.length <= 70 && /^[A-Za-z0-9_+-]+$/.test(a);
  return false;
}

// POST /api/wallets
router.post('/wallets', requireAuth, async (req, res) => {
  try {
    const { address, chain, label } = req.body;
    if (!address || !chain)
      return res.status(400).json({ error: 'address and chain are required' });
    if (!['solana', 'ethereum', 'ton'].includes(chain))
      return res.status(400).json({ error: "chain must be 'solana', 'ethereum', or 'ton'" });
    if (!isValidAddress(address, chain))
      return res.status(400).json({ error: `Invalid ${chain} wallet address` });

    const count = await Wallet.countDocuments({ userId: req.userId });
    if (count >= MAX_WALLETS)
      return res.status(400).json({ error: `Maximum ${MAX_WALLETS} wallets allowed` });

    const existing = await Wallet.findOne({ userId: req.userId, address: address.trim(), chain });
    if (existing) return res.status(409).json({ error: 'Wallet already added' });

    const wallet = await Wallet.create({ userId: req.userId, address: address.trim(), chain, label: label || '' });
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
        console.log('Balance fetched:', w.address, balance, unit);
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

    // Record today's portfolio snapshot (one per user per day) for the
    // real history chart. Failures here must never break the balances call.
    try {
      const prices = await getCachedPrices();
      const priceOf = { solana: prices.solana?.usd, ethereum: prices.ethereum?.usd, ton: prices['the-open-network']?.usd };
      let totalUsd = 0;
      for (const b of balances) {
        if (typeof b.balance === 'number' && priceOf[b.chain]) totalUsd += b.balance * priceOf[b.chain];
      }
      const date = new Date().toISOString().slice(0, 10);
      await Snapshot.updateOne(
        { userId: req.userId, date },
        { $set: { totalUsd: +totalUsd.toFixed(2) } },
        { upsert: true }
      );
    } catch (snapErr) {
      console.error('Snapshot save failed:', snapErr.message);
    }

    res.json({ balances });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/snapshots — last 30 daily portfolio totals (oldest first)
router.get('/snapshots', requireAuth, async (req, res) => {
  try {
    const snaps = await Snapshot.find({ userId: req.userId })
      .sort({ date: 1 })
      .limit(30)
      .select('date totalUsd -_id');
    res.json({ snapshots: snaps });
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
