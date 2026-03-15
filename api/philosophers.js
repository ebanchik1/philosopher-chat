import { philosophers } from '../philosophers.js';

export default function handler(req, res) {
  const safe = philosophers.map(({ systemPrompt, ...rest }) => rest);
  res.json(safe);
}
