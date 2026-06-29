// 権限モデル（RBAC）— サーバー側でのみ権限を解決する純粋ロジック。
//
// 原則:
// - クライアントが送る個人番号やロール・pref を信用しない（authorization はここで判定）。
// - deny-by-default（許可が明示された操作のみ通す）。
// - アカウントは認証済みの設定（ADMIN_ACCOUNTS_B64）からサーバー側で解決する。
// - 氏名は通常画面に出さず displayId（仮名）で扱う。実利用者は内部対応表(accountId)でのみ追跡。
'use strict';

// ロール → 付与する権限（permissions を明示指定しないアカウントはロールから導出）
const ROLE_PERMISSIONS = {
  // 自分の事務所の下書き作成・編集のみ（公開・削除は不可）
  office_editor:   ['event:create', 'event:update'],
  // 自分の事務所の追加・編集・削除・公開・上書き
  office_manager:  ['event:create', 'event:update', 'event:delete', 'event:publish', 'event:override'],
  // 自分の地本全体を管理（＋監査閲覧）
  pco_admin:       ['event:create', 'event:update', 'event:delete', 'event:publish', 'event:override', 'audit:read', 'account:read'],
  // 全国を管理
  national_admin:  ['event:create', 'event:update', 'event:delete', 'event:publish', 'event:override', 'audit:read', 'account:read', 'account:manage', 'national:manage'],
  // 監査履歴の閲覧のみ
  auditor:         ['audit:read'],
  // システム設定の管理（原則イベント承認はしない）
  system_admin:    ['system:manage', 'audit:read'],
};

const ALL_ROLES = Object.keys(ROLE_PERMISSIONS);
// office_editor は下書きのみ＝公開状態へは変更できない（status 制御で使用）
const ROLE_CAN_PUBLISH = new Set(['office_manager', 'pco_admin', 'national_admin']);

/**
 * 設定 1 件（ADMIN_ACCOUNTS_B64 の要素）を内部アカウントへ正規化（純粋）。
 * 後方互換: role 未指定なら pref から導出（'*'→national_admin、それ以外→pco_admin）。
 * 入力 raw: { user, pass, pref|organization, office, role, displayId, permissions, enabled, label }
 */
function normalizeAccount(raw) {
  if (!raw || !raw.user || !raw.pass) return null;
  const organization = String(raw.organization || raw.pref || '*');
  let role = raw.role && ALL_ROLES.includes(raw.role) ? raw.role : null;
  if (!role) role = organization === '*' ? 'national_admin' : 'pco_admin';
  const permissions = Array.isArray(raw.permissions) && raw.permissions.length
    ? raw.permissions.map(String)
    : null; // null = ロールから導出
  return {
    userId: String(raw.userId || raw.user),     // 内部の一意ID（監査対応表のキー）
    user: String(raw.user),                       // ログインID
    pass: String(raw.pass),                       // 平文 or scrypt$ ハッシュ（session.cjs で検証）
    organization,                                 // 地本（pref）。'*' は全国
    office: raw.office ? String(raw.office) : '', // 事務所（任意）
    role,
    displayId: String(raw.displayId || raw.user), // 通常画面に出す仮名ID
    permissions,
    enabled: raw.enabled !== false,               // 既定 true。false で無効化
    // セッション版番号。パスワード変更/権限変更時に増やすと既存セッションを即失効できる。
    // 未指定（既存アカウント）は 1 として扱う。
    sessionVersion: Number.isFinite(Number(raw.sessionVersion)) ? Number(raw.sessionVersion) : 1,
    label: String(raw.label || raw.displayId || raw.user),
    // 後方互換: 既存コードは account.pref を参照する
    pref: organization,
  };
}

/** アカウントが持つ権限集合（明示 permissions 優先、無ければロール由来）。 */
function permissionsFor(account) {
  if (!account) return new Set();
  if (Array.isArray(account.permissions) && account.permissions.length) return new Set(account.permissions);
  return new Set(ROLE_PERMISSIONS[account.role] || []);
}

/** 指定権限を持つか（無効アカウントは常に false）。deny-by-default。 */
function hasPermission(account, perm) {
  if (!account || account.enabled === false) return false;
  return permissionsFor(account).has(perm);
}

/** 全国管理スコープか。 */
function isNational(account) {
  return !!account && account.enabled !== false &&
    (account.role === 'national_admin' || account.organization === '*');
}

/**
 * 対象（{ pref, office }）を操作できるスコープか（純粋・deny-by-default）。
 * - national_admin（または organization '*'）: 全国どこでも可
 * - pco_admin: 自分の地本（organization）全体（office 不問）
 * - office_editor / office_manager: **deny-by-default**。account.office と target.office が
 *   どちらも存在し、完全一致したときのみ許可（どちらか欠落なら拒否）。
 *   → office を持たないイベント（多くのスクレイプイベント・移行前の手動イベント）は
 *     office ロールには操作させず、pco_admin 以上が office を割り当てて運用する。
 */
function canManageScope(account, target) {
  if (!account || account.enabled === false) return false;
  if (isNational(account)) return true;
  if (!target || !target.pref) return false;
  if (account.organization !== target.pref) return false;
  const officeScoped = account.role === 'office_editor' || account.role === 'office_manager';
  if (officeScoped) {
    // 双方の office が存在し完全一致のときのみ許可（欠落は拒否）
    if (!account.office || !target.office) return false;
    if (account.office !== target.office) return false;
  }
  return true;
}

/** 公開状態（published）へ遷移できるロールか。 */
function canPublish(account) {
  return !!account && account.enabled !== false &&
    (hasPermission(account, 'event:publish') || ROLE_CAN_PUBLISH.has(account.role));
}

module.exports = {
  ROLE_PERMISSIONS, ALL_ROLES, ROLE_CAN_PUBLISH,
  normalizeAccount, permissionsFor, hasPermission, isNational, canManageScope, canPublish,
};
