// GET /api/manual-events  – 運営が手動追加したイベントの一覧（公開）。
// フロントエンドが events.json とマージして全利用者に表示する。
// 認証不要（手動イベントは公開データ）。書き込みは /api/admin/events のみ。
import { redis } from './_security.js';
import { PUBLIC_STATUS_VALUES } from '../shared/eventStatus.cjs';
import { publicChanges } from '../shared/eventChanges.cjs';
import { toPublicRecord } from '../shared/eventGuide.cjs';
import { sanitizeAccess } from '../shared/transit.cjs';

const KEY = 'manual:events';
const OKEY = 'manual:overrides';
// 公開してよい状態（draft 以外。postponed=延期 を含む）。唯一の出どころは shared/eventStatus.cjs
const PUBLIC_STATUSES = PUBLIC_STATUS_VALUES;

/**
 * 変更のお知らせ（changes）は運営が「公開」にしたものだけを公開用の形で出す。
 * 根拠（evidence）・操作者（by）・通知の内部状態は出さない。空なら項目ごと消す。
 */
function withPublicChanges(o) {
  if (!o || o.changes === undefined) return o;
  const { changes, ...rest } = o;
  const pub = publicChanges(changes);
  return pub.length ? { ...rest, changes: pub } : rest;
}

/** 公開用に整える: 変更のお知らせ・FAQ・参加準備ガイドを公開してよい分だけにする */
const toPublic = (o) => {
  const r = toPublicRecord(withPublicChanges(o));
  if (!r || r.access === undefined) return r;
  const { access, ...rest } = r;
  const a = sanitizeAccess(access);
  return a ? { ...rest, access: a } : rest;
};

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  // events.json と同様に短時間キャッシュ（CDN/ブラウザ）
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');
  try {
    const all = await redis.hgetall(KEY);
    const events = (all
      ? Object.values(all).map(v => (typeof v === 'string' ? JSON.parse(v) : v))
      : [])
      // 公開してよい状態のみ通す（許可リスト方式）。status 未設定（旧データ）は公開扱い。
      // 下書きや、今後追加する状態（承認待ち等）は、ここに足さない限り公開されない。
      .filter(e => e && (e.status == null || PUBLIC_STATUSES.has(e.status)))
      // 担当官名など裏側情報は公開しない（createdBy/updatedBy/タイムスタンプ/再取得フラグ/
      // 権限判定用の事務所 office を除去。公開画面は office を使わない）。
      // status は残す: 公開画面は受付終了/中止のバッジを ev.status で表示するため
      // （以前は除去しており、中止にした手動イベントが通常表示されていた）。
      .map(({ createdBy, updatedBy, createdAt, updatedAt, weatherLocationNeedsUpdate, office, ...pub }) => toPublic(pub));

    // 既存イベントの上書き（スクレイプイベント等）。表示フィールドのみ公開する。
    // 「_」で始まる管理用メタ（_by/_at/_pref/_office 等）はすべて除去（今後増えても漏れない）
    let overrides = {};
    try {
      const oraw = await redis.hgetall(OKEY);
      if (oraw) {
        for (const [id, v] of Object.entries(oraw)) {
          const o = typeof v === 'string' ? JSON.parse(v) : v;
          const pub = Object.fromEntries(Object.entries(o || {}).filter(([k]) => !k.startsWith('_')));
          // 上書きの status も公開可能な値だけ（不正値・draft で一覧から消えたりしないように）
          if (pub.status !== undefined && !PUBLIC_STATUSES.has(pub.status)) delete pub.status;
          overrides[id] = toPublic(pub);
        }
      }
    } catch { /* 取得失敗は無視 */ }

    return res.status(200).json({ events, overrides });
  } catch (err) {
    console.error('[manual-events] redis error', err);
    return res.status(200).json({ events: [] }); // 取得失敗時は空（本体表示を妨げない）
  }
}
