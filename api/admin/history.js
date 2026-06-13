// GET /api/admin/history  – 変更履歴（最新200件）。要認証。
// スコープ付きアカウントは自分の地本の履歴のみ。* は全件。
import { checkOrigin, rateLimit, requireAccount, redis } from '../_security.js';

const HKEY = 'manual:history';

export default async function handler(req, res) {
  if (!checkOrigin(req, res)) return;
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!await rateLimit(req, res, 'admin-history', 60, 600)) return;
  const account = requireAccount(req, res);
  if (!account) return;
  try {
    const raw = await redis.lrange(HKEY, 0, 199);
    let history = (raw || []).map(v => { try { return typeof v === 'string' ? JSON.parse(v) : v; } catch { return null; } }).filter(Boolean);
    if (account.pref !== '*') history = history.filter(h => h.pref === account.pref);
    return res.status(200).json({ history });
  } catch (err) {
    console.error('[admin/history] error', err);
    return res.status(500).json({ error: 'failed to read history' });
  }
}
