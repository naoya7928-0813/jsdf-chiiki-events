// /api/admin/system — システム管理系の操作（今後、診断・移行もここへ集約して関数数を増やさない）。
//
//   GET ?op=backup-core            … バックアップ本体（手動イベント・上書き・アカウント[秘密項目なし]）
//   GET ?op=backup-audit&page=N    … 監査ログの N ページ目（古い順。page 0 が最古）
//
// 認可: backup:export（national_admin / system_admin）＋ 直前のパスワード再入力（step-up）必須。
//       監査ログは audit:read も必要。応答は no-store。
// 形式・秘密項目の除外・checksum は shared/backupFormat.cjs に集約（画面側で1ファイルに組み立てる）。
// 監査ログは件数が多く関数の応答サイズ上限（約4.5MB）を超え得るため、ページ単位で返す。
import { createRequire } from 'node:module';
import { checkOrigin, noStore, rateLimit, requireAuth, hasPermission, requireStepUp, redis, loadAccounts, writeAudit } from '../_security.js';
import B from '../../shared/backupFormat.cjs';

const require = createRequire(import.meta.url);
let APP_VERSION = '';
try { APP_VERSION = require('../../package.json').version || ''; } catch { /* 取得できなくても続行 */ }

const MKEY = 'manual:events';
const OKEY = 'manual:overrides';
const AUDIT_KEY = 'manual:history';

const parse = (v) => (typeof v === 'string' ? JSON.parse(v) : v);

async function backupCore(req, res, account) {
  const [ev, ov] = await Promise.all([redis.hgetall(MKEY), redis.hgetall(OKEY)]);
  const manualEvents = ev ? Object.values(ev).map(parse) : [];
  const overrides = {};
  if (ov) for (const [id, v] of Object.entries(ov)) overrides[id] = parse(v);
  const core = B.buildCoreBackup({
    manualEvents, overrides,
    accounts: loadAccounts(),
    createdBy: account.displayId,
    appVersion: APP_VERSION,
    gitCommit: process.env.VERCEL_GIT_COMMIT_SHA || '',
    sourceEnvironment: process.env.VERCEL_ENV || 'development',
  });
  const auditTotal = Number(await redis.llen(AUDIT_KEY)) || 0;
  await writeAudit(account, {
    action: 'backup.export', result: 'success',
    note: `counts=${JSON.stringify(Object.fromEntries(Object.entries(core.manifest.sections).map(([k, v]) => [k, v.count])))} audit=${auditTotal}`,
  });
  return res.status(200).json({ ...core, audit: { total: auditTotal, pageSize: B.AUDIT_PAGE_SIZE, pages: Math.ceil(auditTotal / B.AUDIT_PAGE_SIZE) } });
}

async function backupAudit(req, res, account) {
  if (!hasPermission(account, 'audit:read')) {
    await writeAudit(account, { action: 'audit.export', result: 'denied', note: '権限不足' });
    return res.status(403).json({ error: '監査ログを出力する権限がありません' });
  }
  const page = Number.parseInt(req.query?.page, 10);
  if (!Number.isInteger(page) || page < 0 || page > 1000) return res.status(400).json({ error: 'page が不正です' });
  const total = Number(await redis.llen(AUDIT_KEY)) || 0;
  const N = B.AUDIT_PAGE_SIZE;
  // リストは新しい順（先頭へ追加）。末尾（最古）から数えると、取得中に追記されてもページがずれない
  const from = total - (page + 1) * N;
  const to = total - page * N - 1;
  let entries = [];
  if (to >= 0) {
    const raw = (await redis.lrange(AUDIT_KEY, Math.max(0, from), to)) || [];
    entries = raw.map(v => { try { return parse(v); } catch { return null; } }).filter(Boolean).reverse();
  }
  if (page === 0) await writeAudit(account, { action: 'audit.export', result: 'success', note: `total=${total}` });
  return res.status(200).json(B.buildAuditPage(entries, page, total));
}

export default async function handler(req, res) {
  noStore(res);
  if (!checkOrigin(req, res)) return;
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!await rateLimit(req, res, 'admin-system', 60, 600)) return;
  const account = await requireAuth(req, res);
  if (!account) return;

  const op = String(req.query?.op || '');
  if (op !== 'backup-core' && op !== 'backup-audit') return res.status(400).json({ error: 'op が不正です' });
  if (!hasPermission(account, 'backup:export')) {
    await writeAudit(account, { action: 'backup.export', result: 'denied', note: '権限不足' });
    return res.status(403).json({ error: 'バックアップを作成する権限がありません' });
  }
  if (!await requireStepUp(req, res, account, op === 'backup-core' ? 'backup.export' : 'audit.export')) return;

  try {
    return op === 'backup-core' ? await backupCore(req, res, account) : await backupAudit(req, res, account);
  } catch (err) {
    console.error('[admin/system]', op, err && err.message);
    return res.status(500).json({ error: 'バックアップの作成に失敗しました' });
  }
}
