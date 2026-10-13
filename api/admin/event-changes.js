// /api/admin/event-changes  – イベントの開催状況（中止・延期・受付終了）と変更のお知らせを管理する。
//   GET    ?id=…                                → 現在の開催状況・変更記録（非公開分・根拠を含む）・自動判定の根拠
//   POST   { id, change: {type, reason, before, after, public, notify, evidence, confirmed, apply} }
//                                               → 変更を登録（種別に応じて開催状況も更新。必要なら通知）
//   PATCH  { id, changeId, public }             → 利用者への公開／非公開を切り替える
//   DELETE { id, changeId }                     → 変更記録を取り消す（開催状況は戻さない）
//
// 保存先:
//   手動イベント（manual-…）  … イベント本体（Redis hash manual:events）の status / changes
//   自動収集イベント          … 上書きレコード（Redis hash manual:overrides）の status / changes
//   どちらもスクレイプでは書き換わらない（上書きは表示時に適用される）ので、次回の取得で消えない。
//
// 権限: requireAuth → 手動は event:update・自動収集は event:override → canManageScope（所属はサーバーで解決）
//       → 「開催予定に戻す」（status=published）は公開権限（canPublish）も必要 → writeAudit。
import { checkOrigin, noStore, requireSameOrigin, rateLimit, requireAuth, hasPermission, canManageScope, canPublish, redis, writeAudit } from '../_security.js';
import { findEvent, MANUAL_KEY, OVERRIDE_KEY, EVENT_ID_RE } from '../_eventScope.js';
import { sendToWatchers } from '../_push.js';
import C from '../../shared/eventChanges.cjs';

const WD = ['日', '月', '火', '水', '木', '金', '土'];
const weekdayOf = d => { const t = new Date(d + 'T00:00:00Z'); return Number.isNaN(t.getTime()) ? '' : WD[t.getUTCDay()]; };
const parse = (raw) => (typeof raw === 'string' ? JSON.parse(raw) : raw);
const NOTIFY_DEDUP_SEC = 86400;   // 同じ内容の通知を24時間は送り直さない

/** 保存先（手動イベント本体 or 上書きレコード）を読む */
async function loadTarget(found, id) {
  if (found.kind === 'manual') return { key: MANUAL_KEY, record: found.event };
  const raw = await redis.hget(OVERRIDE_KEY, id);
  return { key: OVERRIDE_KEY, record: raw ? parse(raw) : {} };
}

/** 監査ログに残す要約（変更記録の全文は長いので件数のみ） */
const summarize = (r) => r ? {
  status: r.status || '', date: r.date, endDate: r.endDate, time: r.time, place: r.place, address: r.address,
  changes: Array.isArray(r.changes) ? r.changes.length : 0,
} : null;

