// 運営画面: イベントの画像（チラシ・会場写真など）の登録・管理。
// 公開画面は当面すべて「（現在準備中）」のみで、ここで登録した画像は運営画面でだけ見える。
// 画像はブラウザ側で縮小・JPEG 再圧縮してから送る（撮影位置などのメタデータも消える）。
import { useCallback, useEffect, useState } from 'react';

const MAX_EDGE = 1600;

/** 画像ファイルを縮小・再圧縮して data URL にする（上限バイト数に収まるまで品質を下げる）。 */
async function compressImage(file, maxBytes) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = url; });
    const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); // 透過PNGの背景を白に
    ctx.drawImage(img, 0, 0, w, h);
    for (const q of [0.85, 0.75, 0.65, 0.55, 0.45]) {
      const data = canvas.toDataURL('image/jpeg', q);
      if (Math.ceil((data.length - 23) * 3 / 4) <= maxBytes) return { data, width: w, height: h };
    }
    throw new Error('too_large');
  } finally { URL.revokeObjectURL(url); }
}

const EMPTY = { alt: '', credit: '', edited: false, rightsConfirmed: false, public: false };

export default function EventImagesPanel({ eventId, adminFetch, primary, styles = {} }) {
  const { input = {}, label = {}, hint = {} } = styles;
  const [data, setData] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [rev, setRev] = useState(0);
  const [fileKey, setFileKey] = useState(0); // 追加後にファイル選択欄を空に戻す

  const load = useCallback(async () => {
    try {
      const r = await adminFetch(`/api/admin/images?eventId=${encodeURIComponent(eventId)}`);
      const j = await r.json().catch(() => ({}));
      if (r.ok) setData(j); else setMsg({ type: 'err', text: j.error || '読み込めませんでした' });
    } catch { setMsg({ type: 'err', text: '通信に失敗しました' }); }
  }, [eventId, adminFetch]);
  useEffect(() => { load(); }, [load]);

  async function send(method, body, okText) {
    setBusy(true); setMsg(null);
    try {
      const r = await adminFetch('/api/admin/images', { method, body: JSON.stringify({ eventId, ...body }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg({ type: 'err', text: j.error || '保存できませんでした' }); return false; }
      if (okText) setMsg({ type: 'ok', text: okText });
      await load(); setRev(v => v + 1);
      return true;
    } catch { setMsg({ type: 'err', text: '通信に失敗しました' }); return false; }
    finally { setBusy(false); }
  }

  async function add() {
    if (!file) return setMsg({ type: 'err', text: '画像ファイルを選んでください' });
    if (!form.credit.trim()) return setMsg({ type: 'err', text: '出典（掲載元）を入力してください' });
    setBusy(true); setMsg(null);
    let c;
    try { c = await compressImage(file, data?.maxBytes || 600 * 1024); }
    catch { setBusy(false); return setMsg({ type: 'err', text: '画像を読み込めないか、大きすぎます' }); }
    setBusy(false);
    if (await send('POST', { ...form, ...c }, '画像を追加しました')) { setForm(EMPTY); setFile(null); setFileKey(k => k + 1); }
  }

  const chk = (key, text, f = form, onChange = (v) => setForm(p => ({ ...p, [key]: v }))) => (
    <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, color: 'var(--text)', marginBottom: 6 }}>
      <input type="checkbox" checked={!!f[key]} onChange={e => onChange(e.target.checked)} />{text}
    </label>
  );
  const small = (color) => ({ fontSize: 12, fontWeight: 700, padding: '6px 10px', borderRadius: 8, cursor: 'pointer', background: 'transparent', border: `1px solid ${color}`, color });

  if (!data) return <div style={{ fontSize: 12, color: msg ? '#ef4444' : 'var(--text-muted)', marginBottom: 12 }}>{msg?.text || '読み込み中…'}</div>;
  return (
    <div>
      <div style={{ padding: '10px 12px', borderRadius: 10, background: `${primary}10`, border: `1px solid ${primary}33`, fontSize: 12, lineHeight: 1.7, color: 'var(--text)', marginBottom: 10 }}>
        公開画面では現在、画像を表示していません（「（現在準備中）」と表示）。ここで登録した画像は運営画面でだけ見えます。<br />
        チラシ・写真にロゴ・キャラクター・人物が写っている場合は、権利者の許可を確認してから「権利確認済み」にしてください。
      </div>

      {data.images.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>登録された画像はありません。</div>}
      {data.images.map((im, i) => (
        <div key={im.id} style={{ display: 'flex', gap: 10, padding: 10, border: '1px solid var(--border)', borderRadius: 10, background: 'var(--card)', marginBottom: 8 }}>
          <img src={`/api/admin/images?eventId=${encodeURIComponent(eventId)}&imageId=${im.id}&raw=1&r=${rev}`} alt={im.alt || ''}
            style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 8, background: 'var(--tag-bg)', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <ImageMetaEditor im={im} input={input} chk={chk} busy={busy}
              onSave={(meta) => send('PATCH', { imageId: im.id, ...meta }, '保存しました')} />
            <div style={{ fontSize: 10.5, color: 'var(--text-muted)', margin: '4px 0 6px' }}>
              {im.width && im.height ? `${im.width}×${im.height}・` : ''}{im.size ? `${Math.round(im.size / 1024)}KB・` : ''}登録 {im.by || '—'}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button type="button" disabled={busy || i === 0} onClick={() => send('PATCH', { imageId: im.id, move: -1 })} style={small(primary)} aria-label="上へ">↑</button>
              <button type="button" disabled={busy || i === data.images.length - 1} onClick={() => send('PATCH', { imageId: im.id, move: 1 })} style={small(primary)} aria-label="下へ">↓</button>
              <button type="button" disabled={busy} onClick={() => { if (window.confirm('この画像を削除しますか？')) send('DELETE', { imageId: im.id }, '削除しました'); }} style={small('#ef4444')}>削除</button>
            </div>
          </div>
        </div>
      ))}

      {data.images.length < data.maxImages ? (
        <div style={{ padding: 10, border: `1px dashed ${primary}`, borderRadius: 10, marginBottom: 8 }}>
          <div style={label}>画像を追加（JPEG・PNG・WebP。自動で縮小します）</div>
          <input key={fileKey} type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setFile(e.target.files?.[0] || null)} style={{ ...input, padding: 8 }} />
          <input value={form.credit} maxLength={200} onChange={e => setForm(p => ({ ...p, credit: e.target.value }))} placeholder="出典（例: 自衛隊東京地方協力本部ホームページ（URL））*" style={input} />
          <input value={form.alt} maxLength={120} onChange={e => setForm(p => ({ ...p, alt: e.target.value }))} placeholder="画像の説明（読み上げ用。例: 会場の様子）" style={input} />
          {chk('edited', 'トリミング・加工した（「加工して作成」と表示）')}
          {chk('rightsConfirmed', '権利を確認済み（ロゴ・キャラクター・人物の許可を含む）')}
          {chk('public', '公開してよい（公開画面で画像を表示する設定にしたときに出る）')}
          <button type="button" disabled={busy} onClick={add}
            style={{ width: '100%', padding: 11, borderRadius: 10, border: 'none', fontSize: 13.5, fontWeight: 700, color: '#fff', background: busy ? 'var(--border)' : primary, cursor: busy ? 'default' : 'pointer' }}>
            {busy ? '処理中…' : '画像を追加'}
          </button>
        </div>
      ) : <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>画像は1イベント{data.maxImages}枚までです。</div>}

      {chk('imagesHidden', 'このイベントの画像は公開しない（まとめて非表示）', { imagesHidden: data.imagesHidden },
        (v) => send('PATCH', { imagesHidden: v }, v ? '非表示にしました' : '非表示を解除しました'))}
      {msg && <div style={{ padding: '8px 11px', borderRadius: 8, margin: '6px 0 10px', fontSize: 12, background: msg.type === 'ok' ? '#16a34a14' : '#ef444412', color: msg.type === 'ok' ? '#15803d' : '#ef4444' }}>{msg.text}</div>}
      <div style={hint}>出典は必須です。地本サイトの画像は「出典：自衛隊○○地方協力本部ホームページ（URL）」の形で記録してください。</div>
    </div>
  );
}

