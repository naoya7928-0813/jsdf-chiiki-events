// /api/admin/<action> の振り分け（運営API を1つの関数にまとめる）。
// Vercel の Hobby プランは1デプロイの関数が12個までのため、運営APIは個別ファイルにせず
// ここから呼ぶ（各処理は先頭 "_" のファイル＝関数として公開されない）。
// ⚠️ 運営APIを追加したら HANDLERS に足すこと。認証・認可・監査は各処理の中で行う（ここでは何もしない）。
import eventChanges from './_event-changes.js';
import eventGuides from './_event-guides.js';
import events from './_events.js';
import history from './_history.js';
import images from './_images.js';
import login from './_login.js';
import logout from './_logout.js';
import overrides from './_overrides.js';
import pastEvents from './_past-events.js';
import presence from './_presence.js';
import viewStats from './_view-stats.js';

export const HANDLERS = {
  'event-changes': eventChanges,
  'event-guides': eventGuides,
  events,
  history,
  images,
  login,
  logout,
  overrides,
  'past-events': pastEvents,
  presence,
  'view-stats': viewStats,
};

export default async function handler(req, res) {
  const { action, ...query } = req.query || {};
  const fn = Object.prototype.hasOwnProperty.call(HANDLERS, action) ? HANDLERS[action] : null;
  if (!fn) {
    res.setHeader('Cache-Control', 'no-store, private');
    return res.status(404).json({ error: 'Not found' });
  }
  // 各処理は従来どおり自分のクエリだけを見る（振り分け用の action は渡さない）
  // （Vercel の req.query は遅延評価のプロパティのため、代入ではなく定義し直す）
  try { Object.defineProperty(req, 'query', { value: query, writable: true, configurable: true, enumerable: true }); }
  catch { /* 定義し直せない環境では action が残るだけ（各処理は未知のキーを無視する） */ }
  return fn(req, res);
}
