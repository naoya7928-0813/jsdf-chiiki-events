// GET /api/admin/presence — 運営者の在席状況（誰がログイン中か）。
//   認可: account:read を持つロールのみ（pco_admin / national_admin）。deny-by-default。
//   スコープ: national は全アカウント、それ以外は自分の地本（organization）のみ。
//   返却: { now, onlineWindowSec, awayWindowSec, counts, members:[{displayId,label,role,office,state,agoSec,self}] }
//   ※ ログインID(user) や パスワード等の機微情報は返さない（displayId＝仮名で扱う）。
import { checkOrigin, noStore, requireAuth, hasPermission, loadAccounts, readLastSeenMap, SESSION_IDLE_SEC, rateLimit } from '../_security.js';
import authz from '../../shared/authz.cjs';
import presence from '../../shared/presence.cjs';

const ONLINE_SEC = presence.DEFAULT_ONLINE_SEC;

export default async function handler(req, res) {
  noStore(res);
  if (!checkOrigin(req, res)) return;
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // 認証前にレート制限をかける。ここだけ制限が無いと、資格情報を変えながら
  // 叩き続けられる的になってしまう（他の管理APIには入っている）。
  if (!await rateLimit(req, res, 'admin-presence', 120, 600)) return;

  const account = await requireAuth(req, res);
  if (!account) return;
  if (!hasPermission(account, 'account:read')) {
    return res.status(403).json({ error: '在席状況を閲覧する権限がありません' });
  }

  // スコープ: national は全員、地本管理者は自地本のみ。enabled のアカウントを対象。
  const national = authz.isNational(account);
  const members = loadAccounts().filter(a =>
    a.enabled !== false && (national || a.organization === account.organization));

  const lastSeenMap = await readLastSeenMap();
  const nowMs = Date.now();
  const awaySec = SESSION_IDLE_SEC;
  const { members: roster, counts } = presence.buildRoster(members, lastSeenMap, {
    nowMs, viewerUserId: account.userId, onlineSec: ONLINE_SEC, awaySec,
  });

  return res.status(200).json({
    now: new Date(nowMs).toISOString(),
    onlineWindowSec: ONLINE_SEC,
    awayWindowSec: awaySec,
    scope: national ? '*' : account.organization,
    counts,
    members: roster,
  });
}
