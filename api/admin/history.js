// GET /api/admin/history  – 監査履歴（追記専用・削除不可）。
//   閲覧には audit:read 権限が必要。スコープ付きは自分の地本のみ。
// ※ 監査証跡のため DELETE は廃止（開発環境のみ ENABLE_AUDIT_DELETE=true で許可）。
import { checkOrigin, rateLimit, requireAuth, hasPermission, canManageScope, redis, writeAudit } from '../_security.js';

const HKEY = 'manual:history';

async function readAll() {
  const raw = await redis.lrange(HKEY, 0, -1);
  return (raw || []).map(v => { try { return typeof v === 'string' ? JSON.parse(v) : v; } catch { return null; } }).filter(Boolean);
}

export default async function handler(req, res) {
  if (!checkOrigin(req, res)) return;
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-user, x-admin-pass, x-admin-secret');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!await rateLimit(req, res, 'admin-history', 60, 600)) return;
  const account = await requireAuth(req, res);
  if (!account) return;

  // 監査履歴の閲覧は audit:read 権限のみ（deny-by-default）
  if (!hasPermission(account, 'audit:read')) {
    await writeAudit(account, { action: 'audit.read', result: 'denied', note: '権限不足' });
    return res.status(403).json({ error: '監査履歴を閲覧する権限がありません' });
  }

  if (req.method === 'GET') {
    try {
      let history = (await readAll()).slice(0, 500);
      // スコープ: 自分が管理できる地本のみ（organization フィールド優先、旧データは pref）
      history = history.filter(h => canManageScope(account, { pref: h.organization || h.pref }));
      return res.status(200).json({ history });
    } catch (err) { console.error('[admin/history] GET', err); return res.status(500).json({ error: 'failed to read history' }); }
  }

  // 監査証跡は追記専用。削除は廃止（証跡の改ざん防止）。
  if (req.method === 'DELETE') {
    return res.status(405).json({ error: '監査履歴は削除できません（追記専用）' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
