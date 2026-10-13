// /api/admin/event-guides  – イベント別の FAQ・参加準備ガイドを管理する。
//   GET ?id=…                            → 保存済みの FAQ（非公開分を含む）・ガイド（未確認を含む）・交通アクセス
//   PUT { id, faq: [...], guide, access } → まとめて保存（並べ替え・追加・削除・公開切替を1回で反映）
//   access … 来場者用入口（名称・緯度経度）・推奨最寄り駅・推奨バス停・交通の注意事項・公式アクセス案内URL
//            （駐車場はガイドの「駐車場」項目を使う）
//
// 保存先は変更・中止の管理（event-changes）と同じ:
//   手動イベント … 本体（manual:events）の faq / guide
//   自動収集     … 上書き（manual:overrides）の faq / guide（スクレイプで消えない）
// イベントの削除時は手動イベント本体と一緒に消える。自動収集イベントは公開データから外れた（終了後7日）時点で
// 表示されなくなり、上書きレコードは運営画面の「上書きを取り消す」までは残る（再掲載に備える）。
//
// 権限: requireAuth → 手動 event:update / 自動収集 event:override → canManageScope（所属はサーバー側で解決）→ writeAudit
import { checkOrigin, noStore, requireSameOrigin, rateLimit, requireAuth, hasPermission, canManageScope, redis, writeAudit } from '../_security.js';
import { findEvent, MANUAL_KEY, OVERRIDE_KEY, EVENT_ID_RE } from '../_eventScope.js';
import G from '../../shared/eventGuide.cjs';
import T from '../../shared/transit.cjs';
import { withLog } from '../../shared/editLog.cjs';

const parse = (raw) => (typeof raw === 'string' ? JSON.parse(raw) : raw);
const MAX_BODY_CHARS = 40000;   // FAQ 20件×600字 + ガイドで十分。巨大な送信を受け付けない

export default async function handler(req, res) {
  noStore(res);
  if (!checkOrigin(req, res)) return;
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' });
  if (!await requireSameOrigin(req, res)) return;
  if (!await rateLimit(req, res, 'admin-event-guides', 60, 600)) return;
  const account = await requireAuth(req, res);
  if (!account) return;

  const id = String((req.method === 'GET' ? req.query?.id : req.body?.id) || '').trim();
  if (!id || !EVENT_ID_RE.test(id)) return res.status(400).json({ error: 'id is required' });

  const found = await findEvent(req, id);
  if (!found || !found.pref) return res.status(404).json({ error: '対象イベントが見つかりません' });
  const perm = found.kind === 'manual' ? 'event:update' : 'event:override';
  if (!hasPermission(account, perm)) {
    if (req.method === 'PUT') await writeAudit(account, { action: 'event.guide', result: 'denied', targetId: id, note: '権限不足' });
    return res.status(403).json({ error: '権限がありません' });
  }
  if (!canManageScope(account, { pref: found.pref, office: found.office })) {
    if (req.method === 'PUT') await writeAudit(account, { action: 'event.guide', result: 'denied', targetId: id, organization: found.pref, office: found.office, note: '担当外イベント' });
    return res.status(403).json({ error: '担当範囲のイベントのみ操作できます' });
  }

  try {
    const key = found.kind === 'manual' ? MANUAL_KEY : OVERRIDE_KEY;
    const raw = found.kind === 'manual' ? found.event : parse(await redis.hget(OVERRIDE_KEY, id));
    const record = raw || {};
    const stored = G.sanitizeStored(record);

    if (req.method === 'GET') {
      return res.status(200).json({ id, kind: found.kind, title: found.event.title || '', faq: stored.faq, guide: stored.guide, access: T.sanitizeAccess(record.access) || {}, updatedAt: record.guideUpdatedAt || null });
    }

    if (JSON.stringify(req.body || {}).length > MAX_BODY_CHARS) return res.status(413).json({ error: '入力が大きすぎます' });
    const f = G.normalizeFaqInput(req.body?.faq);
    if (f.error) return res.status(400).json({ error: f.error });
    const g = G.normalizeGuideInput(req.body?.guide);
    if (g.error) return res.status(400).json({ error: g.error });
    const ac = T.normalizeAccessInput(req.body?.access);
    if (ac.error) return res.status(400).json({ error: ac.error });

    const now = new Date().toISOString();
    const next = { ...record, faq: f.faq, guide: g.guide, access: ac.access, guideUpdatedAt: now };
    if (!f.faq.length) delete next.faq;
    if (!Object.keys(g.guide).length) delete next.guide;
    if (!Object.keys(ac.access).length) delete next.access;
    if (!next.faq && !next.guide && !next.access) delete next.guideUpdatedAt;
    if (found.kind === 'manual') { next.updatedAt = now; next.updatedBy = account.displayId; }
    else Object.assign(next, { _pref: found.pref, _office: found.office, _by: account.displayId, _at: now });

    await redis.hset(key, { [id]: JSON.stringify(withLog(next, { by: account.displayId, action: 'guide', before: record })) });
    await writeAudit(account, {
      action: 'event.guide', result: 'success', targetId: id, organization: found.pref, office: found.office,
      title: found.event.title || '', before: { ...stored, access: T.sanitizeAccess(record.access) }, after: { faq: f.faq, guide: g.guide, access: ac.access },
      note: `FAQ ${f.faq.length}件（公開${f.faq.filter(x => x.public).length}）・ガイド ${Object.keys(g.guide).length}項目・交通アクセス ${Object.keys(ac.access).length}項目`,
    });
    return res.status(200).json({ ok: true, faq: f.faq, guide: g.guide, access: ac.access, updatedAt: now });
  } catch (err) {
    console.error('[admin/event-guides]', err);
    return res.status(500).json({ error: 'failed' });
  }
}
