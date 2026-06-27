import { Router } from 'express';
const router = Router();

const COIN_IDS = 'bitcoin,solana,ethereum,the-open-network,usd-coin,bonk,jupiter,dogwifcoin';

// GET /api/prices — public, no auth required, proxies CoinGecko with API key
router.get('/prices', async (_req, res) => {
  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${COIN_IDS}&vs_currencies=usd&include_24hr_change=true`;
    const r = await fetch(url, {
      headers: {
        'x-cg-demo-api-key': process.env.COINGECKO_API_KEY || '',
        'Accept': 'application/json',
      }
    });
    if (!r.ok) throw new Error('CoinGecko error: ' + r.status);
    const data = await r.json();
    res.json(data);
  } catch (e) {
    console.error('CoinGecko fetch failed:', e.message);
    res.status(500).json({ error: e.message });
  }
});

export default router;
