import { useState, useEffect, useCallback } from 'react';
import { ScreenHeader, F } from './Shared';
import { PREFECTURE_INFO } from '../data/regionMap';

/**
 * 運営者管理ページ（裏口）。隠しURL #admin から開く。
 * ユーザー名＋パスワードでログインし、担当地本のイベントを登録・管理できる。
 * - 地本: ログイン情報から自動（全地本管理アカウントはプルダウン）
 * - 下書き保存 / プレビュー / 公開・非公開（締切・中止）切替
 * 追加イベントは Redis に保存され、公開状態のものを全利用者にマージ表示する。
 */

const CATEGORIES = ['説明会', '採用イベント', '一般公開', '艦艇公開', '体験', '演奏会', '記念行事', '広報活動', '地域参加'];
const APPLY_OPTS = ['', '要予約', '予約不要', '要問合せ'];
const BRANCHES = [['army', '陸'], ['navy', '海'], ['air', '空']];
const STATUS_LABEL = { draft: '下書き', published: '公開中', closed: '締切', cancelled: '中止' };
const STATUS_COLOR = { draft: '#888', published: '#16a34a', closed: '#b45309', cancelled: '#ef4444' };
const ACTION_LABEL = { add: '登録', update: '編集', status: '状態変更', delete: '削除' };
const miniOut = (c) => ({ fontSize: 11.5, fontWeight: 600, cursor: 'pointer', borderRadius: 7, padding: '5px 10px', color: c, background: 'transparent', border: `1px solid ${c}55` });
function fmtTime(iso) {
  try {
    return new Date(iso).toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' });
  } catch { return iso || ''; }
}
const PREF_ENTRIES = Object.entries(PREFECTURE_INFO);
const SS_KEY = 'jsdf-admin-auth';

const EMPTY = {
  pref: 'tokyo', date: '', endDate: '', title: '', place: '', address: '',
  time: '', category: '広報活動', branches: [], apply: '', deadline: '', target: '', url: '', notes: '',
};

