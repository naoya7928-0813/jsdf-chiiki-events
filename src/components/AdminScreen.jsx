import { useState, useEffect, useCallback, useMemo } from 'react';
import { ScreenHeader, F } from './Shared';
import { PREFECTURE_INFO } from '../data/regionMap';
import { fetchOfficesData } from '../hooks/useOffices';
import { facilitiesForPref, TIME_OPTIONS, AGE_OPTIONS } from '../data/jsdfFacilities';

/**
 * 運営者管理画面。
 *  mode='login'  : ログインのみ。成功したら onLoggedIn() で通常サイトへ戻す（#admin 用）
 *  mode='manage' : 管理（イベント追加・修正／下書き確認）。設定の運営者メニューから開く
 * 認証情報は sessionStorage に保持し、各APIへ x-admin-user / x-admin-pass で送る。
 */

const CATEGORIES = ['説明会', '採用イベント', '一般公開', '艦艇公開', '体験', '演奏会', '記念行事', '広報活動', '地域参加'];
const APPLY_OPTS = ['', '要予約', '予約不要', '事前申込制', '入場無料', '要問合せ'];
const STATUS_LABEL = { draft: '下書き', published: '公開中', closed: '締切', cancelled: '中止' };
const STATUS_COLOR = { draft: '#888', published: '#16a34a', closed: '#b45309', cancelled: '#ef4444' };
const ACTION_LABEL = { add: '登録', update: '編集', status: '状態変更', delete: '削除' };
const PREF_ENTRIES = Object.entries(PREFECTURE_INFO);
const SS_KEY = 'jsdf-admin-auth';
const WD = ['日', '月', '火', '水', '木', '金', '土'];

const EMPTY = {
  pref: 'tokyo', multiDay: false, date: '', endDate: '', title: '', place: '', address: '',
  time: '', category: '広報活動', tag: '', ageRequirement: '', deadline: '', url: '', notes: '',
};

