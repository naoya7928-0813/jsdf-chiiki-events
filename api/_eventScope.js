// 管理APIで「対象イベントがどの地本・事務所のものか」をサーバー側で解決する（IDOR対策）。
// クライアントが送る pref/office は信用せず、実データ（Redis の手動イベント → 公開中の events.json）から引く。
// /api/admin/overrides・/api/admin/event-changes・/api/admin/event-guides・/api/admin/view-stats が共有する。
import { redis } from './_security.js';
import { normalizeOrigin, DEFAULT_SITE_URL } from '../shared/siteUrl.cjs';

export const MANUAL_KEY = 'manual:events';
export const OVERRIDE_KEY = 'manual:overrides';

// 運営画面で参照する項目だけを持つ（events.json 全体を関数メモリに抱えない）
const KEEP = ['title', 'date', 'endDate', 'time', 'place', 'address', 'status', 'statusReason',
  'statusConfidence', 'statusEvidence', 'url', 'source_type', 'category'];

// events.json の id→イベント要約（短期キャッシュ）。スクレイプイベントの所属解決用。
let eventsMap = { at: 0, map: null };

/** テスト用: キャッシュを捨てる */
export function resetEventsMapCache() { eventsMap = { at: 0, map: null }; }

export async function loadEventsMap(req) {
  const now = Date.now();
  if (eventsMap.map && now - eventsMap.at < 60000) return eventsMap.map;
  // SITE_URL が設定されていればそれを優先（従来どおり）。未設定なら自分のホスト、
  // それも無ければ既定の公開URL。値の妥当性は normalizeOrigin で検証する
  const base = normalizeOrigin(process.env.SITE_URL)
    || (req && req.headers && req.headers.host ? `https://${req.headers.host}` : DEFAULT_SITE_URL);
  const map = new Map();
  try {
    const r = await fetch(`${base}/data/events.json`, { signal: AbortSignal.timeout(5000) });
    if (r.ok) {
      const data = await r.json();
      for (const k of Object.keys(data)) {
        if (!Array.isArray(data[k])) continue;
        for (const ev of data[k]) {
          if (!ev || !ev.id) continue;
          const summary = { pref: ev.pref || k, office: ev.office || '' };
          for (const f of KEEP) if (ev[f] !== undefined) summary[f] = ev[f];
          map.set(ev.id, summary);
        }
      }
    }
  } catch { /* 取得失敗時は空マップ（手動イベントのみ解決可） */ }
  eventsMap = { at: now, map };
  return map;
}

const parse = (raw) => (typeof raw === 'string' ? JSON.parse(raw) : raw);

/**
 * 対象イベントの所属（地本・事務所）をサーバー側で解決（手動イベント→events.json の順）。
 * 未知は null。スクレイプイベントは office を持たないことが多く、その場合 office='' を返す
 * （= office ロールは canManageScope の deny-by-default で 403、pco_admin 以上のみ操作可能）。
 * @returns {Promise<{pref:string, office:string}|null>}
 */
export async function resolveEventScope(req, id) {
  const found = await findEvent(req, id);
  return found ? { pref: found.pref, office: found.office } : null;
}

/**
 * 対象イベントを探す（手動イベント本体 or 自動収集イベントの要約）。
 * @returns {Promise<{kind:'manual'|'scraped', pref:string, office:string, event:Object}|null>}
 */
export async function findEvent(req, id) {
  if (!id) return null;
  try {
    const raw = await redis.hget(MANUAL_KEY, id);
    if (raw) {
      const ev = parse(raw);
      return { kind: 'manual', pref: ev.pref || '', office: ev.office || '', event: ev };
    }
  } catch { /* noop */ }
  const map = await loadEventsMap(req);
  const s = map.get(id);
  return s ? { kind: 'scraped', pref: s.pref || '', office: s.office || '', event: { id, ...s } } : null;
}

/** 手動イベントID（manual-…）か */
export function isManualId(id) { return String(id || '').startsWith('manual-'); }

/** イベントIDの形（公開APIで受け取る ID の検証。クエリ注入・巨大キーの防止） */
export const EVENT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.:~-]{0,119}$/;
