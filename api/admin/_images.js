// /api/admin/images  – イベント別の画像（チラシ・会場写真など）を運営が登録・管理する。
//   GET ?eventId=…                 → 登録済み画像の一覧（説明・出典・確認状態）と、イベント単位の非表示設定
//   GET ?eventId=…&imageId=…&raw=1 → 画像そのもの（運営画面のプレビュー用。ログイン必須）
//   POST   { eventId, data, alt, credit, edited, rightsConfirmed, public }  → 追加（data は data URL）
//   PATCH  { eventId, imageId, alt?, credit?, edited?, rightsConfirmed?, public?, move?: -1|1 } → 説明等の修正・並べ替え
//   PATCH  { eventId, imagesHidden: true|false } → このイベントの画像をまとめて隠す
//   DELETE { eventId, imageId }    → 削除（画像データも消す）
//
// ⚠️ 公開画面は当面すべて「（現在準備中）」のみ（shared/eventImages.cjs の EVENT_IMAGES_ENABLED=false）。
//    ここで登録した画像は運営画面でだけ見える。公開APIは images を返さない。
// 保存先: 画像データは Redis の img:<id>（base64）、一覧はイベント本体（手動）／上書き（自動収集）の images。
// 権限: requireAuth → 手動 event:update / 自動収集 event:override → canManageScope（所属はサーバー側で解決）→ writeAudit
import crypto from 'node:crypto';
import { checkOrigin, noStore, requireSameOrigin, rateLimit, requireAuth, hasPermission, canManageScope, redis, writeAudit } from '../_security.js';
import { findEvent, MANUAL_KEY, OVERRIDE_KEY, EVENT_ID_RE } from '../_eventScope.js';
import I from '../../shared/eventImages.cjs';
import { withLog } from '../../shared/editLog.cjs';

const parse = (raw) => (typeof raw === 'string' ? JSON.parse(raw) : raw);
export const IMAGE_KEY = (id) => `img:${id}`;
const newImageId = () => `img-${crypto.randomBytes(9).toString('base64url').toLowerCase().replace(/[^a-z0-9]/g, '0').slice(0, 12)}`;

