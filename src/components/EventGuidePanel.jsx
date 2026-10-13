// 運営画面: よくある質問（FAQ）と参加準備ガイドの入力欄。
//   EventGuideEditor … 入力欄だけ（値は親が持つ）。新規登録フォームではイベントと一緒に送る
//   EventGuidePanel  … 既存イベントの編集用。読み込み・保存（/api/admin/event-guides）まで行う
import { useState, useEffect, useCallback } from 'react';
import { GUIDE_ITEMS, GUIDE_STATES, LIMITS } from '../../shared/eventGuide.cjs';

export const EMPTY_GUIDE_VALUE = { faq: [], guide: {} };

const STATE_COLOR = { unknown: '#888', na: '#64748b', confirmed: '#16a34a' };

export function EventGuideEditor({ value, onChange, styles, primary }) {
  const { input, label, hint } = styles;
  const faq = Array.isArray(value?.faq) ? value.faq : [];
  const guide = value?.guide && typeof value.guide === 'object' ? value.guide : {};
  const setFaq = (next) => onChange({ ...value, faq: next });
  const setItem = (id, patch) => onChange({ ...value, guide: { ...guide, [id]: { state: 'unknown', text: '', ...(guide[id] || {}), ...patch } } });
  const move = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= faq.length) return;
    const next = [...faq];
    [next[i], next[j]] = [next[j], next[i]];
    setFaq(next);
  };
  const small = (c) => ({ fontSize: 12, fontWeight: 600, cursor: 'pointer', borderRadius: 8, padding: '6px 10px', minHeight: 34, color: c, background: 'transparent', border: `1px solid ${c}66` });

  return (
    <div>
      <div style={label}>よくある質問（{faq.length}/{LIMITS.maxFaq}）</div>
      {faq.map((f, i) => (
        <div key={f.id || `new-${i}`} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 10, marginBottom: 10 }}>
          <input value={f.q || ''} maxLength={LIMITS.question} onChange={e => setFaq(faq.map((x, k) => (k === i ? { ...x, q: e.target.value } : x)))}
            placeholder="質問（例: 事前予約は必要ですか？）" aria-label={`質問${i + 1}`} style={input} />
          <textarea value={f.a || ''} maxLength={LIMITS.answer} rows={3} onChange={e => setFaq(faq.map((x, k) => (k === i ? { ...x, a: e.target.value } : x)))}
            placeholder="回答（公式案内で確認した内容だけを書いてください）" aria-label={`回答${i + 1}`} style={{ ...input, resize: 'vertical' }} />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5, color: 'var(--text)', marginRight: 'auto' }}>
              <input type="checkbox" checked={f.public !== false} onChange={e => setFaq(faq.map((x, k) => (k === i ? { ...x, public: e.target.checked } : x)))} />
              公開する
            </label>
            <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="上へ" style={small(primary)}>↑</button>
            <button type="button" onClick={() => move(i, 1)} disabled={i === faq.length - 1} aria-label="下へ" style={small(primary)}>↓</button>
            <button type="button" onClick={() => setFaq(faq.filter((_, k) => k !== i))} style={small('#ef4444')}>削除</button>
          </div>
        </div>
      ))}
      {faq.length < LIMITS.maxFaq && (
        <button type="button" onClick={() => setFaq([...faq, { q: '', a: '', public: true }])}
          style={{ width: '100%', padding: 10, borderRadius: 10, marginBottom: 6, cursor: 'pointer', background: 'transparent', border: `1px dashed ${primary}`, color: 'var(--brand-fg)', fontSize: 13, fontWeight: 700 }}>
          ＋ 質問を追加
        </button>
      )}
      <div style={hint}>詳細画面に開閉式で表示されます。非公開にした質問は運営画面にだけ残ります。</div>

      <div style={{ ...label, marginTop: 14 }}>参加準備ガイド</div>
      {GUIDE_ITEMS.map(item => {
        const v = guide[item.id] || { state: 'unknown', text: '' };
        return (
          <div key={item.id} style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)', flex: 1 }}>{item.label}</span>
              <select value={v.state} onChange={e => setItem(item.id, { state: e.target.value })} aria-label={`${item.label}の状態`}
                style={{ ...input, width: 'auto', marginBottom: 0, padding: '6px 8px', fontSize: 12.5, color: STATE_COLOR[v.state] || 'var(--text)' }}>
                {Object.entries(GUIDE_STATES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
            {v.state === 'confirmed' && (
              <input value={v.text || ''} maxLength={LIMITS.guideText} onChange={e => setItem(item.id, { text: e.target.value })}
                placeholder={item.placeholder} aria-label={item.label} style={{ ...input, marginBottom: 0 }} />
            )}
          </div>
        );
      })}
      <div style={hint}>「確認済み」の項目は内容を、「該当なし」は「該当なし」とだけ公開します。「未確認」は公開しません（推測で埋めないでください）。</div>
    </div>
  );
}

export default function EventGuidePanel({ eventId, adminFetch, primary, styles }) {
  const [value, setValue] = useState(null);
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    try {
      const r = await adminFetch(`/api/admin/event-guides?id=${encodeURIComponent(eventId)}`);
      const j = await r.json().catch(() => ({}));
      if (r.ok) { const v = { faq: j.faq || [], guide: j.guide || {} }; setValue(v); setSaved(JSON.stringify(v)); }
      else setMsg({ type: 'err', text: j.error || '読み込めませんでした。' });
    } catch { setMsg({ type: 'err', text: '通信に失敗しました。' }); }
  }, [adminFetch, eventId]);
  useEffect(() => { load(); }, [load]);

  async function save() {
    setBusy(true); setMsg(null);
    try {
      const r = await adminFetch('/api/admin/event-guides', { method: 'PUT', body: JSON.stringify({ id: eventId, ...value }) });
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        const v = { faq: j.faq || [], guide: j.guide || {} };
        setValue(v); setSaved(JSON.stringify(v));
        setMsg({ type: 'ok', text: 'FAQ・参加準備ガイドを保存しました（公開画面に反映されます）。' });
      } else setMsg({ type: 'err', text: j.error || '保存に失敗しました。' });
    } catch { setMsg({ type: 'err', text: '通信に失敗しました。' }); }
    finally { setBusy(false); }
  }

  if (!value) return <div style={{ ...styles.hint, margin: '0 0 14px' }}>{msg ? msg.text : 'FAQ・ガイドを読み込み中…'}</div>;
  const dirty = JSON.stringify(value) !== saved;
  return (
    <div style={{ marginBottom: 6 }}>
      <EventGuideEditor value={value} onChange={setValue} styles={styles} primary={primary} />
      {msg && <div style={{ padding: '8px 11px', borderRadius: 8, margin: '0 0 10px', fontSize: 12, lineHeight: 1.6, background: msg.type === 'ok' ? '#16a34a14' : '#ef444412', color: msg.type === 'ok' ? '#15803d' : '#ef4444' }}>{msg.text}</div>}
      <button type="button" onClick={save} disabled={busy || !dirty}
        style={{ width: '100%', padding: 12, borderRadius: 10, marginBottom: 12, border: 'none', fontSize: 13.5, fontWeight: 700, color: '#fff', background: (busy || !dirty) ? 'var(--border)' : primary, cursor: (busy || !dirty) ? 'default' : 'pointer' }}>
        {busy ? '保存中…' : dirty ? 'FAQ・参加準備ガイドを保存' : '保存済み'}
      </button>
    </div>
  );
}
