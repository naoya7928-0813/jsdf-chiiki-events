// POST /api/admin/logout  – サーバー側セッションを失効し Cookie を削除する。
import { checkOrigin, authenticate, endSession, writeAudit } from '../_security.js';

export default async function handler(req, res) {
  if (!checkOrigin(req, res)) return;
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const r = await authenticate(req); // 誰のログアウトか記録するため
  await endSession(req, res);
  if (r) await writeAudit(r.account, { action: 'auth.logout', result: 'success' });
  return res.status(200).json({ ok: true });
}
