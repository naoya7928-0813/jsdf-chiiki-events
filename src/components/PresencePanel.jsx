import { useState, useEffect, useCallback, useRef } from 'react';
import { F } from './Shared';

// 在席状況パネル（誰がログイン中か）。
// Slack/Discord のように、運営メンバーの横に 在席中(緑)/離席中(黄)/オフライン(灰) を表示する。
// 権限・スコープはサーバー側（/api/admin/presence, account:read 必須）で強制。
// 個人名は出さず displayId（仮名）で扱う（氏名は運営台帳で対応表管理）。

const POLL_MS = 20000; // 自動更新間隔（この間隔で状態が更新される）

const STATE_META = {
  online:  { label: '在席中',      color: '#16a34a', filled: true  },
  away:    { label: '離席中',      color: '#f59e0b', filled: true  },
  // アカウント自体は存在し、いまログインしていない状態＝ログアウト中
  offline: { label: 'ログアウト中', color: '#9ca3af', filled: false },
};
const ROLE_LABEL = {
  pco_admin:      '所長・担当官',
  office_manager: '事務所責任者',
  office_editor:  '一般広報官',
  national_admin: '全国管理',
  auditor:        '監査',
  system_admin:   'システム管理',
};

// 経過秒 → 相対表記（最終アクティビティからの経過）
function fmtAgo(state, agoSec) {
  if (agoSec == null) return '';   // 一度もログインしていない既存アカウント → 補足なし
  if (state === 'online') return agoSec < 60 ? 'たった今まで操作' : `${Math.floor(agoSec / 60)}分前まで操作`;
  const min = Math.floor(agoSec / 60);
  const prefix = state === 'offline' ? '最終ログイン ' : '';
  if (agoSec < 60) return `${prefix}数十秒前`;
  if (min < 60) return `${prefix}${min}分前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${prefix}${h}時間前`;
  return `${prefix}${Math.floor(h / 24)}日前`;
}
function fmtClock(iso) {
  try { return new Date(iso).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Tokyo' }); }
  catch { return ''; }
}

// 状態ドット（色だけに頼らず、テキストラベルも併記してアクセシブルに）
function StatusDot({ state, size = 12 }) {
  const m = STATE_META[state] || STATE_META.offline;
  return (
    <span aria-label={m.label} title={m.label} style={{
      display: 'inline-block', width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: m.filled ? m.color : 'transparent',
      border: `2px solid ${m.color}`,
      boxShadow: state === 'online' ? `0 0 0 3px ${m.color}22` : 'none',
    }} />
  );
}

export default function PresencePanel({ adminFetch, primary }) {
  const [data, setData] = useState(null);   // { now, counts, members, ... }
  const [status, setStatus] = useState('loading'); // loading | ok | error | forbidden
  const [updatedAt, setUpdatedAt] = useState(null);
  const timer = useRef(null);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setStatus(s => (s === 'ok' ? 'ok' : 'loading'));
    try {
      const r = await adminFetch('/api/admin/presence');
      if (r.status === 403) { setStatus('forbidden'); return; }
      if (!r.ok) { setStatus('error'); return; }
      const j = await r.json();
      setData(j); setUpdatedAt(new Date()); setStatus('ok');
    } catch { setStatus('error'); }
  }, [adminFetch]);

  // 初回＋一定間隔で自動更新。タブに戻ったときも即更新。
  useEffect(() => {
    load();
    timer.current = setInterval(() => load({ quiet: true }), POLL_MS);
    const onVis = () => { if (document.visibilityState === 'visible') load({ quiet: true }); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onVis);
    return () => {
      clearInterval(timer.current);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onVis);
    };
  }, [load]);

  const counts = data?.counts || { online: 0, away: 0, offline: 0, total: 0 };

  const card = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12 };
  const chip = (color, n, label) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 999, background: `${color}14`, border: `1px solid ${color}33` }}>
      <StatusDot state={label === '在席中' ? 'online' : label === '離席中' ? 'away' : 'offline'} size={9} />
      <span style={{ fontSize: 12, color: 'var(--text)', fontWeight: 700, fontFamily: F.mono }}>{n}</span>
      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</span>
    </div>
  );

  return (
    <div>
      {/* ヘッダー: タイトル＋更新状況＋手動更新 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', flex: 1 }}>
          在席状況{data ? `（${counts.total}名）` : ''}
        </div>
        <button onClick={() => load()} style={{
          fontSize: 11.5, fontWeight: 600, cursor: 'pointer', borderRadius: 7, padding: '5px 10px',
          color: primary, background: 'transparent', border: `1px solid ${primary}55`,
        }}>更新</button>
      </div>

      {/* サマリー */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        {chip('#16a34a', counts.online, '在席中')}
        {chip('#f59e0b', counts.away, '離席中')}
        {chip('#9ca3af', counts.offline, 'ログアウト中')}
      </div>

      {status === 'forbidden' && (
        <div style={{ ...card, padding: '14px', fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.7 }}>
          在席状況を閲覧する権限がありません（所長・担当官のみ）。
        </div>
      )}
      {status === 'error' && (
        <div style={{ ...card, padding: '14px', fontSize: 12.5, color: '#ef4444' }}>
          取得に失敗しました。「更新」で再試行してください。
        </div>
      )}
      {status === 'loading' && !data && (
        <div style={{ ...card, padding: '14px', fontSize: 12.5, color: 'var(--text-muted)' }}>読み込み中…</div>
      )}

      {data && (status === 'ok' || status === 'loading') && (
        <>
          <div style={card}>
            {data.members.length === 0 ? (
              <div style={{ padding: '14px', fontSize: 12.5, color: 'var(--text-muted)' }}>メンバーがいません。</div>
            ) : data.members.map((m, i) => {
              const meta = STATE_META[m.state] || STATE_META.offline;
              return (
                <div key={m.displayId + i} style={{
                  display: 'flex', alignItems: 'center', gap: 11, padding: '11px 13px',
                  borderTop: i ? '1px solid var(--sep)' : 'none',
                  background: m.self ? `${primary}08` : 'transparent',
                }}>
                  <StatusDot state={m.state} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)', fontFamily: F.mono }}>{m.displayId}</span>
                      {m.self && <span style={{ fontSize: 9.5, fontWeight: 700, color: primary, background: `${primary}18`, borderRadius: 4, padding: '1px 6px' }}>自分</span>}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                      {ROLE_LABEL[m.role] || m.role || '—'}{m.office ? `・${m.office}` : ''}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: meta.color }}>{meta.label}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 1 }}>{fmtAgo(m.state, m.agoSec)}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 凡例＋注記 */}
          <div style={{ marginTop: 10, padding: '10px 12px', ...card, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.8 }}>
            <div><b style={{ color: '#16a34a' }}>在席中</b>＝直近{Math.round((data.onlineWindowSec || 180) / 60)}分以内に操作／
              <b style={{ color: '#f59e0b' }}>離席中</b>＝ログイン中だが操作なし／
              <b style={{ color: '#9ca3af' }}>ログアウト中</b>＝アカウントは有効・現在ログインしていない</div>
            <div style={{ marginTop: 4 }}>
              約{POLL_MS / 1000}秒ごとに自動更新
              {updatedAt ? `（最終更新 ${fmtClock(updatedAt.toISOString())}）` : ''}。
              表示名は仮名IDです（氏名は運営台帳で確認）。
            </div>
          </div>
        </>
      )}
    </div>
  );
}