export default async function handler(req, res) {
  noStore(res);
  if (!checkOrigin(req, res)) return;
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
  if (!await requireSameOrigin(req, res)) return;
  if (!await rateLimit(req, res, 'admin-images', req.method === 'GET' ? 300 : 60, 600)) return;
  const account = await requireAuth(req, res);
  if (!account) return;

  const src = req.method === 'GET' ? (req.query || {}) : (req.body || {});
  const eventId = String(src.eventId || '').trim();
  if (!eventId || !EVENT_ID_RE.test(eventId)) return res.status(400).json({ error: 'eventId is required' });
  const found = await findEvent(req, eventId);
  if (!found || !found.pref) return res.status(404).json({ error: '対象イベントが見つかりません' });
  const perm = found.kind === 'manual' ? 'event:update' : 'event:override';
  const deny = async (status, error, note) => {
    if (req.method !== 'GET') await writeAudit(account, { action: 'event.image', result: 'denied', targetId: eventId, organization: found.pref, office: found.office, note });
    return res.status(status).json({ error });
  };
  if (!hasPermission(account, perm)) return deny(403, '権限がありません', '権限不足');
  if (!canManageScope(account, { pref: found.pref, office: found.office })) return deny(403, '担当範囲のイベントのみ操作できます', '担当外イベント');

  try {
    const key = found.kind === 'manual' ? MANUAL_KEY : OVERRIDE_KEY;
    const record = (found.kind === 'manual' ? found.event : parse(await redis.hget(OVERRIDE_KEY, eventId))) || {};
    const images = I.sanitizeStoredImages(record.images);
    const save = async (nextImages, extra, logNote) => {
      const now = new Date().toISOString();
      let next = { ...record, ...extra, images: nextImages };
      if (!nextImages.length) delete next.images;
      if (found.kind === 'manual') { next.updatedAt = now; next.updatedBy = account.displayId; }
      else Object.assign(next, { _pref: found.pref, _office: found.office, _by: account.displayId, _at: now });
      next = withLog(next, { by: account.displayId, action: 'image', note: logNote });
      await redis.hset(key, { [eventId]: JSON.stringify(next) });
      return next;
    };
    const audit = (note, extra = {}) => writeAudit(account, { action: 'event.image', result: 'success', targetId: eventId, organization: found.pref, office: found.office, title: found.event.title || '', note, ...extra });

    if (req.method === 'GET') {
      if (src.raw) {
        const im = images.find(x => x.id === String(src.imageId || ''));
        if (!im) return res.status(404).json({ error: '画像が見つかりません' });
        const data = await redis.get(IMAGE_KEY(im.id));
        if (!data) return res.status(404).json({ error: '画像データが見つかりません' });
        res.setHeader('Content-Type', im.mime);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'");
        return res.status(200).end(Buffer.from(String(data), 'base64'));
      }
      return res.status(200).json({
        eventId, kind: found.kind, title: found.event.title || '', images, imagesHidden: record.imagesHidden === true,
        publicDisplay: I.EVENT_IMAGES_ENABLED, maxImages: I.MAX_IMAGES, maxBytes: I.MAX_IMAGE_BYTES,
      });
    }

    if (req.method === 'POST') {
      if (images.length >= I.MAX_IMAGES) return res.status(400).json({ error: `画像は1イベント${I.MAX_IMAGES}枚までです` });
      const parsed = I.parseImageDataUrl(src.data);
      if (parsed.error) return res.status(400).json({ error: parsed.error });
      const meta = I.normalizeImageMeta(src);
      const im = {
        id: newImageId(), ...meta, mime: parsed.mime, size: parsed.buf.length,
        width: Number.isFinite(src.width) ? Math.round(src.width) : null, height: Number.isFinite(src.height) ? Math.round(src.height) : null,
        by: account.displayId, at: new Date().toISOString(),
      };
      await redis.set(IMAGE_KEY(im.id), parsed.buf.toString('base64'));
      await save([...images, im], {}, '画像を追加');
      await audit(`画像を追加（${Math.round(im.size / 1024)}KB・権利確認${meta.rightsConfirmed ? '済' : '未'}・公開${meta.public ? '可' : '不可'}）`, { after: { id: im.id, ...meta } });
      return res.status(200).json({ ok: true, image: im });
    }

    if (req.method === 'PATCH') {
      if (src.imagesHidden !== undefined && src.imageId === undefined) {
        await save(images, { imagesHidden: src.imagesHidden === true }, src.imagesHidden === true ? '画像を非表示に' : '画像の非表示を解除');
        await audit(src.imagesHidden === true ? 'このイベントの画像を非表示に設定' : '画像の非表示を解除');
        return res.status(200).json({ ok: true });
      }
      const i = images.findIndex(x => x.id === String(src.imageId || ''));
      if (i < 0) return res.status(404).json({ error: '画像が見つかりません' });
      const next = [...images];
      const beforeMeta = I.normalizeImageMeta(next[i]);
      next[i] = { ...next[i], ...I.normalizeImageMeta({ ...next[i], ...src }) };
      const mv = Number(src.move);
      if (mv === -1 || mv === 1) {
        const j = i + mv;
        if (j >= 0 && j < next.length) [next[i], next[j]] = [next[j], next[i]];
      }
      await save(next, {}, mv ? '画像の並べ替え' : '画像の説明・出典を修正');
      await audit(mv ? '画像の並べ替え' : '画像の説明・出典・確認状態を修正', { before: beforeMeta, after: I.normalizeImageMeta(next[mv ? (i + mv >= 0 && i + mv < next.length ? i + mv : i) : i]) });
      return res.status(200).json({ ok: true });
    }

    // DELETE
    const im = images.find(x => x.id === String(src.imageId || ''));
    if (!im) return res.status(404).json({ error: '画像が見つかりません' });
    await save(images.filter(x => x.id !== im.id), {}, '画像を削除');
    await redis.del(IMAGE_KEY(im.id));
    await audit('画像を削除', { before: { id: im.id, ...I.normalizeImageMeta(im) } });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[admin/images]', err);
    return res.status(500).json({ error: 'failed' });
  }
}
