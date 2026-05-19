import { Router } from "express";
import { Connection, PublicKey, LAMPORTS_PER_SOL, clusterApiUrl } from "@solana/web3.js";
import { ethers } from "ethers";
import TonWeb from "tonweb";
import { Wallet } from "../models/Wallet.js";
import { requireAuth, type AuthRequest } from "../middlewares/auth.js";

const router = Router();

const solConnection = new Connection(clusterApiUrl("mainnet-beta"), "confirmed");
const ethProvider = new ethers.JsonRpcProvider("https://eth.llamarpc.com");
const tonweb = new TonWeb(new TonWeb.HttpProvider("https://toncenter.com/api/v2/jsonRPC"));

async function fetchTonBalance(address: string): Promise<number> {
  const nanotons = await tonweb.getBalance(address) as string;
  return Number(nanotons) / 1e9;
}

async function fetchBalance(address: string, chain: string): Promise<{ balance: number; unit: string }> {
  if (chain === "solana") {
    const pubkey = new PublicKey(address);
    const lamports = await solConnection.getBalance(pubkey);
    return { balance: lamports / LAMPORTS_PER_SOL, unit: "SOL" };
  }

  if (chain === "ethereum") {
    const balanceWei = await ethProvider.getBalance(address);
    return { balance: parseFloat(ethers.formatEther(balanceWei)), unit: "ETH" };
  }

  if (chain === "ton") {
    const balance = await fetchTonBalance(address);
    return { balance, unit: "TON" };
  }

  throw new Error(`Unsupported chain: ${chain}`);
}

router.get("/wallets", requireAuth, async (req: AuthRequest, res) => {
  const wallets = await Wallet.find({ userId: req.userId }).sort({ createdAt: -1 });
  res.json({ wallets });
});

router.post("/wallets", requireAuth, async (req: AuthRequest, res) => {
  const { address, chain, label } = req.body as {
    address?: string;
    chain?: string;
    label?: string;
  };

  if (!address || !chain) {
    res.status(400).json({ error: "address and chain are required" });
    return;
  }

  if (chain !== "solana" && chain !== "ethereum" && chain !== "ton") {
    res.status(400).json({ error: "chain must be 'solana', 'ethereum', or 'ton'" });
    return;
  }

  const existing = await Wallet.findOne({ userId: req.userId, address, chain });
  if (existing) {
    res.status(409).json({ error: "Wallet already added" });
    return;
  }

  const wallet = await Wallet.create({ userId: req.userId, address, chain, label: label ?? "" });
  res.status(201).json({ wallet });
});

router.delete("/wallets/:id", requireAuth, async (req: AuthRequest, res) => {
  const wallet = await Wallet.findOneAndDelete({ _id: req.params["id"], userId: req.userId });
  if (!wallet) {
    res.status(404).json({ error: "Wallet not found" });
    return;
  }
  res.json({ message: "Wallet removed" });
});

router.get("/wallets/balances", requireAuth, async (req: AuthRequest, res) => {
  const wallets = await Wallet.find({ userId: req.userId });

  const results = await Promise.allSettled(
    wallets.map(async (w) => {
      const { balance, unit } = await fetchBalance(w.address, w.chain);
      return { id: w._id, address: w.address, chain: w.chain, label: w.label, balance, unit };
    }),
  );

  const balances = results.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : {
          id: wallets[i]!._id,
          address: wallets[i]!.address,
          chain: wallets[i]!.chain,
          label: wallets[i]!.label,
          balance: null,
          error: "Failed to fetch balance",
        },
  );

  res.json({ balances });
});

router.get("/wallets/:id/balance", requireAuth, async (req: AuthRequest, res) => {
  const wallet = await Wallet.findOne({ _id: req.params["id"], userId: req.userId });
  if (!wallet) {
    res.status(404).json({ error: "Wallet not found" });
    return;
  }

  try {
    const { balance, unit } = await fetchBalance(wallet.address, wallet.chain);
    res.json({ address: wallet.address, chain: wallet.chain, balance, unit });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed to fetch balance" });
  }
});

export default router;
