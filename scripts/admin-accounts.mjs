#!/usr/bin/env node
// 運営アカウント（ユーザー名・パスワード）の作成・変更・停止を手元で行う補助ツール。
// 手順書: docs/ADMIN_ACCOUNT_SETUP.md
//
// ⚠️ アカウントのファイル（既定 admin-accounts.local.json）と、パスワード一覧（admin-passwords.local.csv）は
//    秘密情報。.gitignore 済み。リポジトリ・チャット・メールに置かないこと。
//    サーバーに渡すのは `encode` が出す ADMIN_ACCOUNTS_B64（パスワードはハッシュ化済み）だけ。
//
// 使い方（--file で別のファイルも指定できる）:
//   node scripts/admin-accounts.mjs init                 全50地本の地本管理者（pco_admin）を作る（パスワードは自動生成）
//   node scripts/admin-accounts.mjs add --user U --org tokyo [--office shibuya] [--role office_manager] [--display OP-SBY-01]
//   node scripts/admin-accounts.mjs passwd --user U       パスワードを作り直す（sessionVersion を +1 → 旧ログインは無効）
//   node scripts/admin-accounts.mjs disable --user U      停止（enable で再開）
//   node scripts/admin-accounts.mjs list                  一覧（パスワード・ハッシュは表示しない）
//   node scripts/admin-accounts.mjs check                 形式の検査（重複・役割・事務所の指定漏れ・平文の混入）
//   node scripts/admin-accounts.mjs encode                Vercel の ADMIN_ACCOUNTS_B64 に入れる値を出力
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { hashPassword } = require('../shared/session.cjs');
const { ALL_ROLES } = require('../shared/authz.cjs');

// 地本キーと名称（src/data/regionMap.js の PREFECTURE_INFO と同じ。テストで一致を検査）
export const PREFS = {
  sapporo: '札幌', asahikawa: '旭川', obihiro: '帯広', hakodate: '函館',
  aomori: '青森', iwate: '岩手', miyagi: '宮城', akita: '秋田', yamagata: '山形', fukushima: '福島',
  ibaraki: '茨城', tochigi: '栃木', gunma: '群馬', saitama: '埼玉', chiba: '千葉', tokyo: '東京', kanagawa: '神奈川',
  niigata: '新潟', toyama: '富山', ishikawa: '石川', fukui: '福井', yamanashi: '山梨', nagano: '長野',
  gifu: '岐阜', shizuoka: '静岡', aichi: '愛知', mie: '三重', shiga: '滋賀', kyoto: '京都', osaka: '大阪', hyogo: '兵庫',
  nara: '奈良', wakayama: '和歌山', tottori: '鳥取', shimane: '島根', okayama: '岡山', hiroshima: '広島', yamaguchi: '山口',
  tokushima: '徳島', kagawa: '香川', ehime: '愛媛', kochi: '高知', fukuoka: '福岡', saga: '佐賀', nagasaki: '長崎',
  kumamoto: '熊本', oita: '大分', miyazaki: '宮崎', kagoshima: '鹿児島', okinawa: '沖縄',
};
const OFFICE_ROLES = new Set(['office_editor', 'office_manager']);
const USER_RE = /^[a-z0-9][a-z0-9._-]{2,39}$/;

/** 読み間違えにくい文字だけで作るパスワード（20文字・約115ビット） */
export function generatePassword(len = 20) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const out = [];
  while (out.length < len) {
    const b = crypto.randomBytes(1)[0];
    if (b < chars.length * Math.floor(256 / chars.length)) out.push(chars[b % chars.length]);
  }
  return out.join('');
}

/** アカウント一覧の検査。問題があれば説明の配列を返す（空なら問題なし） */
export function checkAccounts(list) {
  const errs = [];
  if (!Array.isArray(list)) return ['アカウントは配列で書いてください'];
  const seen = new Set();
  list.forEach((a, i) => {
    const at = `${i + 1}件目（${a?.user || '?'}）`;
    if (!a || typeof a !== 'object') { errs.push(`${at}: 形式が不正`); return; }
    if (!USER_RE.test(String(a.user || ''))) errs.push(`${at}: ユーザー名は英小文字・数字・._- の3〜40文字`);
    if (seen.has(a.user)) errs.push(`${at}: ユーザー名が重複`);
    seen.add(a.user);
    if (!String(a.pass || '').startsWith('scrypt$')) errs.push(`${at}: pass が scrypt ハッシュではない（平文を書かない）`);
    const org = a.organization ?? a.pref;
    if (org !== '*' && !PREFS[org]) errs.push(`${at}: organization が不明（${org}）`);
    if (a.role && !ALL_ROLES.includes(a.role)) errs.push(`${at}: role が不明（${a.role}）`);
    if (OFFICE_ROLES.has(a.role) && !a.office) errs.push(`${at}: 事務所担当（${a.role}）は office が必須`);
    if (!a.displayId) errs.push(`${at}: displayId（画面に出す表示用ID）が無い`);
    if (/[一-龠ぁ-んァ-ヶ]{2,}/.test(String(a.displayId || '')) && !/^OP-/.test(a.displayId)) errs.push(`${at}: displayId に氏名を入れない`);
  });
  return errs;
}

