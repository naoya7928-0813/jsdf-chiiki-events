// POST /api/admin/login  – アカウント検証 → サーバー側セッション発行（HttpOnly Cookie）。
//   成功: Set-Cookie(jsdf_admin_session) ＋ {ok, account, pref, label}
//   失敗: 401（監査ログに失敗を記録）。連続失敗で一時ロック（下記）。
// パスワードは平文/scrypt 両対応（移行期）。後方互換: x-admin-secret も受理。
import { checkOrigin, noStore, requireSameOrigin, rateLimit, verifyCredentials, startSession, writeAudit, redis, requireAuth, markStepUp } from '../_security.js';
import authz from '../../shared/authz.cjs';
import S from '../../shared/session.cjs';
import { STEP_UP_TTL_SEC } from '../../shared/stepUp.cjs';

// ── アカウント単位のログインロック（安全保障要件・指数バックオフでエスカレート） ──
// 連続 ADMIN_LOGIN_MAX_FAILS 回失敗するとアカウント名をロックする。ロックは繰り返すほど
// 継続時間が伸びる（level ごとに session.cjs の lockDurationForLevel で算出）:
//   1回目=ADMIN_LOGIN_LOCK_SEC（既定5分）→ 2回目=10分 → 3回目=20分 → … ADMIN_LOGIN_LOCK_MAX_SEC(既定60分)で頭打ち。
// エスカレーション記憶(level)は ADMIN_LOGIN_LEVEL_TTL（既定24h）無操作で自然リセット。ログイン成功で全解除。
// ※ アカウント名単位のため特定名を連続失敗させる一時ロックDoSは残るが、運用者数が限られ名簿管理
//   されている前提で許容。IPレート制限(10回/10分)と多層で運用する。
const LOCK_MAX_FAILS  = Math.max(1, Number(process.env.ADMIN_LOGIN_MAX_FAILS || 3));     // 既定3回
const LOCK_BASE_SEC   = Math.max(30, Number(process.env.ADMIN_LOGIN_LOCK_SEC || 300));   // 既定5分（level1）
const LOCK_MAX_SEC    = Math.max(LOCK_BASE_SEC, Number(process.env.ADMIN_LOGIN_LOCK_MAX_SEC || 3600)); // 頭打ち（既定60分）
const LOCK_FACTOR     = Math.max(1, Number(process.env.ADMIN_LOGIN_LOCK_FACTOR || 2));   // 逓増率（既定2倍）
const LEVEL_TTL_SEC   = Math.max(60, Number(process.env.ADMIN_LOGIN_LEVEL_TTL || 86400)); // level記憶の寿命（既定24h）
const ATTEMPT_WIN_SEC = LOCK_BASE_SEC;                                                    // 失敗回数の集計窓
const failKey  = (u) => `login:fail:${String(u || '').toLowerCase().slice(0, 64)}`;
const lockKey  = (u) => `login:lock:${String(u || '').toLowerCase().slice(0, 64)}`;
const levelKey = (u) => `login:locklevel:${String(u || '').toLowerCase().slice(0, 64)}`;
const lockedMsg = (sec) => `ログインに続けて失敗したため、約${Math.max(1, Math.ceil(sec / 60))}分間ロックされています。時間をおいて再度お試しください。`;

/**
 * 認証失敗を記録する（ログイン・再認証で共通）。規定回数に達したらアカウントをロックする。
 * ② 失敗回数を加算（ATTEMPT_WIN_SEC の窓でスライド集計）
 * ③ 規定回数到達 → ロック発動。level を +1 して継続時間を逓増（5→10→20→…→cap）。
 *    ロックキーを duration の TTL でセットし、失敗カウンタは解除（解錠後は再び LOCK_MAX_FAILS 回から）
 * @returns {{ locked:boolean, lockSec?:number, remaining?:number }}
 */
async function registerFailure(uname, actor, action) {
  let n = 1;
  try { n = await redis.incr(failKey(uname)); await redis.expire(failKey(uname), ATTEMPT_WIN_SEC); } catch { /* noop */ }
  await writeAudit(actor, { action, result: 'failure', note: `user=${uname.slice(0, 40)} fails=${n}` });
  if (n < LOCK_MAX_FAILS) return { locked: false, remaining: LOCK_MAX_FAILS - n };
  let level = 1;
  try { level = await redis.incr(levelKey(uname)); await redis.expire(levelKey(uname), LEVEL_TTL_SEC); } catch { /* noop */ }
  const lockSec = S.lockDurationForLevel(level, { baseSec: LOCK_BASE_SEC, factor: LOCK_FACTOR, maxSec: LOCK_MAX_SEC });
  try { await redis.set(lockKey(uname), '1', { ex: lockSec }); await redis.del(failKey(uname)); } catch { /* noop */ }
  await writeAudit(actor, { action, result: 'locked', note: `user=${uname.slice(0, 40)} level=${level} lock=${lockSec}s` });
  return { locked: true, lockSec };
}

