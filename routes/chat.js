import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import jwt from 'jsonwebtoken';

const router = Router();
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const BOT_SYSTEM = `You are AlkaBot, the AI assistant for AlkaFolio — a multi-chain crypto portfolio tracker supporting Phantom (Solana), MetaMask (Ethereum), and Tonkeeper (TON).

ONLY answer questions about:
- AlkaFolio features and usage
- Wallet connections (Phantom, MetaMask, Tonkeeper)
- Solana, Ethereum, TON blockchain basics
- Crypto P&L and portfolio tracking
- Supported tokens and chains

If asked anything else, respond: "I can only help with AlkaFolio and Web3 related questions."

Key facts: Max 5 wallets, read-only access, P&L = Today's Value - Yesterday's Value, supports SOL/ETH/TON chains. Be concise and helpful.`;

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

// POST /api/chat
router.post('/chat', requireAuth, async (req, res) => {
  try {
    const { message, history } = req.body;
    if (!message) return res.status(400).json({ error: 'message is required' });

    const messages = [...(history || []).slice(-8)];
    if (!messages.find(m => m.role === 'user' && m.content === message)) {
      messages.push({ role: 'user', content: message });
    }

    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 500,
      system: BOT_SYSTEM,
      messages,
    });

    res.json({ reply: response.content[0].text });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/chat/stream
router.post('/chat/stream', requireAuth, async (req, res) => {
  try {
    const { message, history } = req.body;
    if (!message) return res.status(400).json({ error: 'message is required' });

    const messages = [...(history || []).slice(-8)];
    if (!messages.find(m => m.role === 'user' && m.content === message)) {
      messages.push({ role: 'user', content: message });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const stream = client.messages.stream({
      model: 'claude-sonnet-4-5',
      max_tokens: 500,
      system: BOT_SYSTEM,
      messages,
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
});

export default router;
