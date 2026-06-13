// /api/admin/history  – 変更履歴。要認証。スコープ付きは自分の地本のみ。
//   GET                    → 一覧（最新200件）
//   DELETE { at }          → 指定エントリ（at=ISO時刻）を1件削除
//   DELETE { clear: true } → 自分の閲覧範囲の履歴を全消去（* は全件）
import { checkOrigin, rateLimit, requireAccount, canManagePref, redis } from '../_security.js';

const HKEY = 'manual:history';

async function readAll() {
  const raw = await redis.lrange(HKEY, 0, -1);
  return (raw || []).map(v => { try { return typeof v === 'string' ? JSON.parse(v) : v; } catch { return null; } }).filter(Boolean);
}
// 配列（新しい順）でリストを作り直す
async function rewrite(arr) {
  await redis.del(HKEY);
  if (arr.length) await redis.rpush(HKEY, ...arr.map(o => JSON.stringify(o)));
}

export default async function handler(req, res) {
  if (!checkOrigin(req, res)) return;
  res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-user, x-admin-pass, x-admin-secret');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!await rateLimit(req, res, 'admin-history', 60, 600)) return;
  const account = requireAccount(req, res);
  if (!account) return;

  if (req.method === 'GET') {
    try {
      let history = (await readAll()).slice(0, 200);
      if (account.pref !== '*') history = history.filter(h => h.pref === account.pref);
      return res.status(200).json({ history });
    } catch (err) { console.error('[admin/history] GET', err); return res.status(500).json({ error: 'failed to read history' }); }
  }

  if (req.method === 'DELETE') {
    try {
      const { at, clear } = req.body || {};
      const all = await readAll();
      if (clear === true) {
        // 自分が管理できる範囲だけ消す（* は全件）
        const keep = account.pref === '*' ? [] : all.filter(h => !canManagePref(account, h.pref));
        await rewrite(keep);
        return res.status(200).json({ ok: true });
      }
      if (at) {
        const keep = all.filter(h => !(h.at === at && canManagePref(account, h.pref)));
        await rewrite(keep);
        return res.status(200).json({ ok: true });
      }
      return res.status(400).json({ error: 'at または clear を指定してください' });
    } catch (err) { console.error('[admin/history] DELETE', err); return res.status(500).json({ error: 'failed to delete history' }); }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