export default async function handler(req, res) {
  noStore(res);
  if (!checkOrigin(req, res)) return;
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!await requireSameOrigin(req, res)) return;
  if (!await rateLimit(req, res, 'admin-event-changes', 60, 600)) return;
  const account = await requireAuth(req, res);
  if (!account) return;

  const id = String((req.method === 'GET' ? req.query?.id : req.body?.id) || '').trim();
  if (!id || !EVENT_ID_RE.test(id)) return res.status(400).json({ error: 'id is required' });

  const found = await findEvent(req, id);
  if (!found || !found.pref) return res.status(404).json({ error: '対象イベントが見つかりません' });
  const perm = found.kind === 'manual' ? 'event:update' : 'event:override';
  const action = req.method === 'GET' ? 'event.change.read' : 'event.change';
  if (!hasPermission(account, perm)) {
    if (req.method !== 'GET') await writeAudit(account, { action, result: 'denied', targetId: id, note: '権限不足' });
    return res.status(403).json({ error: '権限がありません' });
  }
  if (!canManageScope(account, { pref: found.pref, office: found.office })) {
    if (req.method !== 'GET') await writeAudit(account, { action, result: 'denied', targetId: id, organization: found.pref, office: found.office, note: '担当外イベント' });
    return res.status(403).json({ error: '担当範囲のイベントのみ操作できます' });
  }

  try {
    const { key, record } = await loadTarget(found, id);
    const base = found.event;   // 手動は本体、自動収集は events.json の要約
    const current = found.kind === 'manual' ? record : { ...base, ...record };

    // ── 参照 ──
    if (req.method === 'GET') {
      return res.status(200).json({
        id, kind: found.kind,
        status: current.status || 'published',
        changes: C.sanitizeStoredChanges(record.changes),
        event: { title: current.title, date: current.date, endDate: current.endDate || null, time: current.time || '', place: current.place || '', address: current.address || '' },
        // 自動収集の判定根拠（運営が「本当に中止か」を確かめるため）
        auto: found.kind === 'scraped' ? {
          status: base.status || 'published', reason: base.statusReason || '',
          confidence: base.statusConfidence || '', evidence: base.statusEvidence || '',
        } : null,
      });
    }

    // ── 登録 ──
    if (req.method === 'POST') {
      const built = C.buildChangeEntry(req.body?.change, { by: account.displayId });
      if (built.error) return res.status(400).json({ error: built.error });
      const { entry, apply } = built;
      const def = C.CHANGE_TYPES[entry.type];
      if (def.status === 'published' && !canPublish(account)) {
        await writeAudit(account, { action, result: 'denied', targetId: id, organization: found.pref, office: found.office, note: '公開権限なし（開催予定に戻す）' });
        return res.status(403).json({ error: '開催予定に戻すには公開権限が必要です' });
      }
      if (entry.notify && found.kind === 'manual' && record.status === 'draft') {
        return res.status(400).json({ error: '下書きのイベントは通知できません（公開後に登録してください）' });
      }
      // 曜日も揃える
      const applyAll = { ...apply };
      if (applyAll.date) applyAll.weekday = weekdayOf(applyAll.date);
      if (applyAll.endDate) applyAll.endWeekday = weekdayOf(applyAll.endDate);
      if (applyAll.endDate === null) applyAll.endWeekday = null;
      let next = C.applyChange(record, entry, applyAll);
      // 下書きの手動イベントに延期等を登録しても公開にはしない（下書きのまま状態だけ記録しない）
      if (found.kind === 'manual' && record.status === 'draft') next.status = 'draft';
      const effDate = next.date || base.date;
      const effEnd = next.endDate === null ? null : (next.endDate || base.endDate);
      if (effDate && effEnd && effEnd < effDate) return res.status(400).json({ error: '終了日が開催日より前になっています' });
      if (found.kind === 'manual') {
        next.updatedAt = entry.at; next.updatedBy = account.displayId;
        // 会場が変わったら天気用の座標を取り直す（既存の編集APIと同じ扱い）
        if (applyAll.place !== undefined || applyAll.address !== undefined) { next.weatherLocation = null; next.weatherLocationNeedsUpdate = true; }
      } else {
        next = { ...next, _pref: found.pref, _office: found.office, _by: account.displayId, _at: entry.at };
      }
      await redis.hset(key, { [id]: JSON.stringify(next) });
      await writeAudit(account, {
        action: 'event.change', result: 'success', targetId: id, organization: found.pref, office: found.office,
        title: current.title || '', before: summarize(current), after: { ...summarize(found.kind === 'manual' ? next : { ...base, ...next }), entry },
        note: `${def.label}${entry.reason ? `: ${entry.reason}` : ''}${entry.public ? '（公開）' : '（非公開）'}`,
      });

      // ── 通知（公開・確認済みの根拠つきの重要な変更のみ。buildChangeEntry で検証済み） ──
      let notify = null;
      if (entry.notify) {
        const evForMsg = { id, title: current.title };
        const msg = C.buildChangeNotification(evForMsg, entry);
        // 同じイベント・同じ内容の通知は24時間に1回まで（登録し直し・二重送信の防止）
        const sig = `${entry.type}|${msg.body}`;
        const dedupKey = `push:change-sent:${id}:${Buffer.from(sig).toString('base64url').slice(0, 80)}`;
        const first = await redis.set(dedupKey, entry.id, { nx: true, ex: NOTIFY_DEDUP_SEC });
        if (!first) {
          notify = { skipped: 'duplicate' };
        } else {
          try {
            notify = await sendToWatchers(id, msg);
            const saved = parse(await redis.hget(key, id));
            const list = C.sanitizeStoredChanges(saved.changes).map(c => (c.id === entry.id ? { ...c, notifiedAt: new Date().toISOString() } : c));
            await redis.hset(key, { [id]: JSON.stringify({ ...saved, changes: list }) });
          } catch (err) {
            // 変更自体は保存済み。送れなかったときは重複防止の印を外し、登録し直せば再送できるようにする
            // （外さないと24時間「通知済み」扱いになり、一度も届かないまま終わる）
            console.error('[admin/event-changes] notify', err && err.message);
            await redis.del(dedupKey).catch(() => {});
            notify = { error: 'send_failed' };
          }
        }
        await writeAudit(account, {
          action: 'event.change.notify', result: notify.skipped ? 'skipped' : notify.error ? 'failed' : 'success', targetId: id,
          organization: found.pref, office: found.office, title: current.title || '',
          note: notify.skipped ? '同じ内容を24時間以内に通知済み'
            : notify.error ? '通知の送信に失敗（変更は保存済み）'
            : `通知 送信${notify.sent}/見守り${notify.watchers}${notify.configured === false ? '（VAPID未設定）' : ''}`,
        });
      }
      return res.status(200).json({ ok: true, entry, status: next.status || 'published', notify });
    }

    // ── 公開/非公開の切り替え ──
    if (req.method === 'PATCH') {
      const changeId = String(req.body?.changeId || '');
      const next = C.setChangeVisibility(record, changeId, req.body?.public === true);
      if (!next) return res.status(404).json({ error: '変更記録が見つかりません' });
      const stamp = found.kind === 'manual' ? { updatedBy: account.displayId } : { _pref: found.pref, _office: found.office, _by: account.displayId, _at: new Date().toISOString() };
      await redis.hset(key, { [id]: JSON.stringify({ ...next, ...stamp }) });
      await writeAudit(account, { action: 'event.change.visibility', result: 'success', targetId: id, organization: found.pref, office: found.office, title: current.title || '', note: `${changeId} を${req.body?.public === true ? '公開' : '非公開'}に` });
      return res.status(200).json({ ok: true });
    }

    // ── 取り消し ──
    if (req.method === 'DELETE') {
      const changeId = String(req.body?.changeId || '');
      const out = C.removeChange(record, changeId);
      if (!out) return res.status(404).json({ error: '変更記録が見つかりません' });
      const stamp = found.kind === 'manual' ? { updatedBy: account.displayId } : { _pref: found.pref, _office: found.office, _by: account.displayId, _at: new Date().toISOString() };
      await redis.hset(key, { [id]: JSON.stringify({ ...out.next, ...stamp }) });
      await writeAudit(account, { action: 'event.change.delete', result: 'success', targetId: id, organization: found.pref, office: found.office, title: current.title || '', before: out.removed, note: `変更記録「${C.CHANGE_TYPES[out.removed.type].label}」を取り消し（開催状況は変更しない）` });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[admin/event-changes]', err);
    return res.status(500).json({ error: 'failed' });
  }
}
