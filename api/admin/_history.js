// GET /api/admin/history  – 監査履歴（追記専用・削除不可）。
//   閲覧には audit:read 権限が必要。スコープ付きは自分の地本のみ。
// ※ 監査証跡のため DELETE は廃止（開発環境のみ ENABLE_AUDIT_DELETE=true で許可）。
import { checkOrigin, noStore, requireSameOrigin, rateLimit, requireAuth, hasPermission, canManageScope, redis, writeAudit } from '../_security.js';
import { findEvent, OVERRIDE_KEY, EVENT_ID_RE } from '../_eventScope.js';
import { authorship } from '../../shared/editLog.cjs';

const HKEY = 'manual:history';

async function readAll() {
  const raw = await redis.lrange(HKEY, 0, -1);
  return (raw || []).map(v => { try { return typeof v === 'string' ? JSON.parse(v) : v; } catch { return null; } }).filter(Boolean);
}

export default async function handler(req, res) {
  noStore(res); // 管理APIはキャッシュ禁止（成功/エラー問わず）
  if (!checkOrigin(req, res)) return;
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-user, x-admin-pass, x-admin-secret');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!await requireSameOrigin(req, res)) return; // CSRF: 状態変更は同一オリジンのみ
  if (!await rateLimit(req, res, 'admin-history', 60, 600)) return;
  const account = await requireAuth(req, res);
  if (!account) return;

  // ── イベント単位の編集記録（誰が追加・修正したか）。編集できる人なら見られる ──
  //   GET /api/admin/history?targetId=<イベントID>
  //   → { createdBy, createdAt, updatedBy, updatedAt, log: [...], audit: [...]（audit:read がある場合のみ） }
  if (req.method === 'GET' && req.query?.targetId !== undefined) {
    const id = String(req.query.targetId || '');
    if (!EVENT_ID_RE.test(id)) return res.status(400).json({ error: 'targetId が不正です' });
    const canView = ['event:update', 'event:override', 'audit:read'].some(p => hasPermission(account, p));
    const found = canView ? await findEvent(req, id) : null;
    if (!canView || !found || !canManageScope(account, { pref: found.pref, office: found.office })) {
      await writeAudit(account, { action: 'audit.read', result: 'denied', targetId: id, note: '担当外または権限不足（イベントの編集記録）' });
      return res.status(found || !canView ? 403 : 404).json({ error: found || !canView ? '担当範囲のイベントのみ閲覧できます' : 'イベントが見つかりません' });
    }
    try {
      let record = found.event;
      if (found.kind !== 'manual') {
        const raw = await redis.hget(OVERRIDE_KEY, id);
        record = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : {};
      }
      const log = Array.isArray(record._log) ? record._log : [];
      let audit;
      if (hasPermission(account, 'audit:read')) {
        audit = (await readAll()).filter(h => (h.targetId || h.id) === id).slice(0, 100)
          .map(h => ({ at: h.at, actorId: h.actorId || h.user || '', action: h.action, result: h.result || '', note: h.note || '' }));
      }
      return res.status(200).json({ id, kind: found.kind, ...authorship(record), log, ...(audit ? { audit } : {}) });
    } catch (err) { console.error('[admin/history] target', err); return res.status(500).json({ error: 'failed to read history' }); }
  }

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