function ImageMetaEditor({ im, input, chk, busy, onSave }) {
  const [m, setM] = useState({ alt: im.alt, credit: im.credit, edited: im.edited, rightsConfirmed: im.rightsConfirmed, public: im.public });
  useEffect(() => { setM({ alt: im.alt, credit: im.credit, edited: im.edited, rightsConfirmed: im.rightsConfirmed, public: im.public }); }, [im]);
  const dirty = ['alt', 'credit', 'edited', 'rightsConfirmed', 'public'].some(k => m[k] !== im[k]);
  const set = (k) => (v) => setM(p => ({ ...p, [k]: v }));
  return (
    <>
      <input value={m.credit} maxLength={200} onChange={e => set('credit')(e.target.value)} placeholder="出典 *" aria-label="出典" style={{ ...input, marginBottom: 6 }} />
      <input value={m.alt} maxLength={120} onChange={e => set('alt')(e.target.value)} placeholder="画像の説明" aria-label="画像の説明" style={{ ...input, marginBottom: 6 }} />
      {chk('edited', '加工した', m, set('edited'))}
      {chk('rightsConfirmed', '権利を確認済み', m, set('rightsConfirmed'))}
      {chk('public', '公開してよい', m, set('public'))}
      {dirty && <button type="button" disabled={busy || !m.credit.trim()} onClick={() => onSave(m)}
        style={{ fontSize: 12, fontWeight: 700, padding: '6px 12px', borderRadius: 8, border: 'none', color: '#fff', background: '#16a34a', cursor: 'pointer', marginBottom: 4 }}>この画像の設定を保存</button>}
    </>
  );
}
