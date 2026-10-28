// Web Push の送信と「お気に入りイベントの見守り（watch）」の保存。
//
// 見守りの仕組み（2026-10 追加）:
//   お気に入りは端末内（localStorage）にしか無いため、サーバーは「どの端末がどのイベントを
//   気にしているか」を知らない。利用者が設定で「お気に入りの変更・中止を通知」をオンにした
//   ときだけ、端末が push の宛先（endpoint）とお気に入りのイベントID一覧を送る。
//     push:watch:<eventId>      … そのイベントを見守る endpoint の集合
//     push:watching:<sha256(endpoint)> … その endpoint が見守るイベントIDの集合（差し替え用）
//   氏名・位置・閲覧履歴は保存しない。購読解除・オフで消す。180日使われなければ失効。
import webpush from 'web-push';
import { createHash } from 'node:crypto';
import { redis, isValidPushEndpoint } from './_security.js';

export const SUBS_KEY = 'push:subscriptions';
export const WATCH_TTL_SEC = 180 * 86400;
export const MAX_WATCH_IDS = 100;
export const watchKey = (eventId) => `push:watch:${eventId}`;
export const watchingKey = (endpoint) => `push:watching:${createHash('sha256').update(String(endpoint)).digest('hex').slice(0, 40)}`;

const parse = (raw) => (typeof raw === 'string' ? JSON.parse(raw) : raw);

/**
 * 保存されている購読を、送信に使える形で返す（使えなければ null）。
 * 正規のプッシュサービスの endpoint と暗号鍵（p256dh・auth）がそろっているものだけを通す。
 * 購読先の検査（isValidPushEndpoint）を入れる前に保存された不正な値（endpoint が "test" など）が残っており、
 * 通知のたびに送信に失敗し続けていた（2026-06〜10。Vercel の実行時エラーで確認）。null の購読は送らずに削除する。
 */
export function usableSubscription(raw) {
  let sub;
  try { sub = parse(raw); } catch { return null; }
  if (!sub || typeof sub !== 'object' || !isValidPushEndpoint(sub.endpoint)) return null;
  const k = sub.keys || {};
  if (typeof k.p256dh !== 'string' || !k.p256dh || typeof k.auth !== 'string' || !k.auth) return null;
  return sub;
}

/** VAPID が設定されていれば webpush を構成して true */
export function configureVapid() {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_EMAIL } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_EMAIL) return false;
  webpush.setVapidDetails(`mailto:${VAPID_EMAIL}`, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  return true;
}

/**
 * endpoint の見守り一覧を差し替える（新しい一覧に無いイベントからは外す）。
 * @returns {Promise<{added:number, removed:number, total:number}>}
 */
export async function replaceWatchList(endpoint, eventIds) {
  const mine = watchingKey(endpoint);
  const prev = new Set(((await redis.smembers(mine)) || []).map(String));
  const next = new Set(eventIds.map(String));
  const removedIds = [...prev].filter(id => !next.has(id));
  const addedIds = [...next].filter(id => !prev.has(id));
  // 同時に発行して自動パイプライン（@upstash/redis 既定）で1往復にまとめる。
  // 1件ずつ await すると最大100件×2往復になり、関数の実行時間制限に当たる
  await Promise.all([
    ...removedIds.map(id => redis.srem(watchKey(id), endpoint)),
    ...addedIds.map(id => redis.sadd(watchKey(id), endpoint)),
    ...[...next].map(id => redis.expire(watchKey(id), WATCH_TTL_SEC)),
  ]);
  await redis.del(mine);
  if (next.size) {
    await redis.sadd(mine, ...next);
    await redis.expire(mine, WATCH_TTL_SEC);
  }
  return { added: addedIds.length, removed: removedIds.length, total: next.size };
}

/** endpoint の見守りをすべて外す（購読解除・設定オフ・宛先失効時） */
export async function clearWatchList(endpoint) {
  const mine = watchingKey(endpoint);
  const prev = ((await redis.smembers(mine)) || []).map(String);
  await Promise.all(prev.map(id => redis.srem(watchKey(id), endpoint)));
  await redis.del(mine);
  return prev.length;
}

/**
 * イベントを見守る端末へ通知を送る。
 * 失効した宛先（404/410）は購読・見守りの両方から外す。
 * @returns {Promise<{sent:number, failed:number, removed:number, watchers:number, configured:boolean}>}
 */
export async function sendToWatchers(eventId, payload) {
  const endpoints = ((await redis.smembers(watchKey(eventId))) || []).map(String);
  if (!endpoints.length) return { sent: 0, failed: 0, removed: 0, watchers: 0, configured: true };
  if (!configureVapid()) return { sent: 0, failed: 0, removed: 0, watchers: endpoints.length, configured: false };

  const subs = await redis.hmget(SUBS_KEY, ...endpoints);
  const list = Array.isArray(subs) ? subs : endpoints.map(e => (subs ? subs[e] : null));
  const body = JSON.stringify({ icon: '/icons/icon-192.png', ...payload });
  let sent = 0, failed = 0;
  const stale = [];
  await Promise.allSettled(endpoints.map(async (ep, i) => {
    const raw = list[i];
    const sub = raw ? usableSubscription(raw) : null;
    if (!sub) { stale.push(ep); return; }   // 購読が既に無い（解除済み）か、送信に使えない不正な値
    try {
      await webpush.sendNotification(sub, body, { TTL: 86400 });
      sent++;
    } catch (err) {
      if (err && (err.statusCode === 404 || err.statusCode === 410)) stale.push(ep);
      else failed++;
    }
  }));
  for (const ep of stale) {
    await redis.srem(watchKey(eventId), ep).catch(() => {});
    await redis.hdel(SUBS_KEY, ep).catch(() => {});
    await clearWatchList(ep).catch(() => {});
  }
  return { sent, failed, removed: stale.length, watchers: endpoints.length, configured: true };
}
