import { useState } from 'react';
import { F } from './Shared';
// 組み立て・ファイル名は shared に集約（検証・ハッシュ計算は Node 側の shared/backupFormat.cjs と
// scripts/verify-backup.mjs が行う。ブラウザでは node:crypto を使わない）
import { assembleBackup, backupFileName } from '../../shared/backupAssemble.cjs';

/**
 * 運営画面「システム」タブ（backup:export を持つ national_admin / system_admin）。
 * - バックアップ作成: 本体（手動イベント・上書き・アカウント[秘密項目なし]）＋ 監査ログ全ページを取得し、
 *   1つの JSON にまとめてダウンロードする。直前のパスワード再入力（step-up）が必須。
 * 再認証を求められたら（401 step_up_required）ダイアログを出し、成功後に同じ操作をやり直す。
 */
export default function SystemPanel({ adminFetch, primary }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [stepUp, setStepUp] = useState(null); // { resolve } 再認証ダイアログ表示中
  const [pass, setPass] = useState('');
  const [stepErr, setStepErr] = useState('');

  // 401 step_up_required ならダイアログでパスワードを再入力させ、成功したら true
  function askStepUp() {
    return new Promise(resolve => { setPass(''); setStepErr(''); setStepUp({ resolve }); });
  }
  async function submitStepUp(e) {
    e.preventDefault();
    const r = await adminFetch('/api/admin/login', { method: 'POST', body: JSON.stringify({ op: 'step-up', pass }) });
    setPass(''); // 入力したパスワードは画面に残さない
    if (r.ok) { const s = stepUp; setStepUp(null); s.resolve(true); return; }
    const j = await r.json().catch(() => ({}));
    setStepErr(j.message || '再認証に失敗しました');
    if (r.status === 429) { const s = stepUp; setStepUp(null); s.resolve(false); setMsg({ type: 'err', text: j.message }); }
  }
  function cancelStepUp() { const s = stepUp; setStepUp(null); setPass(''); s && s.resolve(false); }

  // 再認証が必要なら求めてから1回だけやり直す GET
  async function getWithStepUp(url) {
    let r = await adminFetch(url);
    if (r.status === 401) {
      const j = await r.clone().json().catch(() => ({}));
      if (j.error === 'step_up_required') {
        if (!await askStepUp()) return null;
        r = await adminFetch(url);
      }
    }
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw new Error(j.message || j.error || `HTTP ${r.status}`);
    }
    return r.json();
  }

  async function createBackup() {
    setBusy(true); setMsg(null);
    try {
      const core = await getWithStepUp('/api/admin/system?op=backup-core');
      if (!core) { setMsg({ type: 'err', text: '再認証が行われなかったため中止しました。' }); return; }
      const pages = [];
      for (let p = 0; p < core.audit.pages; p++) {
        const page = await getWithStepUp(`/api/admin/system?op=backup-audit&page=${p}`);
        if (!page) { setMsg({ type: 'err', text: '再認証が行われなかったため中止しました。' }); return; }
        pages.push(page);
      }
      const bundle = assembleBackup(core, pages);
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = backupFileName(bundle.manifest.createdAt);
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      const c = Object.fromEntries(Object.entries(bundle.manifest.sections).map(([k, v]) => [k, v.count]));
      setMsg({ type: 'ok', text: `バックアップを作成しました（手動イベント ${c.manualEvents} / 上書き ${c.overrides} / アカウント ${c.accounts} / 監査ログ ${c.audit}）。` });
    } catch (e) {
      setMsg({ type: 'err', text: `バックアップの作成に失敗しました: ${e.message}` });
    } finally { setBusy(false); }
  }

  const box = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', marginBottom: 14 };
  return (
    <div style={{ fontFamily: F.sans }}>
      <div style={box}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>バックアップ</div>
        <p style={{ fontSize: 12.5, color: 'var(--text-sub)', lineHeight: 1.7, margin: '0 0 10px' }}>
          手動イベント・上書き修正・アカウント（パスワードは含みません）・監査ログを1つのファイルに保存します。
          作成にはパスワードの再入力が必要です。<br />
          ファイルにはイベントとアカウント一覧が含まれます。<b>共有リポジトリ・チャット・メールに置かず</b>、運営の管理する保管先に保存してください。
          内容の検証は <code>node scripts/verify-backup.mjs ファイル名</code> で行えます。
        </p>
        <button onClick={createBackup} disabled={busy}
          style={{ background: primary, color: '#fff', border: 'none', borderRadius: 9, padding: '10px 16px', fontWeight: 700, fontSize: 13.5, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1 }}>
          {busy ? '作成中…' : 'バックアップを作成'}
        </button>
        {msg && <div role="status" style={{ marginTop: 10, fontSize: 12.5, color: msg.type === 'ok' ? '#16a34a' : '#dc2626' }}>{msg.text}</div>}
      </div>

      {stepUp && (
        <div role="dialog" aria-modal="true" aria-labelledby="stepup-title"
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <form onSubmit={submitStepUp} style={{ ...box, width: '100%', maxWidth: 360, marginBottom: 0 }}>
            <div id="stepup-title" style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>パスワードの再入力</div>
            <p style={{ fontSize: 12.5, color: 'var(--text-sub)', margin: '0 0 10px' }}>重要な操作のため、ログイン中のアカウントのパスワードを入力してください。</p>
            <input type="password" autoComplete="current-password" autoFocus value={pass} onChange={e => setPass(e.target.value)}
              aria-label="パスワード"
              style={{ width: '100%', boxSizing: 'border-box', fontSize: 14, padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', marginBottom: 8 }} />
            {stepErr && <div role="alert" style={{ fontSize: 12, color: '#dc2626', marginBottom: 8 }}>{stepErr}</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={cancelStepUp} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', color: 'var(--text)' }}>キャンセル</button>
              <button type="submit" disabled={!pass} style={{ background: primary, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 700, cursor: 'pointer', opacity: pass ? 1 : 0.5 }}>確認</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