export const toBase64 = (list) => Buffer.from(JSON.stringify(list)).toString('base64');

// ── CLI ───────────────────────────────────────────────────────────
function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  const o = { cmd };
  for (let i = 0; i < rest.length; i++) {
    if (rest[i].startsWith('--')) { const k = rest[i].slice(2); const v = rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[++i] : true; o[k] = v; }
  }
  return o;
}

function main() {
  const a = parseArgs(process.argv.slice(2));
  const file = a.file || 'admin-accounts.local.json';
  const pwFile = file.replace(/(\.local)?\.json$/, '') + '-passwords.local.csv';
  const load = () => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : []);
  const save = (list) => { fs.writeFileSync(file, JSON.stringify(list, null, 2) + '\n', { mode: 0o600 }); };
  const notePw = (rows) => {
    const head = fs.existsSync(pwFile) ? '' : 'ユーザー名,パスワード,担当,作成日時\n';
    fs.appendFileSync(pwFile, head + rows.map(r => r.join(',')).join('\n') + '\n', { mode: 0o600 });
  };
  const find = (list) => {
    const i = list.findIndex(x => x.user === a.user);
    if (i < 0) { console.error(`ユーザー ${a.user} が見つかりません`); process.exit(1); }
    return i;
  };
  const now = new Date().toISOString();

  switch (a.cmd) {
    case 'init': {
      const list = load();
      const have = new Set(list.map(x => x.user));
      const made = [];
      for (const [key, label] of Object.entries(PREFS)) {
        const user = `${key}-admin`;
        if (have.has(user)) continue;
        const pw = generatePassword();
        list.push({ user, pass: hashPassword(pw), organization: key, role: 'pco_admin', displayId: `OP-${key.toUpperCase()}-01`, enabled: true, sessionVersion: 1 });
        made.push([user, pw, `${label}地本`, now]);
      }
      save(list); if (made.length) notePw(made);
      console.log(`${made.length}件を作成しました（合計 ${list.length}件）→ ${file}`);
      console.log(`初期パスワードは ${pwFile} に保存しました。各地本へ安全な方法で渡し、渡し終えたらこのファイルを削除してください。`);
      break;
    }
    case 'add': {
      if (!a.user || !a.org) { console.error('--user と --org が必要です'); process.exit(1); }
      const list = load();
      if (list.some(x => x.user === a.user)) { console.error('同じユーザー名があります'); process.exit(1); }
      const role = a.role || (a.office ? 'office_manager' : 'pco_admin');
      const pw = generatePassword();
      const acc = { user: a.user, pass: hashPassword(pw), organization: a.org, ...(a.office ? { office: a.office } : {}), role, displayId: a.display || `OP-${String(a.org).toUpperCase()}-${String(list.length + 1).padStart(2, '0')}`, enabled: true, sessionVersion: 1 };
      const errs = checkAccounts([...list, acc]);
      if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
      list.push(acc); save(list); notePw([[a.user, pw, PREFS[a.org] ? `${PREFS[a.org]}地本` : a.org, now]]);
      console.log(`追加しました: ${a.user}（${role}）。初期パスワードは ${pwFile} に保存しました。`);
      break;
    }
    case 'passwd': {
      const list = load(); const i = find(list);
      const pw = a.password && a.password !== true ? String(a.password) : generatePassword();
      if (pw.length < 12) { console.error('パスワードは12文字以上にしてください'); process.exit(1); }
      list[i] = { ...list[i], pass: hashPassword(pw), sessionVersion: (Number(list[i].sessionVersion) || 1) + 1 };
      save(list); if (!a.password) notePw([[a.user, pw, '（再発行）', now]]);
      console.log(`${a.user} のパスワードを変更しました（sessionVersion=${list[i].sessionVersion}。旧ログインは無効になります）。${a.password ? '' : `新しいパスワードは ${pwFile} に保存しました。`}`);
      break;
    }
    case 'disable': case 'enable': {
      const list = load(); const i = find(list);
      list[i] = { ...list[i], enabled: a.cmd === 'enable', sessionVersion: (Number(list[i].sessionVersion) || 1) + (a.cmd === 'disable' ? 1 : 0) };
      save(list); console.log(`${a.user} を${a.cmd === 'enable' ? '有効' : '停止'}にしました`);
      break;
    }
    case 'list': {
      for (const x of load()) console.log([x.user, x.organization ?? x.pref, x.office || '-', x.role || '-', x.displayId, x.enabled === false ? '停止' : '有効', `v${x.sessionVersion || 1}`].join('\t'));
      break;
    }
    case 'check': {
      const errs = checkAccounts(load());
      console.log(errs.length ? errs.join('\n') : '問題ありません');
      process.exit(errs.length ? 1 : 0);
      break;
    }
    case 'encode': {
      const list = load(); const errs = checkAccounts(list);
      if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
      console.log(toBase64(list));
      break;
    }
    default:
      console.log('使い方: node scripts/admin-accounts.mjs <init|add|passwd|disable|enable|list|check|encode> [--file F] …（詳細はファイル冒頭・docs/ADMIN_ACCOUNT_SETUP.md）');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