// 締切 date(YYYY-MM-DD) → カード表記「M月D日（曜）」文字列
function toDeadlineStr(d) {
  if (!d) return '';
  const t = new Date(d + 'T00:00:00Z');
  if (Number.isNaN(t.getTime())) return '';
  return `${t.getUTCMonth() + 1}月${t.getUTCDate()}日（${WD[t.getUTCDay()]}）`;
}
const miniOut = (c) => ({ fontSize: 11.5, fontWeight: 600, cursor: 'pointer', borderRadius: 7, padding: '5px 10px', color: c, background: 'transparent', border: `1px solid ${c}55` });
function fmtTime(iso) { try { return new Date(iso).toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' }); } catch { return iso || ''; } }

export default function AdminScreen({ theme, onBack, mode = 'login', onLoggedIn, onAuthChange, initialFilter = 'all' }) {
  const { primary } = theme;
  const [auth, setAuth] = useState(() => { try { return JSON.parse(sessionStorage.getItem(SS_KEY)) || null; } catch { return null; } });
  const [account, setAccount] = useState(null);
  const [uInput, setUInput] = useState('');
  const [pInput, setPInput] = useState('');
  const [authErr, setAuthErr] = useState('');
  const [form, setForm] = useState(EMPTY);
  const [list, setList] = useState([]);
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [filter, setFilter] = useState(initialFilter); // all | draft
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const [offices, setOffices] = useState([]);

  useEffect(() => { fetchOfficesData().then(d => setOffices(Array.isArray(d) ? d : (d?.offices || []))).catch(() => {}); }, []);

  const headers = useCallback((a = auth) => ({ 'Content-Type': 'application/json', 'x-admin-user': a?.user || '', 'x-admin-pass': a?.pass || '' }), [auth]);

  const loadList = useCallback(async (a = auth) => {
    try {
      const r = await fetch('/api/admin/events', { headers: headers(a) });
      if (r.ok) { const j = await r.json(); setList(j.events || []); if (j.account) { setAccount(j.account); applyScope(j.account.pref); } }
    } catch { /* noop */ }
  }, [auth, headers]);

  // 保存済み認証で自動ログイン（管理画面を開いたとき）
  useEffect(() => {
    if (!auth) return;
    (async () => {
      try {
        const r = await fetch('/api/admin/login', { method: 'POST', headers: headers(), body: '{}' });
        if (r.ok) { const j = await r.json(); setAccount({ pref: j.pref, label: j.label }); applyScope(j.pref); loadList(); }
        else { setAuth(null); try { sessionStorage.removeItem(SS_KEY); } catch { /* noop */ } onAuthChange?.(false); }
      } catch { /* noop */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyScope(pref) { if (pref && pref !== '*') setForm(f => ({ ...f, pref })); }

  async function handleLogin() {
    setAuthErr(''); setBusy(true);
    const a = { user: uInput.trim(), pass: pInput };
    try {
      const r = await fetch('/api/admin/login', { method: 'POST', headers: headers(a), body: '{}' });
      if (r.ok) {
        const j = await r.json();
        setAuth(a); try { sessionStorage.setItem(SS_KEY, JSON.stringify(a)); } catch { /* noop */ }
        onAuthChange?.(true);
        setUInput(''); setPInput('');
        if (mode === 'login' && onLoggedIn) { onLoggedIn(); return; } // 通常サイトへ
        setAccount({ pref: j.pref, label: j.label }); applyScope(j.pref); loadList(a);
      } else if (r.status === 429) setAuthErr('試行回数が多すぎます。しばらく待ってください。');
      else setAuthErr('ユーザー名またはパスワードが違います。');
    } catch { setAuthErr('通信に失敗しました。'); }
    finally { setBusy(false); }
  }
  function logout() { setAuth(null); setAccount(null); setList([]); try { sessionStorage.removeItem(SS_KEY); } catch { /* noop */ } onAuthChange?.(false); onBack?.(); }

  async function submit(status) {
    setMsg(null);
    if (!form.title.trim() || !form.date) { setMsg({ type: 'err', text: 'タイトルと開催日は必須です。' }); return; }
    setBusy(true);
    const payload = { ...form, endDate: form.multiDay ? form.endDate : '', deadline: toDeadlineStr(form.deadline) };
    delete payload.multiDay;
    try {
      const r = await fetch('/api/admin/events', { method: 'POST', headers: headers(), body: JSON.stringify({ event: { ...payload, status } }) });
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        setMsg({ type: 'ok', text: status === 'published' ? '公開しました（全利用者に表示）。' : '下書き保存しました。' });
        setForm(f => ({ ...EMPTY, pref: f.pref, category: f.category })); setPreview(false); loadList();
      } else setMsg({ type: 'err', text: j.error || '保存に失敗しました。' });
    } catch { setMsg({ type: 'err', text: '通信に失敗しました。' }); }
    finally { setBusy(false); }
  }
  async function setStatus(id, status) { setBusy(true); try { const r = await fetch('/api/admin/events', { method: 'PATCH', headers: headers(), body: JSON.stringify({ id, patch: { status } }) }); if (r.ok) loadList(); } finally { setBusy(false); } }
  async function remove(id) { if (!window.confirm('このイベントを削除しますか？')) return; setBusy(true); try { const r = await fetch('/api/admin/events', { method: 'DELETE', headers: headers(), body: JSON.stringify({ id }) }); if (r.ok) loadList(); } finally { setBusy(false); } }
  async function loadHistory() { try { const r = await fetch('/api/admin/history', { headers: headers() }); if (r.ok) { const j = await r.json(); setHistory(j.history || []); } } catch { /* noop */ } }
  function toggleHistory() { const n = !showHistory; setShowHistory(n); if (n) loadHistory(); }

  function download(name, text, mime) { const b = new Blob([text], { type: mime }); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1000); }
  function exportJSON() { download(`jsdf-events-${Date.now()}.json`, JSON.stringify(list, null, 2), 'application/json'); }
  function exportCSV() {
    const cols = ['id', 'pref', 'date', 'endDate', 'title', 'place', 'address', 'time', 'category', 'tag', 'ageRequirement', 'deadline', 'url', 'notes', 'status'];
    const esc = v => { let s = v == null ? '' : String(v); if (/[",\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"'; return s; };
    const rows = [cols.join(',')].concat(list.map(e => cols.map(c => esc(e[c])).join(',')));
    download(`jsdf-events-${Date.now()}.csv`, '﻿' + rows.join('\r\n'), 'text/csv;charset=utf-8');
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const isScoped = account && account.pref !== '*';
  const prefOffices = useMemo(() => offices.filter(o => o.pref === form.pref), [offices, form.pref]);
  const facilities = useMemo(() => facilitiesForPref(form.pref), [form.pref]);
  const placeCandidates = useMemo(() => {
    const s = new Set();
    facilities.forEach(f => s.add(f.name));
    prefOffices.forEach(o => o.name && s.add(o.name));
    list.forEach(e => e.pref === form.pref && e.place && s.add(e.place));
    return [...s].slice(0, 80);
  }, [facilities, prefOffices, list, form.pref]);
  const addrCandidates = useMemo(() => {
    const s = new Set();
    facilities.forEach(f => f.address && s.add(f.address));
    prefOffices.forEach(o => o.address && s.add(o.address));
    return [...s].slice(0, 80);
  }, [facilities, prefOffices, form.pref]);

  const input = { width: '100%', boxSizing: 'border-box', fontFamily: F.sans, fontSize: 14, color: 'var(--text)', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '11px 13px', outline: 'none', marginBottom: 12 };
  const label = { fontSize: 12, fontWeight: 700, color: 'var(--text-sub)', marginBottom: 6, letterSpacing: 0.3 };

  // ── ログイン画面 ──
  if (!account) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)', fontFamily: F.sans }}>
        <ScreenHeader primary={primary} title="運営者ログイン" subtitle="ADMIN" onBack={onBack} />
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 18px' }}>
          <div style={label}>ユーザー名</div>
          <input value={uInput} autoFocus onChange={e => setUInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleLogin(); }} placeholder="例: tokyo" style={input} />
          <div style={label}>パスワード</div>
          <input type="password" value={pInput} onChange={e => setPInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleLogin(); }} placeholder="パスワード" style={input} />
          {authErr && <div style={{ color: '#ef4444', fontSize: 12.5, marginBottom: 12 }}>{authErr}</div>}
          <button onClick={handleLogin} disabled={busy || !uInput || !pInput} style={{ width: '100%', padding: 13, borderRadius: 12, border: 'none', fontFamily: F.sans, fontSize: 15, fontWeight: 700, color: '#fff', background: (busy || !uInput || !pInput) ? 'var(--border)' : primary, cursor: (busy || !uInput || !pInput) ? 'default' : 'pointer' }}>{busy ? '確認中…' : 'ログイン'}</button>
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 14, lineHeight: 1.7 }}>ログイン後は通常の画面に戻ります。管理メニューは「設定」内に表示されます。</div>
        </div>
      </div>
    );
  }

  // ── 管理画面 ──
  const prefLabel = isScoped ? (PREFECTURE_INFO[account.pref]?.label || account.pref) : '全地本';
  const shown = filter === 'draft' ? list.filter(e => e.status === 'draft') : list;
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)', fontFamily: F.sans }}>
      <ScreenHeader primary={primary} title={filter === 'draft' ? '下書き確認' : 'イベント追加・修正'} subtitle="ADMIN" onBack={onBack}
        trailing={<button onClick={logout} style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', borderRadius: 8, fontSize: 12, padding: '6px 10px', cursor: 'pointer' }}>ログアウト</button>} />
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px', paddingBottom: 'calc(env(safe-area-inset-bottom,0px) + 28px)' }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>ログイン中: <strong style={{ color: 'var(--text)' }}>{account.label}</strong>（担当: {prefLabel}）</div>

        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>イベントを登録</div>

        <div style={label}>地本</div>
        {isScoped ? <div style={{ ...input, background: 'var(--bg)', color: 'var(--text-muted)' }}>{prefLabel}（ログイン地本）</div>
          : <select value={form.pref} onChange={e => set('pref', e.target.value)} style={input}>{PREF_ENTRIES.map(([id, info]) => <option key={id} value={id}>{info.label}</option>)}</select>}

        {/* 開催日: 1日 / 連日 */}
        <div style={label}>開催日</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          {[['single', '1日のみ'], ['multi', '連日']].map(([v, jp]) => {
            const on = (v === 'multi') === form.multiDay;
            return <button key={v} onClick={() => set('multiDay', v === 'multi')} style={{ flex: 1, padding: '9px 0', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', border: `1px solid ${on ? primary : 'var(--border)'}`, background: on ? `${primary}18` : 'var(--card)', color: on ? primary : 'var(--text-sub)' }}>{jp}</button>;
          })}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}><div style={label}>{form.multiDay ? '開始日 *' : '開催日 *'}</div><input type="date" value={form.date} onChange={e => set('date', e.target.value)} style={input} /></div>
          {form.multiDay && <div style={{ flex: 1 }}><div style={label}>終了日</div><input type="date" value={form.endDate} onChange={e => set('endDate', e.target.value)} style={input} /></div>}
        </div>

        <div style={label}>イベント名 *</div>
        <input value={form.title} onChange={e => set('title', e.target.value)} placeholder="例: 〇〇駐屯地 創立記念行事" style={input} />

        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}><div style={label}>イベント種別</div><select value={form.category} onChange={e => set('category', e.target.value)} style={input}>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
          <div style={{ flex: 1 }}><div style={label}>申込要否</div><select value={form.tag} onChange={e => set('tag', e.target.value)} style={input}>{APPLY_OPTS.map(o => <option key={o} value={o}>{o || '—'}</option>)}</select></div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}><div style={label}>時間</div><select value={form.time} onChange={e => set('time', e.target.value)} style={input}>{TIME_OPTIONS.map(o => <option key={o} value={o}>{o || '—'}</option>)}</select></div>
          <div style={{ flex: 1 }}><div style={label}>申込締切</div><input type="date" value={form.deadline} onChange={e => set('deadline', e.target.value)} style={input} /></div>
        </div>

        <div style={label}>対象・年齢</div>
        <select value={AGE_OPTIONS.includes(form.ageRequirement) ? form.ageRequirement : ''} onChange={e => set('ageRequirement', e.target.value)} style={input}>{AGE_OPTIONS.map(o => <option key={o} value={o}>{o || '—（自由入力は下欄）'}</option>)}</select>
        <input value={form.ageRequirement} onChange={e => set('ageRequirement', e.target.value)} placeholder="対象を自由入力（例: 中学生以上の男子）" style={input} />

        {/* 会場: 駐屯地・基地・案内所から選択 */}
        <div style={label}>駐屯地・基地・案内所から選択</div>
        <select value="" onChange={e => {
          const [kind, idx] = e.target.value.split(':');
          if (kind === 'f') { const f = facilities[+idx]; if (f) setForm(p => ({ ...p, place: f.name, address: f.address || p.address })); }
          else if (kind === 'o') { const o = prefOffices[+idx]; if (o) setForm(p => ({ ...p, place: o.name, address: o.address || p.address, url: p.url || o.url || '' })); }
        }} style={input}>
          <option value="">— 選択して会場・住所を自動入力 —</option>
          {facilities.length > 0 && <optgroup label="駐屯地・基地">{facilities.map((f, i) => <option key={'f' + i} value={`f:${i}`}>{f.name}</option>)}</optgroup>}
          {prefOffices.length > 0 && <optgroup label="案内所・事務所">{prefOffices.map((o, i) => <option key={'o' + i} value={`o:${i}`}>{o.name}</option>)}</optgroup>}
        </select>

        <div style={label}>会場名</div>
        <input list="vv-places" value={form.place} onChange={e => set('place', e.target.value)} placeholder="例: 陸上自衛隊〇〇駐屯地" style={input} />
        <datalist id="vv-places">{placeCandidates.map(p => <option key={p} value={p} />)}</datalist>
        <div style={label}>住所</div>
        <input list="vv-addrs" value={form.address} onChange={e => set('address', e.target.value)} placeholder="例: 東京都〇〇区…" style={input} />
        <datalist id="vv-addrs">{addrCandidates.map(a => <option key={a} value={a} />)}</datalist>
        {(form.address || form.place) && <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(form.address || form.place)}`} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', margin: '-4px 0 14px', fontSize: 12, fontWeight: 600, color: primary, textDecoration: 'none' }}>🗺 地図で確認</a>}

        <div style={label}>公式URL</div>
        <input value={form.url} onChange={e => set('url', e.target.value)} placeholder="https://www.mod.go.jp/pco/..." inputMode="url" style={input} />
        <div style={label}>備考</div>
        <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} placeholder="補足事項" style={{ ...input, resize: 'vertical' }} />

        <button onClick={() => setPreview(p => !p)} style={{ width: '100%', padding: 11, borderRadius: 10, marginBottom: 12, cursor: 'pointer', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 13, fontWeight: 600 }}>{preview ? 'プレビューを隠す' : '👁 プレビュー（カード表示イメージ）'}</button>
        {preview && <PreviewCard form={form} primary={primary} prefLabel={isScoped ? prefLabel : (PREFECTURE_INFO[form.pref]?.label || form.pref)} />}

        {msg && <div style={{ padding: '10px 13px', borderRadius: 10, margin: '4px 0 12px', fontSize: 12.5, lineHeight: 1.6, background: msg.type === 'ok' ? '#16a34a14' : '#ef444412', border: `1px solid ${msg.type === 'ok' ? '#16a34a44' : '#ef444433'}`, color: msg.type === 'ok' ? '#15803d' : '#ef4444' }}>{msg.text}</div>}

        <div style={{ display: 'flex', gap: 10, marginBottom: 26 }}>
          <button onClick={() => submit('draft')} disabled={busy} style={{ flex: 1, padding: 13, borderRadius: 12, fontFamily: F.sans, fontSize: 14, fontWeight: 700, cursor: busy ? 'default' : 'pointer', background: 'var(--card)', border: `1px solid ${primary}`, color: primary }}>下書き保存</button>
          <button onClick={() => submit('published')} disabled={busy} style={{ flex: 1, padding: 13, borderRadius: 12, border: 'none', fontFamily: F.sans, fontSize: 14, fontWeight: 700, color: '#fff', background: busy ? 'var(--border)' : primary, cursor: busy ? 'default' : 'pointer' }}>公開する</button>
        </div>

        {/* 一覧 + 出力 + 履歴 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', flex: 1 }}>{filter === 'draft' ? '下書き' : '登録済み'}（{shown.length}）</div>
          <button onClick={() => setFilter(f => f === 'draft' ? 'all' : 'draft')} style={miniOut(primary)}>{filter === 'draft' ? '全件' : '下書きのみ'}</button>
          <button onClick={exportCSV} disabled={!list.length} style={miniOut(primary)}>CSV</button>
          <button onClick={exportJSON} disabled={!list.length} style={miniOut(primary)}>JSON</button>
          <button onClick={toggleHistory} style={miniOut(primary)}>{showHistory ? '履歴×' : '履歴'}</button>
        </div>

        {showHistory && (
          <div style={{ marginBottom: 16, padding: '10px 12px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>変更履歴（新しい順）</div>
            {history.length === 0 ? <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>履歴はありません。</div>
              : history.map((h, i) => <div key={i} style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.7, borderTop: i ? '1px solid var(--sep)' : 'none', padding: '5px 0' }}><span style={{ fontFamily: F.mono }}>{fmtTime(h.at)}</span> <strong style={{ color: 'var(--text)' }}>{h.user}</strong> {ACTION_LABEL[h.action] || h.action}{h.note ? `（${h.note}）` : ''}: 「{h.title || '—'}」</div>)}
          </div>
        )}

        {shown.length === 0 ? <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>まだありません。</div>
          : shown.map(ev => (
            <div key={ev.id} style={{ padding: '10px 12px', marginBottom: 8, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: STATUS_COLOR[ev.status] || '#888', borderRadius: 5, padding: '2px 6px' }}>{STATUS_LABEL[ev.status] || ev.status || '—'}</span>
                <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.title}</div>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '4px 0 8px' }}>{(PREFECTURE_INFO[ev.pref]?.label || ev.pref)}・{ev.date}{ev.endDate ? `〜${ev.endDate}` : ''}{ev.place ? `・${ev.place}` : ''}</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {ev.status !== 'published' && <Mini onClick={() => setStatus(ev.id, 'published')} color="#16a34a">公開</Mini>}
                {ev.status === 'published' && <Mini onClick={() => setStatus(ev.id, 'draft')} color="#888">下書きに戻す</Mini>}
                <Mini onClick={() => setStatus(ev.id, 'closed')} color="#b45309">締切</Mini>
                <Mini onClick={() => setStatus(ev.id, 'cancelled')} color="#ef4444">中止</Mini>
                <Mini onClick={() => remove(ev.id)} color="#ef4444" outline>削除</Mini>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

function Mini({ onClick, color, outline, children }) {
  return <button onClick={onClick} style={{ fontSize: 11.5, fontWeight: 600, cursor: 'pointer', borderRadius: 7, padding: '5px 10px', color: outline ? color : '#fff', background: outline ? 'transparent' : color, border: `1px solid ${color}${outline ? '88' : ''}` }}>{children}</button>;
}

function PreviewCard({ form, primary, prefLabel }) {
  return (
    <div style={{ marginBottom: 14, padding: 14, borderRadius: 12, background: 'var(--card)', border: `1px dashed ${primary}66` }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6 }}>プレビュー（公開時のカード表示イメージ）</div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: primary, background: `${primary}18`, borderRadius: 5, padding: '2px 7px' }}>{prefLabel}</span>
        {form.category && <span style={{ fontSize: 11, color: 'var(--text-sub)' }}>{form.category}</span>}
        {form.tag && <span style={{ fontSize: 11, color: 'var(--text-sub)' }}>· {form.tag}</span>}
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', lineHeight: 1.4 }}>{form.title || '（イベント名）'}</div>
      <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.7 }}>
        📅 {form.date || '----/--/--'}{form.multiDay && form.endDate ? `〜${form.endDate}` : ''}{form.time ? `　${form.time}` : ''}<br />
        {form.place && <>📍 {form.place}<br /></>}
        {form.ageRequirement && <>🎯 {form.ageRequirement}<br /></>}
        {form.deadline && <>締切 {toDeadlineStr(form.deadline)}</>}
      </div>
    </div>
  );
}
