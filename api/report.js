// POST /api/report  - バグ・不具合報告を ntfy へ中継する。
//
// 目的: ntfy のトピック名をフロントエンド（バンドル・公開リポジトリ）に出さない。
// トピックはサーバー環境変数 NTFY_BUG_TOPIC でのみ扱い、ブラウザからは
// このエンドポイントに投げるだけにする。
//
import { checkOrigin, rateLimit } from './_security.js';

// 通知先トピックは必ずサーバー環境変数 NTFY_BUG_TOPIC のみで扱う。
// 固定のフォールバックトピックは持たない（公開リポジトリ・バンドルに出さない）。
// 未設定時は安全側に倒して 503 で失敗する（旧トピックへ漏らさない）。

// 除去対象の文字かを「コードポイント」で判定する（ソースに生の制御文字を置かない）。
// タブ(9)・改行(10)は残す。表示崩れ・通知破損・なりすましの原因になるものを除く:
//  - C0 制御 0-8, 11-31 / DEL+C1 127-159
//  - ゼロ幅 200B-200D / 双方向制御 202A-202E, 2066-2069 / BOM FEFF
function isRemovableCode(c) {
  if (c === 9 || c === 10) return false;           // tab / LF は残す
  if (c <= 31) return true;                         // その他のC0制御
  if (c >= 0x7f && c <= 0x9f) return true;          // DEL + C1
  if (c >= 0x200b && c <= 0x200d) return true;      // ゼロ幅スペース等
  if (c >= 0x202a && c <= 0x202e) return true;      // 双方向上書き
  if (c >= 0x2066 && c <= 0x2069) return true;      // 双方向分離
  if (c === 0xfeff) return true;                    // BOM / ゼロ幅NBSP
  return false;
}

function stripUnsafe(str) {
  let out = '';
  for (const ch of str) {
    if (!isRemovableCode(ch.codePointAt(0))) out += ch;
  }
  return out;
}

/**
 * ntfy へ渡すテキストを安全化する（サーバー側が本当の防御点）。
 * - 制御文字・双方向/ゼロ幅文字を除去（日本語など通常の文字は保持）
 * - タイトルは改行を空白化（ntfy のタイトルは1行）
 * - 本文は CRLF を LF に正規化し、3行以上の連続改行を2行に圧縮（改行爆弾対策）
 * - 文字数上限でカット
 */
function sanitizeText(input, { maxLen, allowNewlines }) {
  let t = stripUnsafe(String(input ?? ''));
  if (allowNewlines) {
    t = t.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n');
    t = t.replace(/[ \t]{4,}/g, '   '); // 過剰な水平スペースも圧縮
  } else {
    t = t.replace(/[\r\n\t]+/g, ' ');
  }
  t = t.trim();
  if (t.length > maxLen) t = t.slice(0, maxLen) + '…';
  return t;
}

export default async function handler(req, res) {
  if (!checkOrigin(req, res)) return;
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // 連投・スパム抑止: 1 IP あたり 10分で 5 件まで（人の報告には十分）。
  // 本文チェックより前に数えることで、空連投での総当たりも抑止する。
  if (!await rateLimit(req, res, 'report', 5, 600)) return;

  const body = req.body ?? {};
  // サニタイズ（タイトル: 1行・120字 / 本文: 複数行・4000字）
  const message = sanitizeText(body.message, { maxLen: 4000, allowNewlines: true });
  const title   = sanitizeText(body.title,   { maxLen: 120,  allowNewlines: false }) || 'バグ報告';
  if (!message) {
    return res.status(400).json({ error: 'message is required' });
  }
  // 優先度は 1〜5 に丸める
  const priority = Math.min(5, Math.max(1, Number.isInteger(body.priority) ? body.priority : 3));

  const topic = process.env.NTFY_BUG_TOPIC;
  if (!topic) {
    console.error('[report] NTFY_BUG_TOPIC 未設定のため受け付けません');
    return res.status(503).json({ error: 'report endpoint not configured' });
  }

  try {
    const r = await fetch('https://ntfy.sh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, title, message, tags: ['beetle'], priority }),
    });
    if (!r.ok) throw new Error(`ntfy ${r.status}`);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[report] ntfy forward error', err);
    return res.status(502).json({ error: 'Failed to forward report' });
  }
}
