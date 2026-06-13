// POST /api/admin/login  – アカウント（ユーザー名＋パスワード）の検証。
// 正しければ {ok:true, pref, label}（担当地本をフロントに返す）。
// 後方互換: x-admin-secret（単一パスワード）も super として受理。
import { checkOrigin, rateLimit, requireAccount } from '../_security.js';

export default async function handler(req, res) {
  if (!checkOrigin(req, res)) return;
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!await rateLimit(req, res, 'admin-login', 10, 600)) return; // 10回/10分/IP
  const acc = requireAccount(req, res);
  if (!acc) return;
  return res.status(200).json({ ok: true, pref: acc.pref, label: acc.label });
}
