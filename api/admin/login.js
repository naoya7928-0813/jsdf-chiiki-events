// POST /api/admin/login  – アカウント検証 → サーバー側セッション発行（HttpOnly Cookie）。
//   成功: Set-Cookie(jsdf_admin_session) ＋ {ok, account, pref, label}
//   失敗: 401（監査ログに失敗を記録）。連続失敗で一時ロック（下記）。
// パスワードは平文/scrypt 両対応（移行期）。後方互換: x-admin-secret も受理。
import { checkOrigin, noStore, requireSameOrigin, rateLimit, verifyCredentials, startSession, writeAudit, redis } from '../_security.js';
import authz from '../../shared/authz.cjs';

// ── アカウント単位のログインロック（安全保障要件） ────────────────
// 連続 ADMIN_LOGIN_MAX_FAILS 回失敗したアカウント名を ADMIN_LOGIN_LOCK_SEC 秒ロックする。
// 失敗のたびにロック期限を延長（スライディング）＝総当たり中は開かない。成功で解除。
// ※ アカウント名単位のため、第三者が特定アカウント名で連続失敗させると当該アカウントを
//   一時的にロックできる（ロックアウトDoS）。運用者数が限られ名簿管理されている前提で許容し、
//   ロック時間は短め（既定5分）。IPレート制限(10回/10分)と多層で運用する。
const LOCK_MAX_FAILS = Math.max(1, Number(process.env.ADMIN_LOGIN_MAX_FAILS || 3));   // 既定3回
const LOCK_SECONDS   = Math.max(30, Number(process.env.ADMIN_LOGIN_LOCK_SEC || 300)); // 既定5分
const LOCK_MIN       = Math.max(1, Math.ceil(LOCK_SECONDS / 60));
const failKey = (u) => `login:fail:${String(u || '').toLowerCase().slice(0, 64)}`;
const lockedMsg = `ログインに続けて失敗したため、約${LOCK_MIN}分間ロックされています。時間をおいて再度お試しください。`;

export default async function handler(req, res) {
  noStore(res); // 管理APIはキャッシュ禁止（成功/エラー問わず）
  if (!checkOrigin(req, res)) return;
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-user, x-admin-pass, x-admin-secret');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!await requireSameOrigin(req, res)) return; // CSRF: 状態変更は同一オリジンのみ
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!await rateLimit(req, res, 'admin-login', 10, 600)) return; // 10回/10分/IP（IP単位の粗い層）
  if (!process.env.ADMIN_ACCOUNTS_B64 && !process.env.ADMIN_SECRET) return res.status(503).json({ error: 'admin not configured' });

  const user = req.headers['x-admin-user'] || req.body?.user;
  const pass = req.headers['x-admin-pass'] || req.body?.pass || req.headers['x-admin-secret'] || req.body?.secret;
  const uname = String(user || '');
  const fkey = failKey(uname);

  // ① ロック確認（認証前に判定＝ロック中は資格情報を一切検証しない）
  let fails = 0;
  try { fails = Number(await redis.get(fkey)) || 0; } catch { /* Redis障害時はロックを課さない（可用性優先） */ }
  if (fails >= LOCK_MAX_FAILS) {
    await writeAudit(null, { action: 'auth.login', result: 'locked', note: `user=${uname.slice(0, 40)}` });
    res.setHeader('Retry-After', String(LOCK_SECONDS));
    return res.status(429).json({ error: 'locked', message: lockedMsg });
  }

  const account = verifyCredentials(uname, pass);
  if (!account) {
    // ② 失敗回数を加算し、ロック期限を延長（アカウント名単位）
    let n = fails + 1;
    try { n = await redis.incr(fkey); await redis.expire(fkey, LOCK_SECONDS); } catch { /* noop */ }
    await writeAudit(null, { action: 'auth.login', result: 'failure', note: `user=${uname.slice(0, 40)} fails=${n}` });
    if (n >= LOCK_MAX_FAILS) {
      res.setHeader('Retry-After', String(LOCK_SECONDS));
      return res.status(429).json({ error: 'locked', message: lockedMsg });
    }
    const remaining = LOCK_MAX_FAILS - n;
    return res.status(401).json({ error: 'Unauthorized', message: `ユーザー名またはパスワードが違います。あと${remaining}回間違えるとロックされます。` });
  }

  // ③ 成功: 失敗カウンタを解除
  try { await redis.del(fkey); } catch { /* noop */ }

  const ok = await startSession(res, account);
  if (!ok) return res.status(503).json({ error: 'session unavailable' });
  await writeAudit(account, { action: 'auth.login', result: 'success' });

  // 通常画面に出すのは仮名(displayId)・権限のみ。氏名は返さない。
  return res.status(200).json({
    ok: true,
    account: {
      displayId: account.displayId,
      organization: account.organization,
      office: account.office,
      role: account.role,
      label: account.label,
      permissions: [...authz.permissionsFor(account)],
    },
    // 後方互換（既存クライアントが参照）
    pref: account.organization,
    label: account.label,
  });
}
