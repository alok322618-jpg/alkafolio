import { Router } from "express";
import { requireAuth, type AuthRequest } from "../middlewares/auth.js";

const router = Router();

const COINGECKO_BASE = "https://api.coingecko.com/api/v3";

const CHAIN_TO_COINGECKO_ID: Record<string, string> = {
  solana: "solana",
  ethereum: "ethereum",
  bitcoin: "bitcoin",
  ton: "the-open-network",
};

async function cgFetch(path: string): Promise<unknown> {
  const res = await fetch(`${COINGECKO_BASE}${path}`, {
    headers: {
      Accept: "application/json",
      "x-cg-demo-api-key": process.env["COINGECKO_API_KEY"] ?? "",
    },
  });

  if (!res.ok) {
    throw new Error(`CoinGecko error ${res.status}: ${await res.text()}`);
  }

  return res.json();
}

router.get("/prices", requireAuth, async (_req: AuthRequest, res) => {
  const ids = Object.values(CHAIN_TO_COINGECKO_ID).join(",");
  const data = await cgFetch(
    `/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true`,
  );
  res.json(data);
});

router.get("/prices/search", requireAuth, async (req: AuthRequest, res) => {
  const { q } = req.query as { q?: string };
  if (!q) {
    res.status(400).json({ error: "q (search query) is required" });
    return;
  }
  const data = await cgFetch(`/search?query=${encodeURIComponent(q)}`);
  res.json(data);
});

router.get("/prices/history/:coinId", requireAuth, async (req: AuthRequest, res) => {
  const { coinId } = req.params as { coinId: string };
  const days = (req.query as { days?: string }).days ?? "7";
  const resolved = CHAIN_TO_COINGECKO_ID[coinId] ?? coinId;
  const data = await cgFetch(
    `/coins/${resolved}/market_chart?vs_currency=usd&days=${days}`,
  );
  res.json(data);
});

router.get("/prices/market/:coinId", requireAuth, async (req: AuthRequest, res) => {
  const { coinId } = req.params as { coinId: string };
  const resolved = CHAIN_TO_COINGECKO_ID[coinId] ?? coinId;
  const data = await cgFetch(
    `/coins/${resolved}?localization=false&tickers=false&community_data=false&developer_data=false`,
  );
  res.json(data);
});

router.get("/prices/:coinId", requireAuth, async (req: AuthRequest, res) => {
  const { coinId } = req.params as { coinId: string };
  const resolved = CHAIN_TO_COINGECKO_ID[coinId] ?? coinId;
  const data = await cgFetch(
    `/simple/price?ids=${resolved}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true`,
  );
  res.json(data);
});

export default router;
