// POST /api/report  – バグ・不具合報告を ntfy へ中継する。
//
// 目的: ntfy のトピック名をフロントエンド（バンドル・公開リポジトリ）に出さない。
// トピックはサーバー環境変数 NTFY_BUG_TOPIC でのみ扱い、ブラウザからは
// このエンドポイントに投げるだけにする。
//
// ※ 本文サニタイズは別途（次の改善項目）で追加する。
import { checkOrigin, rateLimit } from './_security.js';

// 既定トピックは「すでに公開済み」の旧トピック（フォールバック）。
// 完全にローテーションするには Vercel 環境変数 NTFY_BUG_TOPIC に
// 新しい値を設定すること（その値はコミットされず露出しない）。
const DEFAULT_TOPIC = 'jsdf-chiiki-events-bug-7928';

export default async function handler(req, res) {
  if (!checkOrigin(req, res)) return;
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // 連投・スパム抑止: 1 IP あたり 10分で 5 件まで（人の報告には十分）。
  // 本文チェックより前に数えることで、空連投での総当たりも抑止する。
  if (!await rateLimit(req, res, 'report', 5, 600)) return;

  const { title, message, priority } = req.body ?? {};
  if (typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'message is required' });
  }

  const topic = process.env.NTFY_BUG_TOPIC || DEFAULT_TOPIC;

  try {
    const r = await fetch('https://ntfy.sh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic,
        title: (typeof title === 'string' && title) ? title : 'バグ報告',
        message,
        tags: ['beetle'],
        priority: Number.isInteger(priority) ? priority : 3,
      }),
    });
    if (!r.ok) throw new Error(`ntfy ${r.status}`);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[report] ntfy forward error', err);
    return res.status(502).json({ error: 'Failed to forward report' });
  }
}
