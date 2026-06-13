import { useState, useEffect, useCallback, useMemo } from 'react';
import { ScreenHeader, F } from './Shared';
import { PREFECTURE_INFO } from '../data/regionMap';
import { fetchOfficesData } from '../hooks/useOffices';
import { facilitiesForPref, AGE_OPTIONS } from '../data/jsdfFacilities';

/**
 * 運営者管理画面。
 *  mode='login'  : ログインのみ。成功したら onLoggedIn() で通常サイトへ戻す（#admin 用）
 *  mode='manage' : 管理（イベント追加・修正／下書き確認）。設定の運営者メニューから開く
 * 認証情報は localStorage に保持し、各APIへ x-admin-user / x-admin-pass で送る。
 */

const CATEGORIES = ['説明会', '採用イベント', '一般公開', '艦艇公開', '体験', '演奏会', '記念行事', '広報活動', '地域参加'];
const APPLY_OPTS = ['', '要予約', '予約不要', '事前申込制', '入場無料', '要問合せ'];
const STATUS_LABEL = { draft: '下書き', published: '公開中', closed: '締切', cancelled: '中止' };
const STATUS_COLOR = { draft: '#888', published: '#16a34a', closed: '#b45309', cancelled: '#ef4444' };
const ACTION_LABEL = { add: '登録', update: '編集', status: '状態変更', delete: '削除', override: '上書き修正', 'override-clear': '上書き取消' };
const PREF_ENTRIES = Object.entries(PREFECTURE_INFO);
const SS_KEY = 'jsdf-admin-auth';
const STAFF_KEY = 'jsdf-admin-staff';
// 個人番号（仮）→ 担当官名。001=募集案内所 所長のみ追加・削除可
const STAFF = { '001': '東京 募集案内所 所長（仮）', '002': '東京 担当官A（仮）', '003': '東京 担当官B（仮）' };
const STAFF_ADD_DELETE = new Set(['001']);
const WD = ['日', '月', '火', '水', '木', '金', '土'];

const EMPTY = {
  pref: 'tokyo', multiDay: false, date: '', endDate: '', title: '', place: '', address: '',
  timeStart: '', timeEnd: '', category: '広報活動', tag: '', ageRequirement: '', deadline: '', url: '', notes: '',
};

// 開始/終了の時刻入力 → カード表記の time 文字列「HH:MM～HH:MM」
function buildTime(f) {
  if (f.timeStart && f.timeEnd) return `${f.timeStart}～${f.timeEnd}`;
  return f.timeStart || '';
}

