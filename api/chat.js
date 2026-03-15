import Anthropic from '@anthropic-ai/sdk';
import { philosophers } from '../philosophers.js';

const client = new Anthropic();

export const config = {
  maxDuration: 60,
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { philosopherId, message, history = [] } = req.body;

  const philosopher = philosophers.find(p => p.id === philosopherId);
  if (!philosopher) {
    return res.status(400).json({ error: 'Unknown philosopher' });
  }

  const messages = [
    ...history.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: message },
  ];

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

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
}