export default function AdminScreen({ theme, onBack }) {
  const { primary } = theme;
  const [auth, setAuth] = useState(() => { try { return JSON.parse(sessionStorage.getItem(SS_KEY)) || null; } catch { return null; } });
  const [account, setAccount] = useState(null); // {pref, label}
  const [uInput, setUInput] = useState('');
  const [pInput, setPInput] = useState('');
  const [authErr, setAuthErr] = useState('');
  const [form, setForm] = useState(EMPTY);
  const [list, setList] = useState([]);
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);

  const headers = useCallback((a = auth) => ({
    'Content-Type': 'application/json',
    'x-admin-user': a?.user || '',
    'x-admin-pass': a?.pass || '',
  }), [auth]);

  const loadList = useCallback(async (a = auth) => {
    try {
      const r = await fetch('/api/admin/events', { headers: headers(a) });
      if (r.ok) { const j = await r.json(); setList(j.events || []); if (j.account) setAccount(j.account); }
    } catch { /* noop */ }
  }, [auth, headers]);

  // 保存済み認証で自動ログイン
  useEffect(() => {
    if (!auth) return;
    (async () => {
      try {
        const r = await fetch('/api/admin/login', { method: 'POST', headers: headers(), body: '{}' });
        if (r.ok) { const j = await r.json(); setAccount({ pref: j.pref, label: j.label }); applyScope(j.pref); loadList(); }
        else { setAuth(null); try { sessionStorage.removeItem(SS_KEY); } catch { /* noop */ } }
      } catch { /* noop */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 担当地本がスコープ付き（'*'でない）なら form.pref を固定
  function applyScope(pref) {
    if (pref && pref !== '*') setForm(f => ({ ...f, pref }));
  }

  async function handleLogin() {
    setAuthErr(''); setBusy(true);
    const a = { user: uInput.trim(), pass: pInput };
    try {
      const r = await fetch('/api/admin/login', { method: 'POST', headers: headers(a), body: '{}' });
      if (r.ok) {
        const j = await r.json();
        setAuth(a); try { sessionStorage.setItem(SS_KEY, JSON.stringify(a)); } catch { /* noop */ }
        setAccount({ pref: j.pref, label: j.label }); applyScope(j.pref);
        setUInput(''); setPInput('');
        loadList(a);
      } else if (r.status === 429) setAuthErr('試行回数が多すぎます。しばらく待ってください。');
      else setAuthErr('ユーザー名またはパスワードが違います。');
    } catch { setAuthErr('通信に失敗しました。'); }
    finally { setBusy(false); }
  }

  function logout() {
    setAuth(null); setAccount(null); setList([]);
    try { sessionStorage.removeItem(SS_KEY); } catch { /* noop */ }
  }

  async function submit(status) {
    setMsg(null);
    if (!form.title.trim() || !form.date) { setMsg({ type: 'err', text: 'タイトルと開催日は必須です。' }); return; }
    setBusy(true);
    try {
      const r = await fetch('/api/admin/events', { method: 'POST', headers: headers(), body: JSON.stringify({ event: { ...form, status } }) });
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        setMsg({ type: 'ok', text: status === 'published' ? '公開しました（全利用者に表示）。' : '下書きとして保存しました。' });
        setForm(f => ({ ...EMPTY, pref: f.pref, category: f.category }));
        setPreview(false); loadList();
      } else setMsg({ type: 'err', text: j.error || '保存に失敗しました。' });
    } catch { setMsg({ type: 'err', text: '通信に失敗しました。' }); }
    finally { setBusy(false); }
  }

  async function setStatus(id, status) {
    setBusy(true);
    try {
      const r = await fetch('/api/admin/events', { method: 'PATCH', headers: headers(), body: JSON.stringify({ id, patch: { status } }) });
      if (r.ok) loadList();
    } finally { setBusy(false); }
  }
  async function remove(id) {
    if (!window.confirm('このイベントを削除しますか？')) return;
    setBusy(true);
    try {
      const r = await fetch('/api/admin/events', { method: 'DELETE', headers: headers(), body: JSON.stringify({ id }) });
      if (r.ok) loadList();
    } finally { setBusy(false); }
  }

  async function loadHistory() {
    try {
      const r = await fetch('/api/admin/history', { headers: headers() });
      if (r.ok) { const j = await r.json(); setHistory(j.history || []); }
    } catch { /* noop */ }
  }
  function toggleHistory() {
    const next = !showHistory; setShowHistory(next);
    if (next) loadHistory();
  }

  // ── CSV / JSON 出力（表示中の一覧をダウンロード） ──
  function download(filename, text, mime) {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function exportJSON() {
    download(`jsdf-events-${Date.now()}.json`, JSON.stringify(list, null, 2), 'application/json');
  }
  function exportCSV() {
    const cols = ['id', 'pref', 'date', 'endDate', 'title', 'place', 'address', 'time', 'category', 'branches', 'apply', 'deadline', 'target', 'url', 'notes', 'status'];
    const esc = v => {
      let s = Array.isArray(v) ? v.join('/') : (v == null ? '' : String(v));
      if (/[",\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
      return s;
    };
    const rows = [cols.join(',')].concat(list.map(e => cols.map(c => esc(e[c])).join(',')));
    download(`jsdf-events-${Date.now()}.csv`, '﻿' + rows.join('\r\n'), 'text/csv;charset=utf-8');
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const toggleBranch = b => setForm(f => ({ ...f, branches: f.branches.includes(b) ? f.branches.filter(x => x !== b) : [...f.branches, b] }));

  const input = {
    width: '100%', boxSizing: 'border-box', fontFamily: F.sans, fontSize: 14, color: 'var(--text)',
    background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '11px 13px', outline: 'none', marginBottom: 12,
  };
  const label = { fontSize: 12, fontWeight: 700, color: 'var(--text-sub)', marginBottom: 6, letterSpacing: 0.3 };
  const isScoped = account && account.pref !== '*';

  // ── 未ログイン ──
  if (!account) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)', fontFamily: F.sans }}>
        <ScreenHeader primary={primary} title="運営者ログイン" subtitle="ADMIN" onBack={onBack} />
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 18px' }}>
          <div style={label}>ユーザー名</div>
          <input value={uInput} autoFocus onChange={e => setUInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleLogin(); }} placeholder="例: tokyo" style={input} />
          <div style={label}>パスワード</div>
          <input type="password" value={pInput} onChange={e => setPInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleLogin(); }} placeholder="パスワード" style={input} />
          {authErr && <div style={{ color: '#ef4444', fontSize: 12.5, marginBottom: 12 }}>{authErr}</div>}
          <button onClick={handleLogin} disabled={busy || !uInput || !pInput} style={{
            width: '100%', padding: 13, borderRadius: 12, border: 'none', fontFamily: F.sans, fontSize: 15, fontWeight: 700, color: '#fff',
            background: (busy || !uInput || !pInput) ? 'var(--border)' : primary, cursor: (busy || !uInput || !pInput) ? 'default' : 'pointer',
          }}>{busy ? '確認中…' : 'ログイン'}</button>
        </div>
      </div>
    );
  }

  // ── ログイン済み ──
  const prefLabel = isScoped ? (PREFECTURE_INFO[account.pref]?.label || account.pref) : '全地本';
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)', fontFamily: F.sans }}>
      <ScreenHeader primary={primary} title="イベント管理" subtitle="ADMIN"
        onBack={onBack}
        trailing={<button onClick={logout} style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', borderRadius: 8, fontSize: 12, padding: '6px 10px', cursor: 'pointer' }}>ログアウト</button>}
      />
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px', paddingBottom: 'calc(env(safe-area-inset-bottom,0px) + 28px)' }}>
        {/* アカウント表示 */}
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
          ログイン中: <strong style={{ color: 'var(--text)' }}>{account.label}</strong>（担当: {prefLabel}）
        </div>

        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>イベントを登録</div>

        {/* 地本（スコープ付きは固定表示） */}
        <div style={label}>地本</div>
        {isScoped ? (
          <div style={{ ...input, background: 'var(--bg)', color: 'var(--text-muted)' }}>{prefLabel}（ログイン地本）</div>
        ) : (
          <select value={form.pref} onChange={e => set('pref', e.target.value)} style={input}>
            {PREF_ENTRIES.map(([id, info]) => <option key={id} value={id}>{info.label}</option>)}
          </select>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}><div style={label}>開催日 *</div>
            <input type="date" value={form.date} onChange={e => set('date', e.target.value)} style={input} /></div>
          <div style={{ flex: 1 }}><div style={label}>終了日</div>
            <input type="date" value={form.endDate} onChange={e => set('endDate', e.target.value)} style={input} /></div>
        </div>

        <div style={label}>イベント名 *</div>
        <input value={form.title} onChange={e => set('title', e.target.value)} placeholder="例: 〇〇駐屯地 創立記念行事" style={input} />

        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}><div style={label}>イベント種別</div>
            <select value={form.category} onChange={e => set('category', e.target.value)} style={input}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select></div>
          <div style={{ flex: 1 }}><div style={label}>申込要否</div>
            <select value={form.apply} onChange={e => set('apply', e.target.value)} style={input}>
              {APPLY_OPTS.map(o => <option key={o} value={o}>{o || '—'}</option>)}
            </select></div>
        </div>

        {/* 陸海空区分 */}
        <div style={label}>陸海空区分</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {BRANCHES.map(([b, jp]) => {
            const on = form.branches.includes(b);
            return (
              <button key={b} onClick={() => toggleBranch(b)} style={{
                flex: 1, padding: '9px 0', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                border: `1px solid ${on ? primary : 'var(--border)'}`, background: on ? `${primary}18` : 'var(--card)',
                color: on ? primary : 'var(--text-sub)',
              }}>{jp}</button>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}><div style={label}>時間</div>
            <input value={form.time} onChange={e => set('time', e.target.value)} placeholder="10:00～16:00" style={input} /></div>
          <div style={{ flex: 1 }}><div style={label}>申込締切</div>
            <input type="date" value={form.deadline} onChange={e => set('deadline', e.target.value)} style={input} /></div>
        </div>

        <div style={label}>対象</div>
        <input value={form.target} onChange={e => set('target', e.target.value)} placeholder="例: 18〜32歳 / 小学生以上 など" style={input} />

        <div style={label}>会場名</div>
        <input value={form.place} onChange={e => set('place', e.target.value)} placeholder="例: 陸上自衛隊〇〇駐屯地" style={input} />
        <div style={label}>住所</div>
        <input value={form.address} onChange={e => set('address', e.target.value)} placeholder="例: 東京都〇〇区…" style={input} />

        <div style={label}>公式URL</div>
        <input value={form.url} onChange={e => set('url', e.target.value)} placeholder="https://www.mod.go.jp/pco/..." inputMode="url" style={input} />
        <div style={label}>備考</div>
        <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} placeholder="補足事項" style={{ ...input, resize: 'vertical' }} />

        {/* プレビュー */}
        <button onClick={() => setPreview(p => !p)} style={{
          width: '100%', padding: 11, borderRadius: 10, marginBottom: 12, cursor: 'pointer',
          background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 13, fontWeight: 600,
        }}>{preview ? 'プレビューを隠す' : '👁 プレビューを表示'}</button>
        {preview && <PreviewCard form={form} primary={primary} prefLabel={isScoped ? prefLabel : (PREFECTURE_INFO[form.pref]?.label || form.pref)} />}

        {msg && (
          <div style={{
            padding: '10px 13px', borderRadius: 10, margin: '4px 0 12px', fontSize: 12.5, lineHeight: 1.6,
            background: msg.type === 'ok' ? '#16a34a14' : '#ef444412', border: `1px solid ${msg.type === 'ok' ? '#16a34a44' : '#ef444433'}`,
            color: msg.type === 'ok' ? '#15803d' : '#ef4444',
          }}>{msg.text}</div>
        )}

        {/* 下書き / 公開 */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 26 }}>
          <button onClick={() => submit('draft')} disabled={busy} style={{
            flex: 1, padding: 13, borderRadius: 12, fontFamily: F.sans, fontSize: 14, fontWeight: 700, cursor: busy ? 'default' : 'pointer',
            background: 'var(--card)', border: `1px solid ${primary}`, color: primary,
          }}>下書き保存</button>
          <button onClick={() => submit('published')} disabled={busy} style={{
            flex: 1, padding: 13, borderRadius: 12, border: 'none', fontFamily: F.sans, fontSize: 14, fontWeight: 700, color: '#fff',
            background: busy ? 'var(--border)' : primary, cursor: busy ? 'default' : 'pointer',
          }}>公開する</button>
        </div>

        {/* 一覧ヘッダ + 出力 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', flex: 1 }}>登録済み（{list.length}）</div>
          <button onClick={exportCSV} disabled={!list.length} style={miniOut(primary)}>CSV出力</button>
          <button onClick={exportJSON} disabled={!list.length} style={miniOut(primary)}>JSON出力</button>
          <button onClick={toggleHistory} style={miniOut(primary)}>{showHistory ? '履歴を隠す' : '変更履歴'}</button>
        </div>

        {/* 変更履歴 */}
        {showHistory && (
          <div style={{ marginBottom: 16, padding: '10px 12px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>変更履歴（新しい順・最新200件）</div>
            {history.length === 0 ? <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>履歴はありません。</div>
              : history.map((h, i) => (
                <div key={i} style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.7, borderTop: i ? '1px solid var(--sep)' : 'none', padding: '5px 0' }}>
                  <span style={{ fontFamily: F.mono }}>{fmtTime(h.at)}</span>
                  {' '}<strong style={{ color: 'var(--text)' }}>{h.user}</strong>
                  {' '}{ACTION_LABEL[h.action] || h.action}
                  {h.note ? `（${h.note}）` : ''}: {(PREFECTURE_INFO[h.pref]?.label || h.pref)}「{h.title || '—'}」
                </div>
              ))}
          </div>
        )}
        {list.length === 0 ? <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>まだありません。</div>
          : list.map(ev => (
            <div key={ev.id} style={{ padding: '10px 12px', marginBottom: 8, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: STATUS_COLOR[ev.status] || '#888', borderRadius: 5, padding: '2px 6px' }}>
                  {STATUS_LABEL[ev.status] || ev.status || '—'}
                </span>
                <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.title}</div>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '4px 0 8px' }}>
                {(PREFECTURE_INFO[ev.pref]?.label || ev.pref)}・{ev.date}{ev.place ? `・${ev.place}` : ''}
              </div>
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
  return (
    <button onClick={onClick} style={{
      fontSize: 11.5, fontWeight: 600, cursor: 'pointer', borderRadius: 7, padding: '5px 10px',
      color: outline ? color : '#fff', background: outline ? 'transparent' : color, border: `1px solid ${color}${outline ? '88' : ''}`,
    }}>{children}</button>
  );
}

function PreviewCard({ form, primary, prefLabel }) {
  return (
    <div style={{ marginBottom: 14, padding: 14, borderRadius: 12, background: 'var(--card)', border: `1px dashed ${primary}66` }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6 }}>プレビュー（公開時の表示イメージ）</div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: primary, background: `${primary}18`, borderRadius: 5, padding: '2px 7px' }}>{prefLabel}</span>
        {form.category && <span style={{ fontSize: 10, color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 5, padding: '2px 7px' }}>{form.category}</span>}
        {form.branches.map(b => <span key={b} style={{ fontSize: 10, color: 'var(--text-muted)' }}>{({ army: '陸', navy: '海', air: '空' })[b]}</span>)}
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', lineHeight: 1.4 }}>{form.title || '（イベント名）'}</div>
      <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.7 }}>
        📅 {form.date || '----/--/--'}{form.endDate ? `〜${form.endDate}` : ''}{form.time ? `　${form.time}` : ''}<br />
        {form.place && <>📍 {form.place}<br /></>}
        {form.apply && <>📝 {form.apply}　</>}{form.deadline && <>締切 {form.deadline}</>}
      </div>
    </div>
  );
}
