// /api/report - 利用者からのバグ・不具合報告の受付と、運営（管理画面）での閲覧。
//
// 設計（2026-07-17 ntfy から運営コンソールへ完全移行）:
// - 報告本体（個人情報を含みうる：連絡先メール・端末情報）は **外部サービスには一切送らず**、
//   サーバー側の Redis に保存する。運営者は認証付き管理画面（GET/PATCH/DELETE）で閲覧する。
// - 通知は運営サイト内のみ（管理画面「報告」タブの未読バッジ）。ntfy 等への送信は行わない。
// - 個人情報保護: 各報告は TTL（既定60日）で自動失効。管理画面では連絡先を既定で伏字にし、
//   閲覧・削除は監査ログに残す。投稿は同一オリジンのみ（CSRF）＋IPレートリミット。
//
// メソッド:
//   POST   … 利用者の報告投稿（公開・要同一オリジン・レートリミット）
//   GET    … 報告一覧の取得（要ログイン＋report:read）
//   PATCH  … 既読/対応状態の更新（要ログイン＋report:read＋同一オリジン）
//   DELETE … 報告の削除＝個人情報の消去（要ログイン＋report:read＋同一オリジン）
import {
  checkOrigin, noStore, requireSameOrigin, rateLimit,
  requireAuth, hasPermission, writeAudit, redis,
} from './_security.js';
import { randomUUID } from 'node:crypto';

// Redis: 各報告は個別キー（TTL付き）＋ id インデックス（新しい順・上限）で保持する。
// 個別キーに TTL を持たせることで、保存期間を過ぎた個人情報が自動的に消える。
const IDX_KEY   = 'report:index';                 // list: 新しい順の id
const ITEM_KEY  = (id) => `report:item:${id}`;    // string(JSON): 報告本体
const INDEX_MAX = 1000;                           // インデックスの保持上限
const TTL_DAYS  = Number(process.env.REPORT_TTL_DAYS || 60);
const TTL_SEC   = Math.max(1, Math.floor(TTL_DAYS * 24 * 3600));

// ── 入力の安全化（ntfy 版から流用。制御/双方向/ゼロ幅を除去し長さを制限） ──
function isRemovableCode(c) {
  if (c === 9 || c === 10) return false;
  if (c <= 31) return true;
  if (c >= 0x7f && c <= 0x9f) return true;
  if (c >= 0x200b && c <= 0x200d) return true;
  if (c >= 0x202a && c <= 0x202e) return true;
  if (c >= 0x2066 && c <= 0x2069) return true;
  if (c === 0xfeff) return true;
  return false;
}
function stripUnsafe(str) {
  let out = '';
  for (const ch of String(str ?? '')) if (!isRemovableCode(ch.codePointAt(0))) out += ch;
  return out;
}
function sanitizeText(input, { maxLen, allowNewlines }) {
  let t = stripUnsafe(input);
  if (allowNewlines) {
    t = t.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{4,}/g, '   ');
  } else {
    t = t.replace(/[\r\n\t]+/g, ' ');
  }
  t = t.trim();
  if (t.length > maxLen) t = t.slice(0, maxLen) + '…';
  return t;
}

/** 連絡先を一覧向けに伏字化（例: ab***@example.com / 090****1234）。 */
function maskContact(s) {
  const v = String(s || '').trim();
  if (!v) return '';
  const at = v.indexOf('@');
  if (at > 0) {
    const local = v.slice(0, at), dom = v.slice(at);
    const head = local.slice(0, Math.min(2, local.length));
    return `${head}${'*'.repeat(Math.max(1, local.length - head.length))}${dom}`;
  }
  if (v.length <= 4) return '*'.repeat(v.length);
  return `${v.slice(0, 2)}${'*'.repeat(v.length - 4)}${v.slice(-2)}`;
}