/**
 * 再認証（step-up）: ログイン中の本人がパスワードを再入力する。成功するとセッションに再認証時刻を記録し、
 * 一定時間（shared/stepUp.cjs の STEP_UP_TTL_SEC）だけ重要操作（バックアップ等）を実行できる。
 * 失敗はログインと同じ失敗回数・ロックに合算する（再認証を総当りの抜け道にしない）。
 */
async function stepUpLogin(req, res) {
  const account = await requireAuth(req, res);
  if (!account) return;
  const uname = account.user;
  let lockTtl = 0;
  try { lockTtl = Number(await redis.ttl(lockKey(uname))) || 0; } catch { /* noop */ }
  if (lockTtl > 0) {
    await writeAudit(account, { action: 'auth.stepup', result: 'locked', note: `ttl=${lockTtl}` });
    res.setHeader('Retry-After', String(lockTtl));
    return res.status(429).json({ error: 'locked', message: lockedMsg(lockTtl) });
  }
  const pass = req.body?.pass;
  const ok = verifyCredentials(uname, pass);
  if (!ok || ok.userId !== account.userId) {
    const f = await registerFailure(uname, account, 'auth.stepup');
    if (f.locked) {
      res.setHeader('Retry-After', String(f.lockSec));
      return res.status(429).json({ error: 'locked', message: lockedMsg(f.lockSec) });
    }
    return res.status(401).json({ error: 'step_up_failed', message: `パスワードが違います。あと${f.remaining}回間違えるとロックされます。` });
  }
  try { await redis.del(failKey(uname)); } catch { /* noop */ }
  if (!await markStepUp(req, account)) {
    // セッション Cookie で認証していない（旧ヘッダ認証など）と再認証を記録できない
    return res.status(401).json({ error: 'session_required', message: '再認証にはログインし直しが必要です' });
  }
  await writeAudit(account, { action: 'auth.stepup', result: 'success' });
  return res.status(200).json({ ok: true, ttlSec: STEP_UP_TTL_SEC });
}

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

  // 重要操作の再認証（step-up）。ログイン中の本人がパスワードを入れ直す（新しいセッションは発行しない）
  if (req.body?.op === 'step-up') return stepUpLogin(req, res);

  const user = req.headers['x-admin-user'] || req.body?.user;
  const pass = req.headers['x-admin-pass'] || req.body?.pass || req.headers['x-admin-secret'] || req.body?.secret;
  const uname = String(user || '');
  const fkey = failKey(uname);
  const lkey = lockKey(uname);
  const lvlkey = levelKey(uname);

  // ① ロック確認（認証前に判定＝ロック中は資格情報を一切検証しない）。残TTLをそのまま返す。
  let lockTtl = 0;
  try { lockTtl = Number(await redis.ttl(lkey)) || 0; } catch { /* Redis障害時はロックを課さない（可用性優先） */ }
  if (lockTtl > 0) {
    await writeAudit(null, { action: 'auth.login', result: 'locked', note: `user=${uname.slice(0, 40)} ttl=${lockTtl}` });
    res.setHeader('Retry-After', String(lockTtl));
    return res.status(429).json({ error: 'locked', message: lockedMsg(lockTtl) });
  }

  const account = verifyCredentials(uname, pass);
  if (!account) {
    const f = await registerFailure(uname, null, 'auth.login');
    if (f.locked) {
      res.setHeader('Retry-After', String(f.lockSec));
      return res.status(429).json({ error: 'locked', message: lockedMsg(f.lockSec) });
    }
    return res.status(401).json({ error: 'Unauthorized', message: `ユーザー名またはパスワードが違います。あと${f.remaining}回間違えるとロックされます。` });
  }

  // ④ 成功: 失敗カウンタ・ロック・エスカレーション記憶をすべて解除
  try { await redis.del(fkey); await redis.del(lkey); await redis.del(lvlkey); } catch { /* noop */ }

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
