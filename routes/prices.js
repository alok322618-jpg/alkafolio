import { Router } from 'express';
import jwt from 'jsonwebtoken';

const router = Router();

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';
const COIN_IDS = {
  solana: 'solana',
  ethereum: 'ethereum',
  bitcoin: 'bitcoin',
  ton: 'the-open-network',
};

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

async function cgFetch(path) {
  const res = await fetch(`${COINGECKO_BASE}${path}`, {
    headers: {
      Accept: 'application/json',
      'x-cg-demo-api-key': process.env.COINGECKO_API_KEY || '',
    },
  });
  if (!res.ok) throw new Error(`CoinGecko error ${res.status}`);
  return res.json();
}

// GET /api/prices  — SOL, ETH, BTC, TON
router.get('/prices', requireAuth, async (_req, res) => {
  try {
    const ids = Object.values(COIN_IDS).join(',');
    const data = await cgFetch(`/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true`);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/prices/search?q=
router.get('/prices/search', requireAuth, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.status(400).json({ error: 'q (search query) is required' });
    const data = await cgFetch(`/search?query=${encodeURIComponent(q)}`);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/prices/history/:coinId?days=7
router.get('/prices/history/:coinId', requireAuth, async (req, res) => {
  try {
    const id = COIN_IDS[req.params.coinId] || req.params.coinId;
    const days = req.query.days || '7';
    const data = await cgFetch(`/coins/${id}/market_chart?vs_currency=usd&days=${days}`);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/prices/market/:coinId
router.get('/prices/market/:coinId', requireAuth, async (req, res) => {
  try {
    const id = COIN_IDS[req.params.coinId] || req.params.coinId;
    const data = await cgFetch(`/coins/${id}?localization=false&tickers=false&community_data=false&developer_data=false`);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/prices/:coinId
router.get('/prices/:coinId', requireAuth, async (req, res) => {
  try {
    const id = COIN_IDS[req.params.coinId] || req.params.coinId;
    const data = await cgFetch(`/simple/price?ids=${id}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true`);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
