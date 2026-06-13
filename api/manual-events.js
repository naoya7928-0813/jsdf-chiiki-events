// GET /api/manual-events  – 運営が手動追加したイベントの一覧（公開）。
// フロントエンドが events.json とマージして全利用者に表示する。
// 認証不要（手動イベントは公開データ）。書き込みは /api/admin/events のみ。
import { redis } from './_security.js';

const KEY = 'manual:events';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  // events.json と同様に短時間キャッシュ（CDN/ブラウザ）
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');
  try {
    const all = await redis.hgetall(KEY);
    const events = (all
      ? Object.values(all).map(v => (typeof v === 'string' ? JSON.parse(v) : v))
      : [])
      // 下書きは公開しない。status 未設定（旧データ）は公開扱い。
      .filter(e => e && e.status !== 'draft')
      // 担当官名など裏側情報は公開しない（createdBy/updatedBy/タイムスタンプを除去）
      .map(({ createdBy, updatedBy, createdAt, updatedAt, status, ...pub }) => pub);
    return res.status(200).json({ events });
  } catch (err) {
    console.error('[manual-events] redis error', err);
    return res.status(200).json({ events: [] }); // 取得失敗時は空（本体表示を妨げない）
  }
}
