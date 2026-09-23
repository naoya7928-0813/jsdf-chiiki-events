// 重要操作の再認証（step-up）の判定（純粋）。
//
// ログイン済みの端末が放置・盗用されても、重要操作（バックアップ・アカウント変更・復元 等）は
// 直前にパスワードを入れ直した人しか実行できないようにする。
// パスワード再入力に成功した時刻を、サーバー側セッション（Redis）の stepUpAt に記録し、
// 一定時間（STEP_UP_TTL_SEC）内だけ有効とする。将来 MFA を入れる場合もこの判定を共通で使う。
'use strict';

const STEP_UP_TTL_SEC = Number(process.env.STEP_UP_TTL_SEC || 300); // 既定5分

// step-up が必要な操作（API 側はこの名前で requireStepUp を呼ぶ。監査ログの action にも使う）
const STEP_UP_OPS = Object.freeze([
  'backup.export',
  'audit.export',
  'backup.restore',
  'account.create', 'account.update', 'account.disable', 'account.enable',
  'account.password.reset', 'account.role.change',
  'event.delete', 'event.bulk',
]);

/**
 * @param {object} a
 *   stepUpAt  セッションに記録された再認証成功時刻(ms)。無ければ未実施
 *   now       現在時刻(ms)
 *   ttlSec    有効秒数（省略時 STEP_UP_TTL_SEC）
 * @returns {{ok:true, remainingSec:number} | {ok:false, reason:'step_up_required'|'step_up_expired'}}
 */
function stepUpDecision({ stepUpAt, now, ttlSec = STEP_UP_TTL_SEC }) {
  const at = Number(stepUpAt);
  if (!Number.isFinite(at) || at <= 0) return { ok: false, reason: 'step_up_required' };
  if (at > now + 60_000) return { ok: false, reason: 'step_up_required' }; // 未来時刻（改ざん・時計ずれ）は無効
  const age = (now - at) / 1000;
  if (age > ttlSec) return { ok: false, reason: 'step_up_expired' };
  return { ok: true, remainingSec: Math.max(0, Math.floor(ttlSec - age)) };
}

module.exports = { STEP_UP_TTL_SEC, STEP_UP_OPS, stepUpDecision };