// 締切 date(YYYY-MM-DD) → カード表記「M月D日（曜）」文字列
function toDeadlineStr(d) {
  if (!d) return '';
  const t = new Date(d + 'T00:00:00Z');
  if (Number.isNaN(t.getTime())) return '';
  return `${t.getUTCMonth() + 1}月${t.getUTCDate()}日（${WD[t.getUTCDay()]}）`;
}
const miniOut = (c) => ({ fontSize: 11.5, fontWeight: 600, cursor: 'pointer', borderRadius: 7, padding: '5px 10px', color: c, background: 'transparent', border: `1px solid ${c}55` });
function fmtTime(iso) { try { return new Date(iso).toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' }); } catch { return iso || ''; } }

export default function AdminScreen({ theme, onBack, mode = 'login', onLoggedIn, onAuthChange, initialFilter = 'all', initialEditEvent = null, showTabs = false }) {
  const { primary } = theme;
  const [auth, setAuth] = useState(() => { try { return JSON.parse(localStorage.getItem(SS_KEY)) || null; } catch { return null; } });
  const [account, setAccount] = useState(null);
  // 保存済み認証で自動ログイン中は、ログイン画面を一瞬出さないようローディング表示にする
  const [checking, setChecking] = useState(() => {
    try { return !!JSON.parse(localStorage.getItem(SS_KEY)); } catch { return false; }
  });
  const [uInput, setUInput] = useState('');
  const [pInput, setPInput] = useState('');
  const [authErr, setAuthErr] = useState('');
  const [form, setForm] = useState(EMPTY);
  const [list, setList] = useState([]);
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [filter, setFilter] = useState(initialFilter); // all（追加修正＝公開系）| draft（下書き確認）
  const [editingId, setEditingId] = useState(null);
  const [editingDeadline, setEditingDeadline] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const [offices, setOffices] = useState([]);
  const [staff, setStaff] = useState(() => { try { return localStorage.getItem(STAFF_KEY) || ''; } catch { return ''; } });
  const staffName = STAFF[staff] || '';
  const canAddDelete = STAFF_ADD_DELETE.has(staff);

  useEffect(() => { fetchOfficesData().then(d => setOffices(Array.isArray(d) ? d : (d?.offices || []))).catch(() => {}); }, []);

  const headers = useCallback((a = auth) => ({ 'Content-Type': 'application/json', 'x-admin-user': a?.user || '', 'x-admin-pass': a?.pass || '', 'x-admin-staff': staff || '' }), [auth, staff]);

  const loadList = useCallback(async (a = auth) => {
    try {
      const r = await fetch('/api/admin/events', { headers: headers(a) });
      if (r.ok) { const j = await r.json(); setList(j.events || []); if (j.account) { setAccount(j.account); applyScope(j.account.pref); } }
    } catch { /* noop */ }
  }, [auth, headers]);

  // 保存済み認証で自動ログイン（管理画面を開いたとき）
  useEffect(() => {
    if (!auth) { setChecking(false); return; }
    (async () => {
      try {
        const r = await fetch('/api/admin/login', { method: 'POST', headers: headers(), body: '{}' });
        if (r.ok) { const j = await r.json(); setAccount({ pref: j.pref, label: j.label }); applyScope(j.pref); loadList(); }
        else { setAuth(null); try { localStorage.removeItem(SS_KEY); } catch { /* noop */ } onAuthChange?.(false); }
      } catch { /* noop */ }
      finally { setChecking(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyScope(pref) { if (pref && pref !== '*') setForm(f => ({ ...f, pref })); }

  // 詳細画面から渡された編集対象を、ログイン確認後に一度だけフォームへ読み込む
  const [editConsumed, setEditConsumed] = useState(false);
  const [fromDetail, setFromDetail] = useState(false); // 詳細起点の編集（戻る/保存で詳細へ戻す）
  useEffect(() => {
    if (account && initialEditEvent && !editConsumed) { startEdit(initialEditEvent); setEditConsumed(true); setFromDetail(true); }
  }, [account, initialEditEvent, editConsumed]);

  async function handleLogin() {
    setAuthErr(''); setBusy(true);
    const a = { user: uInput.trim(), pass: pInput };
    try {
      const r = await fetch('/api/admin/login', { method: 'POST', headers: headers(a), body: '{}' });
      if (r.ok) {
        const j = await r.json();
        setAuth(a); try { localStorage.setItem(SS_KEY, JSON.stringify(a)); } catch { /* noop */ }
        onAuthChange?.(true);
        setUInput(''); setPInput('');
        if (mode === 'login' && onLoggedIn) { onLoggedIn(); return; } // 通常サイトへ
        setAccount({ pref: j.pref, label: j.label }); applyScope(j.pref); loadList(a);
      } else if (r.status === 429) setAuthErr('試行回数が多すぎます。しばらく待ってください。');
      else setAuthErr('ユーザー名またはパスワードが違います。');
    } catch { setAuthErr('通信に失敗しました。'); }
    finally { setBusy(false); }
  }
  function logout() { setAuth(null); setAccount(null); setList([]); try { localStorage.removeItem(SS_KEY); } catch { /* noop */ } onAuthChange?.(false); }

  // 既存イベントの編集を開始（フォームへ読み込み）。※編集はユーザー通知を飛ばさない
  function startEdit(ev) {
    const tm = (ev.time || '').match(/(\d{1,2}:\d{2})\s*[～~-]\s*(\d{1,2}:\d{2})/);
    setForm({
      pref: ev.pref, multiDay: !!ev.endDate, date: ev.date || '', endDate: ev.endDate || '',
      title: ev.title || '', place: ev.place || '', address: ev.address || '',
      timeStart: tm ? tm[1] : '', timeEnd: tm ? tm[2] : '',
      category: ev.category || '広報活動', tag: ev.tag || '', ageRequirement: ev.ageRequirement || '',
      deadline: '', url: ev.url || '', notes: ev.notes || '',
    });
    setEditingId(ev.id); setEditingDeadline(ev.deadline || null); setPreview(false); setMsg(null);
    try { document.querySelector('[data-admin-scroll]')?.scrollTo({ top: 0, behavior: 'smooth' }); } catch { /* noop */ }
  }
  function cancelEdit() { setEditingId(null); setEditingDeadline(null); setForm(f => ({ ...EMPTY, pref: f.pref })); setMsg(null); }

  // 既存イベント（スクレイプ等）の上書きを取り消して元に戻す
  async function revertOverride() {
    if (!editingId || String(editingId).startsWith('manual-')) return;
    if (!window.confirm('このイベントの上書き修正を取り消して元の内容に戻しますか？')) return;
    setBusy(true);
    try {
      const r = await fetch('/api/admin/overrides', { method: 'DELETE', headers: headers(), body: JSON.stringify({ id: editingId, pref: form.pref }) });
      if (r.ok) { if (fromDetail) { onBack?.(); return; } setMsg({ type: 'ok', text: '上書きを取り消しました。' }); cancelEdit(); }
      else setMsg({ type: 'err', text: '取り消しに失敗しました。' });
    } catch { setMsg({ type: 'err', text: '通信に失敗しました。' }); }
    finally { setBusy(false); }
  }

  async function submit(status) {
    setMsg(null);
    if (!form.title.trim() || !form.date) { setMsg({ type: 'err', text: 'タイトルと開催日は必須です。' }); return; }
    setBusy(true);
    try {
      if (editingId) {
        // 編集（通知なし）。締切は再入力時のみ更新
        const patch = {
          title: form.title, place: form.place, address: form.address, time: buildTime(form),
          category: form.category, tag: form.tag, ageRequirement: form.ageRequirement,
          url: form.url, notes: form.notes, date: form.date, endDate: form.multiDay ? form.endDate : '',
        };
        if (form.deadline) patch.deadline = toDeadlineStr(form.deadline);
        // 手動追加イベント(manual-…)は本体をPATCH。それ以外（スクレイプ等）はID単位の上書き保存。
        const isManual = String(editingId).startsWith('manual-');
        const r = isManual
          ? await fetch('/api/admin/events', { method: 'PATCH', headers: headers(), body: JSON.stringify({ id: editingId, patch }) })
          : await fetch('/api/admin/overrides', { method: 'POST', headers: headers(), body: JSON.stringify({ id: editingId, pref: form.pref, patch }) });
        const j = await r.json().catch(() => ({}));
        if (r.ok) {
          if (fromDetail) { onBack?.(); return; } // 詳細起点の編集 → 詳細へ戻す
          setMsg({ type: 'ok', text: '更新しました（利用者への通知は送りません）。' }); cancelEdit(); loadList();
        } else setMsg({ type: 'err', text: j.error || '更新に失敗しました。' });
      } else {
        const payload = { ...form, endDate: form.multiDay ? form.endDate : '', time: buildTime(form), deadline: toDeadlineStr(form.deadline) };
        delete payload.multiDay; delete payload.timeStart; delete payload.timeEnd;
        const r = await fetch('/api/admin/events', { method: 'POST', headers: headers(), body: JSON.stringify({ event: { ...payload, status } }) });
        const j = await r.json().catch(() => ({}));
        if (r.ok) {
          setMsg({ type: 'ok', text: status === 'published' ? '公開しました（全利用者に表示）。' : '下書き保存しました。' });
          setForm(f => ({ ...EMPTY, pref: f.pref, category: f.category })); setPreview(false); loadList();
        } else setMsg({ type: 'err', text: j.error || '保存に失敗しました。' });
      }
    } catch { setMsg({ type: 'err', text: '通信に失敗しました。' }); }
    finally { setBusy(false); }
  }
  async function setStatus(id, status) { setBusy(true); try { const r = await fetch('/api/admin/events', { method: 'PATCH', headers: headers(), body: JSON.stringify({ id, patch: { status } }) }); if (r.ok) loadList(); } finally { setBusy(false); } }
  async function remove(id) { if (!window.confirm('このイベントを削除しますか？')) return; setBusy(true); try { const r = await fetch('/api/admin/events', { method: 'DELETE', headers: headers(), body: JSON.stringify({ id }) }); if (r.ok) loadList(); } finally { setBusy(false); } }
  async function loadHistory() { try { const r = await fetch('/api/admin/history', { headers: headers() }); if (r.ok) { const j = await r.json(); setHistory(j.history || []); } } catch { /* noop */ } }
  function toggleHistory() { const n = !showHistory; setShowHistory(n); if (n) loadHistory(); }
  async function deleteHistory(at) { try { const r = await fetch('/api/admin/history', { method: 'DELETE', headers: headers(), body: JSON.stringify({ at }) }); if (r.ok) loadHistory(); } catch { /* noop */ } }
  async function clearHistory() { if (!window.confirm('変更履歴をすべて消去しますか？')) return; try { const r = await fetch('/api/admin/history', { method: 'DELETE', headers: headers(), body: JSON.stringify({ clear: true }) }); if (r.ok) loadHistory(); } catch { /* noop */ } }

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

  const input ={ width: '100%', boxSizing: 'border-box', fontFamily: F.sans, fontSize: 14, color: 'var(--text)', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '11px 13px', outline: 'none', marginBottom: 12 };
  const label = { fontSize: 12, fontWeight: 700, color: 'var(--text-sub)', marginBottom: 6, letterSpacing: 0.3 };

  // ── 自動ログイン確認中: ログイン画面のちらつきを防ぐローディング ──
  if (!account && checking) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)', fontFamily: F.sans }}>
        <ScreenHeader primary={primary} title="運営者" subtitle="ADMIN" onBack={onBack} />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>読み込み中…</div>
      </div>
    );
  }

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
  // 追加修正ページ＝公開系（下書き以外）、下書き確認ページ＝下書きのみ。重複を避けて分離。
  const shown = filter === 'draft' ? list.filter(e => e.status === 'draft') : list.filter(e => e.status !== 'draft');
  // 下書き確認ページでは登録フォームを出さない（編集時のみ表示）。追加修正ページは常時表示。
  const showForm = filter !== 'draft' || !!editingId;
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)', fontFamily: F.sans }}>
      <ScreenHeader primary={primary} title={editingId ? '編集' : (filter === 'draft' ? '下書き確認' : 'イベント追加・修正')} subtitle="ADMIN"
        onBack={(editingId && !fromDetail) ? cancelEdit : onBack}
        trailing={<button onClick={logout} style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', borderRadius: 8, fontSize: 12, padding: '6px 10px', cursor: 'pointer' }}>ログアウト</button>} />
      {/* タブ（追加・修正／下書き）。1ページで全機能にアクセス */}
      {showTabs && !editingId && (
        <div style={{ display: 'flex', gap: 8, padding: '10px 16px 0', flexShrink: 0 }}>
          {[['all', 'イベント追加・修正'], ['draft', '下書き']].map(([v, jp]) => {
            const on = filter === v;
            return (
              <button key={v} onClick={() => setFilter(v)} style={{
                flex: 1, padding: '9px 0', borderRadius: 9, fontFamily: F.sans, fontSize: 13, fontWeight: 700,
                cursor: 'pointer', border: `1px solid ${on ? primary : 'var(--border)'}`,
                background: on ? primary : 'var(--card)', color: on ? '#fff' : 'var(--text-sub)',
              }}>{jp}{v === 'draft' && list.filter(e => e.status === 'draft').length > 0 ? `（${list.filter(e => e.status === 'draft').length}）` : ''}</button>
            );
          })}
        </div>
      )}
      <div data-admin-scroll style={{ flex: 1, overflowY: 'auto', padding: '16px 16px', paddingBottom: 'calc(env(safe-area-inset-bottom,0px) + 28px)' }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>ログイン中: <strong style={{ color: 'var(--text)' }}>{account.label}</strong>（担当: {prefLabel}）</div>

        {/* 個人番号（仮）→ 担当官名を自動表示。001=所長のみ追加・削除可 */}
        <div style={{ marginBottom: 14, padding: '10px 12px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10 }}>
          <div style={{ ...label, marginBottom: 6 }}>個人番号</div>
          <input value={staff} inputMode="numeric"
            onChange={e => { const v = e.target.value.replace(/\D/g, '').slice(0, 3); setStaff(v); try { localStorage.setItem(STAFF_KEY, v); } catch { /* noop */ } }}
            placeholder="例: 001" style={{ ...input, marginBottom: 6 }} />
          {staffName
            ? <div style={{ fontSize: 12.5, color: 'var(--text)' }}>担当官: <strong>{staffName}</strong> <span style={{ color: canAddDelete ? '#15803d' : 'var(--text-muted)' }}>{canAddDelete ? '（追加・削除・編集 可）' : '（編集のみ／追加・削除不可）'}</span></div>
            : staff ? <div style={{ fontSize: 12, color: '#ef4444' }}>未登録の個人番号です（仮: 001 / 002 / 003）</div>
              : <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>個人番号を入力すると担当官名が表示されます（仮: 001=所長 / 002 / 003）</div>}
        </div>

        {showForm && (<>
        <div style={{ fontSize: 13, fontWeight: 700, color: editingId ? primary : 'var(--text)', marginBottom: 12 }}>
          {editingId ? '既存イベントを編集中' : 'イベントを登録'}
        </div>

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
        {/* 連日は日付入力が幅を取るため縦に並べる（右マージン消失を防ぐ） */}
        <div style={label}>{form.multiDay ? '開始日 *' : '開催日 *'}</div>
        <input type="date" value={form.date} onChange={e => set('date', e.target.value)} style={input} />
        {form.multiDay && <>
          <div style={label}>終了日</div>
          <input type="date" value={form.endDate} onChange={e => set('endDate', e.target.value)} style={input} />
        </>}

        <div style={label}>イベント名 *</div>
        <input value={form.title} onChange={e => set('title', e.target.value)} placeholder="例: 〇〇駐屯地 創立記念行事" style={input} />

        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}><div style={label}>イベント種別</div><select value={form.category} onChange={e => set('category', e.target.value)} style={input}>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
          <div style={{ flex: 1 }}><div style={label}>申込要否</div><select value={form.tag} onChange={e => set('tag', e.target.value)} style={input}>{APPLY_OPTS.map(o => <option key={o} value={o}>{o || '—'}</option>)}</select></div>
        </div>

        <div style={label}>時間</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
          <input type="time" value={form.timeStart} onChange={e => set('timeStart', e.target.value)} style={{ ...input, marginBottom: 0, flex: 1, minWidth: 0 }} />
          <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>〜</span>
          <input type="time" value={form.timeEnd} onChange={e => set('timeEnd', e.target.value)} style={{ ...input, marginBottom: 0, flex: 1, minWidth: 0 }} />
        </div>

        <div style={label}>申込締切</div>
        <input type="date" value={form.deadline} onChange={e => set('deadline', e.target.value)} style={input} />

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

        <div style={label}>会場名（上の選択で自動入力／自由入力も可）</div>
        <input value={form.place} onChange={e => set('place', e.target.value)} placeholder="例: 陸上自衛隊〇〇駐屯地" style={input} />
        <div style={label}>住所</div>
        <input value={form.address} onChange={e => set('address', e.target.value)} placeholder="例: 東京都〇〇区…" style={input} />
        {(form.address || form.place) && <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(form.address || form.place)}`} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', margin: '-4px 0 14px', fontSize: 12, fontWeight: 600, color: primary, textDecoration: 'none' }}>地図で確認</a>}

        <div style={label}>公式URL</div>
        <input value={form.url} onChange={e => set('url', e.target.value)} placeholder="https://www.mod.go.jp/pco/..." inputMode="url" style={input} />
        <div style={label}>備考</div>
        <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} placeholder="補足事項" style={{ ...input, resize: 'vertical' }} />
        {editingId && editingDeadline && <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 12 }}>現在の締切: {editingDeadline}（締切欄を空のままなら保持されます）</div>}

        <button onClick={() => setPreview(p => !p)} style={{ width: '100%', padding: 12, borderRadius: 10, marginBottom: 12, cursor: 'pointer', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 13, fontWeight: 600 }}>{preview ? 'プレビューを隠す' : 'プレビュー（カード表示イメージ）'}</button>
        {preview && <PreviewCard form={form} primary={primary} prefLabel={isScoped ? prefLabel : (PREFECTURE_INFO[form.pref]?.label || form.pref)} />}

        {msg && <div style={{ padding: '10px 13px', borderRadius: 10, margin: '4px 0 12px', fontSize: 12.5, lineHeight: 1.6, background: msg.type === 'ok' ? '#16a34a14' : '#ef444412', border: `1px solid ${msg.type === 'ok' ? '#16a34a44' : '#ef444433'}`, color: msg.type === 'ok' ? '#15803d' : '#ef4444' }}>{msg.text}</div>}

        {/* 保存ボタン（編集時は更新／キャンセル） */}
        {editingId ? (
          <div style={{ marginBottom: 26 }}>
            {!String(editingId).startsWith('manual-') && (
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 8, lineHeight: 1.6 }}>
                これは自動収集イベントの「上書き修正」です（元データは変えず、表示内容のみ上書きします）。
              </div>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={cancelEdit} disabled={busy} style={{ flex: 1, padding: 15, borderRadius: 12, fontFamily: F.sans, fontSize: 15, fontWeight: 700, cursor: busy ? 'default' : 'pointer', background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--text-sub)' }}>キャンセル</button>
              <button onClick={() => submit()} disabled={busy} style={{ flex: 2, padding: 15, borderRadius: 12, border: 'none', fontFamily: F.sans, fontSize: 15, fontWeight: 700, color: '#fff', background: busy ? 'var(--border)' : primary, cursor: busy ? 'default' : 'pointer' }}>{busy ? '更新中…' : '変更を更新する'}</button>
            </div>
            {!String(editingId).startsWith('manual-') && (
              <button onClick={revertOverride} disabled={busy} style={{ marginTop: 10, width: '100%', padding: 12, borderRadius: 10, background: 'transparent', border: '1px solid #ef444455', color: '#ef4444', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>上書きを取り消して元に戻す</button>
            )}
          </div>
        ) : canAddDelete ? (
          <div style={{ display: 'flex', gap: 10, marginBottom: 26 }}>
            <button onClick={() => submit('draft')} disabled={busy} style={{ flex: 1, padding: 15, borderRadius: 12, fontFamily: F.sans, fontSize: 15, fontWeight: 700, cursor: busy ? 'default' : 'pointer', background: 'var(--card)', border: `1px solid ${primary}`, color: primary }}>下書き保存</button>
            <button onClick={() => submit('published')} disabled={busy} style={{ flex: 1, padding: 15, borderRadius: 12, border: 'none', fontFamily: F.sans, fontSize: 15, fontWeight: 700, color: '#fff', background: busy ? 'var(--border)' : primary, cursor: busy ? 'default' : 'pointer' }}>公開する</button>
          </div>
        ) : (
          <div style={{ marginBottom: 26, padding: '12px 14px', borderRadius: 10, background: 'var(--card)', border: '1px dashed var(--border)', fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.7 }}>
            この個人番号ではイベントの新規追加はできません（追加・削除は <strong>001（所長）</strong> のみ）。既存イベントの「編集」は可能です。
          </div>
        )}
        </>)}

        {/* 一覧 + 出力 + 履歴 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', flex: 1 }}>{filter === 'draft' ? '下書き一覧' : '公開中のイベント'}（{shown.length}）</div>
          <button onClick={exportCSV} disabled={!list.length} style={miniOut(primary)}>CSV</button>
          <button onClick={exportJSON} disabled={!list.length} style={miniOut(primary)}>JSON</button>
          <button onClick={toggleHistory} style={miniOut(primary)}>{showHistory ? '履歴を閉じる' : '変更履歴'}</button>
        </div>

        {showHistory && (
          <div style={{ marginBottom: 16, padding: '10px 12px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', flex: 1 }}>変更履歴（新しい順）</div>
              {history.length > 0 && <button onClick={clearHistory} style={{ ...miniOut('#ef4444'), padding: '4px 10px' }}>全消去</button>}
            </div>
            {history.length === 0 ? <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>履歴はありません。</div>
              : history.map((h, i) => (
                <div key={h.at + i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.7, borderTop: i ? '1px solid var(--sep)' : 'none', padding: '6px 0' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontFamily: F.mono }}>{fmtTime(h.at)}</span> <strong style={{ color: 'var(--text)' }}>{h.user}</strong> {ACTION_LABEL[h.action] || h.action}{h.note ? `（${h.note}）` : ''}: 「{h.title || '—'}」
                  </div>
                  <button onClick={() => deleteHistory(h.at)} aria-label="この履歴を削除" style={{ flexShrink: 0, fontSize: 11, fontWeight: 600, color: '#ef4444', background: 'transparent', border: '1px solid #ef444455', borderRadius: 7, padding: '3px 8px', cursor: 'pointer' }}>削除</button>
                </div>
              ))}
          </div>
        )}

        {shown.length === 0 ? <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>まだありません。</div>
          : shown.map(ev => (
            <div key={ev.id} style={{ padding: '10px 12px', marginBottom: 8, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: STATUS_COLOR[ev.status] || '#888', borderRadius: 5, padding: '2px 6px' }}>{STATUS_LABEL[ev.status] || ev.status || '—'}</span>
                <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.title}</div>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '4px 0 2px' }}>{(PREFECTURE_INFO[ev.pref]?.label || ev.pref)}・{ev.date}{ev.endDate ? `〜${ev.endDate}` : ''}{ev.place ? `・${ev.place}` : ''}</div>
              <div style={{ fontSize: 10.5, color: 'var(--text-muted)', opacity: 0.8, margin: '0 0 10px' }}>担当: 作成 {ev.createdBy || '—'}{ev.updatedBy && ev.updatedBy !== ev.createdBy ? ` / 最終編集 ${ev.updatedBy}` : ''}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Mini onClick={() => startEdit(ev)} color={primary}>編集</Mini>
                {ev.status !== 'published' && <Mini onClick={() => setStatus(ev.id, 'published')} color="#16a34a">公開</Mini>}
                {ev.status === 'published' && <Mini onClick={() => setStatus(ev.id, 'draft')} color="#888">下書きへ</Mini>}
                {ev.status !== 'closed' && <Mini onClick={() => setStatus(ev.id, 'closed')} color="#b45309">締切</Mini>}
                {ev.status !== 'cancelled' && <Mini onClick={() => setStatus(ev.id, 'cancelled')} color="#ef4444">中止</Mini>}
                {canAddDelete && <Mini onClick={() => remove(ev.id)} color="#ef4444" outline>削除</Mini>}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

function Mini({ onClick, color, outline, children }) {
  return <button onClick={onClick} style={{ fontSize: 13, fontWeight: 700, cursor: 'pointer', borderRadius: 9, padding: '9px 16px', minHeight: 38, color: outline ? color : '#fff', background: outline ? 'transparent' : color, border: `1px solid ${color}${outline ? '88' : ''}` }}>{children}</button>;
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
        日時: {form.date || '----/--/--'}{form.multiDay && form.endDate ? `〜${form.endDate}` : ''}{buildTime(form) ? `　${buildTime(form)}` : ''}<br />
        {form.place && <>場所: {form.place}<br /></>}
        {form.ageRequirement && <>対象: {form.ageRequirement}<br /></>}
        {form.deadline && <>締切: {toDeadlineStr(form.deadline)}</>}
      </div>
    </div>
  );
}
