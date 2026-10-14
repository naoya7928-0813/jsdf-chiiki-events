// 運営画面: 掲載イベントの統計・閲覧数の出力（Excel・CSV・PDF）。
// データは /api/admin/view-stats?report=1（担当範囲の掲載中・運営登録・過去アーカイブの全件と閲覧数）。
// 整形は shared/reportExport.cjs。
// PDF は運営画面の中で印刷用プレビューを開き、ブラウザの「PDF に保存」で出力する。
// 別タブ・ファイル表示に移ると、ホーム画面アプリ（特に iPhone）では戻るボタンが無く運営画面に戻れないため、
// プレビューは画面内に重ねて「運営画面に戻る」を置き、Excel/CSV はスマホでは共有シート（保存・他アプリで開く）を使う。
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
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

/** スマホ・ホーム画面アプリでは、ダウンロードするとファイル表示に移って戻れないことがあるため共有シートを使う */
function preferShare(file) {
  try {
    if (!navigator.canShare || !navigator.canShare({ files: [file] })) return false;
    const standalone = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
    const touch = window.matchMedia?.('(pointer: coarse)').matches;
    return !!(standalone || touch);
  } catch { return false; }
}

const PRINT_ROOT = 'report-print-root';

/** 印刷用プレビュー（運営画面に重ねて表示。印刷時はこれだけを紙面に出す） */
function PrintPreview({ html, title, primary, onClose }) {
  // 端末の「戻る」でも閉じる（運営画面は URL で画面を切り替えないので履歴を1つ足して受ける）
  useEffect(() => {
    window.history.pushState({ reportPreview: true }, '');
    const onPop = () => onClose(true);
    window.addEventListener('popstate', onPop);
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prevTitle = document.title;
    document.title = title; // 「PDFに保存」の既定のファイル名になる
    return () => { window.removeEventListener('popstate', onPop); window.removeEventListener('keydown', onKey); document.title = prevTitle; };
  }, [onClose, title]);
  const bar = { display: 'flex', gap: 8, alignItems: 'center', padding: '10px 12px', paddingTop: 'calc(env(safe-area-inset-top,0px) + 10px)', background: primary, position: 'sticky', top: 0, zIndex: 1 };
  const btn = (bg, fg) => ({ padding: '9px 12px', borderRadius: 9, border: 'none', background: bg, color: fg, fontSize: 13.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' });
  return createPortal(
    <div id={PRINT_ROOT} role="dialog" aria-modal="true" aria-label="PDF（印刷）のプレビュー"
      style={{ position: 'fixed', inset: 0, zIndex: 10000, background: '#fff', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <style>{`${R.printCss(`#${PRINT_ROOT} .rp-body`)}
        @media print{body>*:not(#${PRINT_ROOT}){display:none!important}#${PRINT_ROOT}{position:static!important;overflow:visible!important}#${PRINT_ROOT} .rp-bar{display:none!important}}`}</style>
      <div className="rp-bar" style={bar}>
        <button type="button" onClick={() => onClose()} style={btn('rgba(255,255,255,.18)', '#fff')}>← 運営画面に戻る</button>
        <span style={{ flex: 1 }} />
        <button type="button" onClick={() => { try { window.print(); } catch { /* 下の案内から */ } }} style={btn('#fff', primary)}>印刷・PDFに保存</button>
      </div>
      <div className="rp-bar" style={{ padding: '8px 12px', fontSize: 11.5, color: '#555', background: '#f4f6f8', borderBottom: '1px solid #ddd', lineHeight: 1.6 }}>
        印刷画面で「PDFに保存」を選んでください。印刷画面が開かない場合は、ブラウザの共有メニューの「プリント」から保存できます。
      </div>
      <div className="rp-body" style={{ padding: 12, overflowX: 'auto' }} dangerouslySetInnerHTML={{ __html: html }} />
    </div>,
    document.body,
  );
}

export default function ReportExport({ adminFetch, primary, scopeLabel = '' }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null);
  const [preview, setPreview] = useState(null); // { html, title }
  const [shareFile, setShareFile] = useState(null); // スマホで共有シートから保存するファイル

  // プレビューを閉じる。端末の「戻る」で閉じたとき（fromPop）以外は、足した履歴を戻す
  const closePreview = useCallback((fromPop) => {
    setPreview(null);
    if (!fromPop && window.history.state?.reportPreview) window.history.back();
  }, []);

  async function load() {
    const r = await adminFetch('/api/admin/view-stats?report=1');
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || '読み込めませんでした');
    const today = jstToday();
    const rows = R.filterByDate(R.toRows(j.rows || [], PREF_LABELS, today), { from, to });
    const meta = { generatedAt: new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16).replace('T', ' ') + '（日本時間）', scope: scopeLabel, from, to };
    return { rows, sheets: R.buildSheets(rows, meta), truncated: j.truncated };
  }

  function deliver(name, data, type) {
    const file = typeof File === 'function' ? new File([data], name, { type }) : null;
    if (file && preferShare(file)) setShareFile(file); // 共有は利用者の操作から呼ぶ必要があるため、ボタンを出す
    else download(name, data, type);
  }

  async function shareNow() {
    const file = shareFile;
    try { await navigator.share({ files: [file], title: file.name }); setShareFile(null); }
    catch (e) {
      if (e?.name === 'AbortError') return; // 利用者が閉じた
      setShareFile(null); download(file.name, file, file.type);
    }
  }

  async function run(kind) {
    setMsg(null); setShareFile(null);
    setBusy(kind);
    try {
      const { rows, sheets, truncated } = await load();
      const stamp = jstToday().replace(/-/g, '');
      if (kind === 'xlsx') deliver(`event-stats-${stamp}.xlsx`, R.toXlsx(sheets), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      else if (kind === 'csv') deliver(`event-stats-${stamp}.csv`, R.toCsv(rows), 'text/csv;charset=utf-8');
      else {
        const title = `掲載イベントの統計（${stamp}）`;
        setPreview({ html: R.toPrintBody(sheets, { title }), title });
      }
      setMsg({ type: 'ok', text: `${rows.length}件を出力しました${truncated ? '（件数が多いため一部のみ）' : ''}` });
    } catch (e) {
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
      <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 6 }}>期間は開催日で絞り込みます（空欄なら全期間）。PDF はプレビューの「印刷・PDFに保存」から保存し、「運営画面に戻る」で戻れます。</div>
      {msg && <div style={{ marginTop: 8, fontSize: 12, color: msg.type === 'ok' ? '#15803d' : '#ef4444' }}>{msg.text}</div>}
      {shareFile && (
        <div style={{ marginTop: 8, padding: 10, borderRadius: 9, border: `1px solid ${primary}55`, background: `${primary}10`, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ flex: '1 1 160px', fontSize: 12, color: 'var(--text)', lineHeight: 1.6 }}>{shareFile.name} の準備ができました。「保存・共有」から「ファイルに保存」や他のアプリで開けます。</span>
          <button type="button" onClick={shareNow} style={{ padding: '8px 12px', borderRadius: 8, border: 'none', background: primary, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>保存・共有</button>
          <button type="button" onClick={() => setShareFile(null)} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: 12.5, cursor: 'pointer' }}>閉じる</button>
        </div>
      )}
      {preview && <PrintPreview html={preview.html} title={preview.title} primary={primary} onClose={closePreview} />}
    </div>
  );
}
