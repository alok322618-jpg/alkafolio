import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { requireAuth, type AuthRequest } from "../middlewares/auth.js";

const router = Router();

const anthropic = new Anthropic({
  apiKey: process.env["ANTHROPIC_API_KEY"],
});

const SYSTEM_PROMPT = `You are AlkaBot, an expert AI assistant for AlkaFolio — a multi-chain crypto portfolio tracker. 
You help users understand their crypto holdings, explain blockchain concepts, analyze portfolio strategies, and provide educational insights about DeFi, Solana, Ethereum, and the broader crypto ecosystem.
Be concise, accurate, and helpful. Do not provide financial advice or price predictions.`;

router.post("/chat", requireAuth, async (req: AuthRequest, res) => {
  const { messages } = req.body as {
    messages?: Array<{ role: "user" | "assistant"; content: string }>;
  };

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages array is required" });
    return;
  }

  const lastMessage = messages[messages.length - 1];
  if (!lastMessage || lastMessage.role !== "user") {
    res.status(400).json({ error: "Last message must have role 'user'" });
    return;
  }

  const response = await anthropic.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages,
  });

  const textContent = response.content.find((c) => c.type === "text");
  const reply = textContent ? textContent.text : "";

  res.json({
    role: "assistant",
    content: reply,
    usage: response.usage,
  });
});

router.post("/chat/stream", requireAuth, async (req: AuthRequest, res) => {
  const { messages } = req.body as {
    messages?: Array<{ role: "user" | "assistant"; content: string }>;
  };

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages array is required" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const stream = anthropic.messages.stream({
    model: "claude-opus-4-5",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages,
  });

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
    }
  }

  res.write("data: [DONE]\n\n");
  res.end();
});

export default router;
