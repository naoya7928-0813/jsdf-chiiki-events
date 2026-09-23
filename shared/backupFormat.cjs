// 運営データのバックアップ形式（純粋）。作成・検証の両方をここに集約する。
//
// 方針（docs/design/P0-3-4_backup-restore.md）:
//   - 1ファイルの JSON。依存ライブラリを増やさず、どの環境でも中身を目視確認できる。
//   - 各セクションに件数と sha256（正規化 JSON に対して計算）を持たせ、破損・取り違えを検知する。
//   - 秘密項目（パスワード・ハッシュ・セッション・トークン・鍵・利用者の連絡先）は**許可リスト方式**で除外する
//     （残す項目を列挙する。新しい項目が増えても勝手に含まれない）。
//   - 監査ログは件数が多く、関数の応答サイズ上限（約4.5MB）を超え得るため、ページ単位で取得して
//     ブラウザ側で1ファイルに組み立てる。ページごとの sha256 を manifest に残す。
'use strict';

const crypto = require('node:crypto');
const { AUDIT_PAGE_SIZE, assembleBackup } = require('./backupAssemble.cjs');

const FORMAT = 'jsdf-chiiki-events-backup';
const FORMAT_VERSION = 1;
// 運営データのスキーマ版数。データ構造を変える移行のたびに上げ、復元・移行時の互換判定に使う。
const SCHEMA_VERSION = 1;

// アカウントで残す項目（パスワード・ハッシュ・MFA 秘密は含めない）
const ACCOUNT_FIELDS = ['userId', 'user', 'organization', 'office', 'role', 'displayId', 'label', 'enabled', 'sessionVersion', 'permissions'];

// どこに現れても秘密とみなすキー名（検証で全体を再帰的に検査する）
const SECRET_KEY_RE = /^(?:pass|password|passHash|passwordHash|hash|salt|token|secret|cookie|session|sessionToken|apiKey|api_key|privateKey|private_key|mfa|totpSecret|recoveryCodes|contact|contactMasked)$/i;

