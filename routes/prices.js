import { Router } from 'express';
const router = Router();

const COIN_IDS = 'bitcoin,solana,ethereum,the-open-network,usd-coin,bonk,jupiter,dogwifcoin';

// In-memory cache: CoinGecko free tier rate-limits aggressively, so we serve
// a cached copy for 60s instead of hitting their API on every page load.
const CACHE_TTL_MS = 60 * 1000;
let cache = { data: null, fetchedAt: 0 };

async function fetchPrices() {
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${COIN_IDS}&vs_currencies=usd&include_24hr_change=true`;
  const r = await fetch(url, {
    headers: {
      'x-cg-demo-api-key': process.env.COINGECKO_API_KEY || '',
      'Accept': 'application/json',
    }
  });
  if (!r.ok) throw new Error('CoinGecko error: ' + r.status);
  return r.json();
}

export async function getCachedPrices() {
  const now = Date.now();
  if (cache.data && now - cache.fetchedAt < CACHE_TTL_MS) return cache.data;
  const data = await fetchPrices();
  cache = { data, fetchedAt: now };
  return data;
}

// GET /api/prices — public, no auth required, proxies CoinGecko with API key
router.get('/prices', async (_req, res) => {
  try {
    const data = await getCachedPrices();
    res.json(data);
  } catch (e) {
    // Serve a stale copy rather than failing outright during a live demo
    if (cache.data) return res.json(cache.data);
    console.error('CoinGecko fetch failed:', e.message);
    res.status(500).json({ error: e.message });
  }
});

export default router;
