import Anthropic from '@anthropic-ai/sdk';
import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { philosophers } from './philosophers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// API key check — warn but don't exit so UI can still be previewed
const hasApiKey = !!process.env.ANTHROPIC_API_KEY;
if (!hasApiKey) {
  console.warn('\n  Warning: ANTHROPIC_API_KEY not set. Chat will not work.');
  console.warn('  Set it with: export ANTHROPIC_API_KEY=your_key_here\n');
}

const client = hasApiKey ? new Anthropic() : null;

app.use(express.json());

// Serve built React app from dist/ (production) or public/ (fallback)
import { existsSync } from 'fs';
const distDir = join(__dirname, 'dist');
const publicDir = join(__dirname, 'public');
const staticDir = existsSync(distDir) ? distDir : publicDir;
app.use(express.static(staticDir));

// Return philosopher list (without system prompts)
app.get('/api/philosophers', (_req, res) => {
  const safe = philosophers.map(({ systemPrompt, ...rest }) => rest);
  res.json(safe);
});

// Chat endpoint with SSE streaming
app.post('/api/chat', async (req, res) => {
  const { philosopherId, message, history = [] } = req.body;

  const philosopher = philosophers.find(p => p.id === philosopherId);
  if (!philosopher) {
    return res.status(400).json({ error: 'Unknown philosopher' });
  }

  if (!client) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.flushHeaders();
    res.write(`data: ${JSON.stringify({ error: 'ANTHROPIC_API_KEY is not set. Please set it and restart the server.' })}\n\n`);
    res.end();
    return;
  }

  // Build messages array
  const messages = [
    ...history.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: message },
  ];

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    const stream = client.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: philosopher.systemPrompt,
      messages,
    });

    stream.on('text', (text) => {
      res.write(`data: ${JSON.stringify({ text })}\n\n`);
    });

    await stream.finalMessage();
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    console.error('Stream error:', error.message);
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
});

// SPA fallback — serve index.html for non-API routes
app.get('*', (_req, res) => {
  res.sendFile(join(staticDir, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n  Philosophia is running at http://localhost:${PORT}\n`);
});
