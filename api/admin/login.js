// POST /api/admin/login  – アカウント検証 → サーバー側セッション発行（HttpOnly Cookie）。
//   成功: Set-Cookie(jsdf_admin_session) ＋ {ok, account, pref, label}
//   失敗: 401（監査ログに失敗を記録）
// パスワードは平文/scrypt 両対応（移行期）。後方互換: x-admin-secret も受理。
import { checkOrigin, noStore, requireSameOrigin, rateLimit, verifyCredentials, startSession, writeAudit } from '../_security.js';
import authz from '../../shared/authz.cjs';

export default async function handler(req, res) {
  noStore(res); // 管理APIはキャッシュ禁止（成功/エラー問わず）
  if (!checkOrigin(req, res)) return;
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-user, x-admin-pass, x-admin-secret');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!await requireSameOrigin(req, res)) return; // CSRF: 状態変更は同一オリジンのみ
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!await rateLimit(req, res, 'admin-login', 10, 600)) return; // 10回/10分/IP
  if (!process.env.ADMIN_ACCOUNTS_B64 && !process.env.ADMIN_SECRET) return res.status(503).json({ error: 'admin not configured' });

  const user = req.headers['x-admin-user'] || req.body?.user;
  const pass = req.headers['x-admin-pass'] || req.body?.pass || req.headers['x-admin-secret'] || req.body?.secret;
  const account = verifyCredentials(user, pass);
  if (!account) {
    await writeAudit(null, { action: 'auth.login', result: 'failure', note: `user=${String(user || '').slice(0, 40)}` });
    return res.status(401).json({ error: 'Unauthorized' });
  }

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