async function readReports(limit) {
  const ids = (await redis.lrange(IDX_KEY, 0, limit - 1)) || [];
  if (!ids.length) return [];
  const items = await Promise.all(ids.map(async (id) => {
    try {
      const raw = await redis.get(ITEM_KEY(id));
      if (!raw) return null;                    // TTL 失効済み
      return typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch { return null; }
  }));
  return items.filter(Boolean);
}

export default async function handler(req, res) {
  if (!checkOrigin(req, res)) return;
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-user, x-admin-pass, x-admin-secret');
  if (req.method === 'OPTIONS') return res.status(204).end();

  // ── 利用者からの投稿（公開・要同一オリジン・レートリミット） ──
  if (req.method === 'POST') {
    if (!await requireSameOrigin(req, res)) return;       // ブラウザ外/他サイトからの投稿を遮断
    if (!await rateLimit(req, res, 'report', 5, 600)) return; // 5件/10分/IP

    const body = req.body ?? {};
    const message  = sanitizeText(body.message, { maxLen: 4000, allowNewlines: true });
    const title    = sanitizeText(body.title,   { maxLen: 120,  allowNewlines: false }) || 'バグ報告';
    const category = sanitizeText(body.category, { maxLen: 40, allowNewlines: false });
    const contact  = sanitizeText(body.contact,  { maxLen: 200, allowNewlines: false });
    // 状況情報（端末/URL等）はオブジェクトで受け取り、各値を短く安全化して保存する
    const ctxIn = (body.context && typeof body.context === 'object') ? body.context : {};
    const context = {};
    for (const k of ['url', 'version', 'ua', 'size', 'updatedAt', 'sentAt', 'pref', 'eventId', 'eventTitle', 'eventDate']) {
      if (ctxIn[k] != null) context[k] = sanitizeText(ctxIn[k], { maxLen: 300, allowNewlines: false });
    }
    if (!message) return res.status(400).json({ error: 'message is required' });

    const id = randomUUID();
    const now = Date.now();
    const item = {
      id, at: new Date(now).toISOString(), category: category || '未分類',
      title, message, contact, context,
      read: false, status: 'open',
    };
    try {
      await redis.set(ITEM_KEY(id), JSON.stringify(item), { ex: TTL_SEC });
      await redis.lpush(IDX_KEY, id);
      await redis.ltrim(IDX_KEY, 0, INDEX_MAX - 1);
    } catch (err) {
      console.error('[report] save error', err);
      return res.status(500).json({ error: 'Failed to save report' });
    }

    // 通知は運営サイト（管理画面「報告」タブの未読バッジ）のみ。
    // 外部サービス（ntfy 等）へは一切送らない＝個人情報を含みうる報告を公開経路に出さない。
    return res.status(200).json({ ok: true });
  }

  // ── 以降は運営（管理）操作: 認証 + report:read 必須 ──
  noStore(res);
  const account = await requireAuth(req, res);
  if (!account) return;
  if (!hasPermission(account, 'report:read')) {
    await writeAudit(account, { action: 'report.read', result: 'denied', note: '権限不足' });
    return res.status(403).json({ error: '報告を閲覧する権限がありません' });
  }

  if (req.method === 'GET') {
    if (!await rateLimit(req, res, 'admin-report', 60, 600)) return;
    // 連絡先の実値表示は「1件ずつ」に限定する（一覧では常に伏字）。
    // reveal=1 のときは id 必須で、その1件の連絡先のみを返す＝画面に不要な個人情報を渡さない。
    const revealId = String(req.query?.reveal || '') === '1' ? String(req.query?.id || '') : '';
    try {
      if (revealId) {
        const raw = await redis.get(ITEM_KEY(revealId));
        if (!raw) return res.status(404).json({ error: 'not found' });
        const item = typeof raw === 'string' ? JSON.parse(raw) : raw;
        await writeAudit(account, { action: 'report.reveal', result: 'success', targetId: revealId });
        return res.status(200).json({ id: revealId, contact: item.contact || '' });
      }
      const limit = Math.min(500, Math.max(1, Number.parseInt(req.query?.limit, 10) || 200));
      const items = await readReports(limit);
      const reports = items.map((r) => {
        const { contact, ...rest } = r; // 一覧では実値を返さない（伏字のみ）
        return { ...rest, contactMasked: maskContact(contact), hasContact: !!contact };
      });
      const unread = reports.filter(r => !r.read).length;
      return res.status(200).json({ reports, unread, ttlDays: TTL_DAYS });
    } catch (err) { console.error('[report] GET', err); return res.status(500).json({ error: 'failed to read reports' }); }
  }

  // 状態変更は同一オリジン必須（CSRF）
  if (req.method === 'PATCH') {
    if (!await requireSameOrigin(req, res)) return;
    const { id, read, status } = req.body ?? {};
    if (!id) return res.status(400).json({ error: 'id is required' });
    try {
      const raw = await redis.get(ITEM_KEY(id));
      if (!raw) return res.status(404).json({ error: 'not found' });
      const item = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (typeof read === 'boolean') item.read = read;
      if (typeof status === 'string' && ['open', 'resolved'].includes(status)) {
        item.status = status;
        if (status === 'resolved') {
          // 「対応済みにする」を押した運営者を記録（仮名 displayId ＋ 表示名 label）
          item.resolvedBy = account.displayId || account.label || '';
          item.resolvedByLabel = account.label || account.displayId || '';
          item.resolvedAt = new Date().toISOString();
        } else {
          delete item.resolvedBy; delete item.resolvedByLabel; delete item.resolvedAt;
        }
      }
      // 残り TTL を維持したまま更新（個人情報の保存期間を延ばさない）
      let ttl = await redis.ttl(ITEM_KEY(id));
      if (!Number.isFinite(ttl) || ttl <= 0) ttl = TTL_SEC;
      await redis.set(ITEM_KEY(id), JSON.stringify(item), { ex: ttl });
      await writeAudit(account, { action: 'report.update', result: 'success', targetId: id, note: `read=${item.read} status=${item.status}` });
      return res.status(200).json({ ok: true });
    } catch (err) { console.error('[report] PATCH', err); return res.status(500).json({ error: 'failed to update' }); }
  }

  // 削除＝個人情報の即時消去
  if (req.method === 'DELETE') {
    if (!await requireSameOrigin(req, res)) return;
    const id = req.body?.id || req.query?.id;
    if (!id) return res.status(400).json({ error: 'id is required' });
    try {
      await redis.del(ITEM_KEY(id));
      await redis.lrem(IDX_KEY, 0, id);
      await writeAudit(account, { action: 'report.delete', result: 'success', targetId: id });
      return res.status(200).json({ ok: true });
    } catch (err) { console.error('[report] DELETE', err); return res.status(500).json({ error: 'failed to delete' }); }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