/** キー順に依存しない正規化 JSON（sha256 の計算用）。 */
function canonicalJson(v) {
  if (v === undefined) return 'null';
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(v).filter(k => v[k] !== undefined).sort()
    .map(k => `${JSON.stringify(k)}:${canonicalJson(v[k])}`).join(',')}}`;
}

function sha256(v) {
  return crypto.createHash('sha256').update(canonicalJson(v), 'utf8').digest('hex');
}

const countOf = (v) => (Array.isArray(v) ? v.length : (v && typeof v === 'object' ? Object.keys(v).length : 0));

/** アカウントから許可項目だけを取り出す。 */
function redactAccount(a) {
  const out = {};
  for (const k of ACCOUNT_FIELDS) if (a && a[k] !== undefined) out[k] = a[k];
  return out;
}

/** オブジェクト全体から秘密とみなすキーを探す（見つかったパスを返す）。 */
function findSecretKeys(v, path = '$', found = []) {
  if (!v || typeof v !== 'object') return found;
  if (Array.isArray(v)) { v.forEach((x, i) => findSecretKeys(x, `${path}[${i}]`, found)); return found; }
  for (const [k, x] of Object.entries(v)) {
    if (SECRET_KEY_RE.test(k)) found.push(`${path}.${k}`);
    findSecretKeys(x, `${path}.${k}`, found);
  }
  return found;
}

/**
 * バックアップ本体（監査ログ以外）を作る。
 * @param {object} src { manualEvents:[], overrides:{}, accounts:[], createdAt, createdBy, appVersion, gitCommit, sourceEnvironment }
 */
function buildCoreBackup(src) {
  const sections = {
    manualEvents: Array.isArray(src.manualEvents) ? src.manualEvents : [],
    overrides: (src.overrides && typeof src.overrides === 'object') ? src.overrides : {},
    accounts: (src.accounts || []).map(redactAccount),
  };
  const leaked = findSecretKeys(sections);
  if (leaked.length) throw new Error(`秘密項目がバックアップに含まれています: ${leaked.slice(0, 5).join(', ')}`);
  const manifest = {
    format: FORMAT,
    formatVersion: FORMAT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    appVersion: src.appVersion || '',
    createdAt: src.createdAt || new Date().toISOString(),
    createdBy: src.createdBy || '',
    sourceEnvironment: src.sourceEnvironment || '',
    source: { gitCommit: src.gitCommit || '' },
    // Git が正本のデータ（events.json・アーカイブ・拠点）は含めず、コミットで特定する
    external: { note: 'public/data/events.json・data/events-archive.json・public/data/offices.json は source.gitCommit の Git 上のものが正本' },
    sections: Object.fromEntries(Object.entries(sections).map(([k, v]) => [k, { count: countOf(v), sha256: sha256(v) }])),
  };
  manifest.sections.accounts.redacted = ['pass', 'passHash', 'mfa'];
  return { manifest, sections };
}

/** 監査ログの1ページ（古い順）。sha256 はページ内エントリに対して計算。 */
function buildAuditPage(entries, page, total) {
  const list = Array.isArray(entries) ? entries : [];
  return { page, pageSize: AUDIT_PAGE_SIZE, total, count: list.length, sha256: sha256(list), entries: list };
}

/**
 * バックアップファイルを検証する（件数・schemaVersion・checksum・createdAt・秘密項目）。
 * @returns {{ ok:boolean, errors:string[], counts:object, schemaVersion:number, createdAt:string }}
 */
function verifyBackup(bundle) {
  const errors = [];
  const m = bundle && bundle.manifest;
  const s = bundle && bundle.sections;
  if (!m || !s) return { ok: false, errors: ['manifest / sections がありません'], counts: {} };
  if (m.format !== FORMAT) errors.push(`形式が違います: ${m.format}`);
  if (m.formatVersion !== FORMAT_VERSION) errors.push(`formatVersion が未対応です: ${m.formatVersion}`);
  if (!Number.isInteger(m.schemaVersion)) errors.push('schemaVersion がありません');
  else if (m.schemaVersion > SCHEMA_VERSION) errors.push(`schemaVersion(${m.schemaVersion}) がこのアプリ(${SCHEMA_VERSION})より新しい`);
  if (!m.createdAt || Number.isNaN(Date.parse(m.createdAt))) errors.push('createdAt が不正です');
  const counts = {};
  for (const [name, meta] of Object.entries(m.sections || {})) {
    const v = s[name];
    counts[name] = countOf(v);
    if (v === undefined) { errors.push(`セクション ${name} がありません`); continue; }
    if (meta.count !== counts[name]) errors.push(`${name}: 件数が一致しません（manifest ${meta.count} / 実際 ${counts[name]}）`);
    if (name === 'audit') {
      let off = 0;
      for (const p of meta.pages || []) {
        const slice = v.slice(off, off + p.count);
        off += p.count;
        if (sha256(slice) !== p.sha256) errors.push(`audit: ページ ${p.page} の checksum が一致しません`);
      }
      if (off !== v.length) errors.push('audit: ページの件数合計が一致しません');
    } else if (sha256(v) !== meta.sha256) {
      errors.push(`${name}: checksum が一致しません`);
    }
  }
  const leaked = findSecretKeys(s);
  if (leaked.length) errors.push(`秘密項目が含まれています: ${leaked.slice(0, 5).join(', ')}`);
  return { ok: errors.length === 0, errors, counts, schemaVersion: m.schemaVersion, createdAt: m.createdAt };
}

module.exports = {
  FORMAT, FORMAT_VERSION, SCHEMA_VERSION, AUDIT_PAGE_SIZE, ACCOUNT_FIELDS,
  canonicalJson, sha256, redactAccount, findSecretKeys,
  buildCoreBackup, buildAuditPage, assembleBackup, verifyBackup,
};
