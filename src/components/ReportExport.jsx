// 運営画面: 掲載イベントの統計・閲覧数の出力（Excel・CSV・PDF）。
// データは /api/admin/view-stats?report=1（担当範囲の掲載中・運営登録・過去アーカイブの全件と閲覧数）。
// 整形は shared/reportExport.cjs。PDF は印刷用ページを開き、ブラウザの「PDF に保存」で出力する。
import { useState } from 'react';
import { PREFECTURE_INFO } from '../data/regionMap';
import R from '../../shared/reportExport.cjs';

const PREF_LABELS = Object.fromEntries(Object.entries(PREFECTURE_INFO).map(([k, v]) => [k, v.label]));
const jstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

function download(name, data, type) {
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export default function ReportExport({ adminFetch, primary, scopeLabel = '' }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);

  async function load() {
    const r = await adminFetch('/api/admin/view-stats?report=1');
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || '読み込めませんでした');
    const today = jstToday();
    const rows = R.filterByDate(R.toRows(j.rows || [], PREF_LABELS, today), { from, to });
    const meta = { generatedAt: new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16).replace('T', ' ') + '（日本時間）', scope: scopeLabel, from, to };
    return { rows, sheets: R.buildSheets(rows, meta), truncated: j.truncated };
  }

  async function run(kind) {
    setMsg(null);
    // PDF は印刷用ページを先に開く（読み込み後に開くとポップアップとして止められるため）
    const win = kind === 'pdf' ? window.open('', '_blank') : null;
    if (kind === 'pdf' && !win) { setMsg({ type: 'err', text: '新しいタブを開けませんでした（ポップアップを許可してください）' }); return; }
    if (win) win.document.write('<p style="font-family:sans-serif">読み込み中…</p>');
    setBusy(kind);
    try {
      const { rows, sheets, truncated } = await load();
      const stamp = jstToday().replace(/-/g, '');
      if (kind === 'xlsx') download(`event-stats-${stamp}.xlsx`, R.toXlsx(sheets), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      else if (kind === 'csv') download(`event-stats-${stamp}.csv`, R.toCsv(rows), 'text/csv;charset=utf-8');
      else {
        win.document.open(); win.document.write(R.toPrintHtml(sheets, { title: `掲載イベントの統計（${stamp}）` })); win.document.close();
        // 印刷画面は開いた側から呼ぶ（印刷用ページ内のスクリプトは CSP で動かないため）
        setTimeout(() => { try { win.focus(); win.print(); } catch { /* 手動で印刷してもらう */ } }, 400);
      }
      setMsg({ type: 'ok', text: `${rows.length}件を出力しました${truncated ? '（件数が多いため一部のみ）' : ''}` });
    } catch (e) {
      if (win) win.close();
      setMsg({ type: 'err', text: e.message || '出力できませんでした' });
    } finally { setBusy(''); }
  }

  const btn = (kind, text) => (
    <button type="button" disabled={!!busy} onClick={() => run(kind)}
      style={{ flex: '1 1 0', minWidth: 0, padding: '10px 6px', borderRadius: 9, border: `1px solid ${primary}`, background: busy === kind ? primary : 'var(--card)', color: busy === kind ? '#fff' : 'var(--brand-fg)', fontSize: 13, fontWeight: 700, cursor: busy ? 'default' : 'pointer' }}>
      {busy === kind ? '出力中…' : text}
    </button>
  );
  const dateInput = { flex: '1 1 0', minWidth: 0, fontSize: 13, padding: '8px 10px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)' };
  return (
    <div style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 10, background: 'var(--card)', marginBottom: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>統計の出力（Excel・CSV・PDF）</div>
      <div style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 8 }}>
        担当範囲の掲載中・運営登録・過去（終了済み）のイベントと閲覧数を出力します。地本別・月別・種別・状態別の集計も含みます。
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} aria-label="開催日（から）" style={dateInput} />
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>～</span>
        <input type="date" value={to} onChange={e => setTo(e.target.value)} aria-label="開催日（まで）" style={dateInput} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {btn('xlsx', 'Excel')}
        {btn('csv', 'CSV')}
        {btn('pdf', 'PDF（印刷）')}
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 6 }}>期間は開催日で絞り込みます（空欄なら全期間）。PDF は開いた画面で「PDFに保存」を選んでください。</div>
      {msg && <div style={{ marginTop: 8, fontSize: 12, color: msg.type === 'ok' ? '#15803d' : '#ef4444' }}>{msg.text}</div>}
    </div>
  );
}
