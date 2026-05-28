/**
 * NearbyOfficesModal.jsx
 * 現在地から近くの地本・募集案内所を本格レーダーUIで表示するボトムシートモーダル
 *
 * Phase:
 *   idle → intro(初回のみ) → locating → dramatic → found
 *                              ↓
 *                           denied / error
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { ICO } from './Icons';
import { F }   from './Shared';
import { calcDistance, fetchOfficesData } from '../hooks/useOffices';

// ─── 定数 ────────────────────────────────────────────────────────
const GREEN       = '#00e060';
const GREEN_DIM   = '#00e06044';
const RADAR_BG    = '#010e1a';
const RADAR_PX    = 244;           // レーダー直径 (px)
const RADAR_R     = RADAR_PX / 2;  // レーダー半径 (px)
const DRAMATIC_MS = 2600;          // found 遷移までのディレイ
const STAGGER_MS  = 160;           // ブリップ出現時差
const INTRO_KEY   = 'jsdf-nearby-intro-seen';

// ─── CSS（一度だけ注入） ─────────────────────────────────────────
const MODAL_CSS = `
@keyframes radar-rotate {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
@keyframes nearby-slide-up {
  from { transform: translateY(100%); }
  to   { transform: translateY(0); }
}
@keyframes blip-appear {
  0%   { transform: translate(-50%,-50%) scale(0);   opacity: 0; }
  45%  { transform: translate(-50%,-50%) scale(2.8); opacity: 1; }
  100% { transform: translate(-50%,-50%) scale(1);   opacity: 1; }
}
@keyframes blip-glow {
  0%,100% { box-shadow: 0 0 3px 1px #00e06070; }
  50%      { box-shadow: 0 0 10px 3px #00e060bb; }
}
@keyframes center-pulse {
  0%,100% { box-shadow: 0 0 0  0px #ffffff50, 0 0 8px  #00e06070; }
  50%      { box-shadow: 0 0 0  7px transparent, 0 0 14px #00e060cc; }
}
@keyframes status-in {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0);   }
}
@keyframes intro-in {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0);    }
}
`;

// ─── 施設種別マスタ ────────────────────────────────────────────
const TYPE_INFO = {
  hq:          { short: '地本', bg: '#0b2545' },
  recruitment: { short: '募集', bg: '#16a34a' },
  cooperation: { short: '協力', bg: '#ea580c' },
};

// ─── ユーティリティ ────────────────────────────────────────────
/** 2 点間の真北起点方位角（deg, 0=N, 90=E） */
function calcBearing(lat1, lng1, lat2, lng2) {
  const r = d => d * Math.PI / 180;
  const y = Math.sin(r(lng2 - lng1)) * Math.cos(r(lat2));
  const x = Math.cos(r(lat1)) * Math.sin(r(lat2))
           - Math.sin(r(lat1)) * Math.cos(r(lat2)) * Math.cos(r(lng2 - lng1));
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

/** 対数スケールでレーダー半径に正規化（0.0–0.92） */
function normDist(km) {
  return Math.min(Math.log(Math.max(km, 0.1) + 1) / Math.log(1001), 0.92);
}

/** localStorage へのアクセス（エラー無視） */
function lsGet(k)   { try { return localStorage.getItem(k);     } catch { return null; } }
function lsSet(k,v) { try { localStorage.setItem(k, v);          } catch {} }

// ─────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────
export default function NearbyOfficesModal({ isOpen, onClose, theme }) {
  const { primary } = theme;

  const [phase,    setPhase]    = useState('idle');
  const [nearby,   setNearby]   = useState([]);
  const [userPos,  setUserPos]  = useState(null);  // { lat, lng }
  const [errorMsg, setErrorMsg] = useState('');

  const abortRef     = useRef(false);
  const timerRef     = useRef(null);
  const introSeen    = useRef(lsGet(INTRO_KEY) === '1');

  // アンマウント時クリーンアップ
  useEffect(() => () => clearTimeout(timerRef.current), []);

  // ─ 測位メイン ─────────────────────────────────────────────────
  const startLocating = useCallback(async () => {
    setPhase('locating');
    setNearby([]);
    setUserPos(null);
    setErrorMsg('');

    const officesPromise = fetchOfficesData().catch(() => null);

    if (!navigator.geolocation) {
      setPhase('error');
      setErrorMsg('このブラウザは位置情報に対応していません');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        if (abortRef.current) return;
        const { latitude: lat, longitude: lng } = pos.coords;

        const offices = await officesPromise;
        if (abortRef.current) return;

        if (!offices) {
          setPhase('error');
          setErrorMsg('施設データの取得に失敗しました');
          return;
        }

        const sorted = offices
          .map(o => ({
            ...o,
            dist:    calcDistance(lat, lng, o.lat, o.lng),
            bearing: calcBearing(lat, lng, o.lat, o.lng),
          }))
          .sort((a, b) => a.dist - b.dist)
          .slice(0, 15);

        setUserPos({ lat, lng });
        setNearby(sorted);
        setPhase('dramatic');            // レーダー演出フェーズ

        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          if (!abortRef.current) setPhase('found');
        }, DRAMATIC_MS);
      },
      (err) => {
        if (abortRef.current) return;
        if (err.code === 1) {
          setPhase('denied');
        } else {
          setPhase('error');
          setErrorMsg('現在地の取得に失敗しました（タイムアウトまたはエラー）');
        }
      },
      { timeout: 15000, maximumAge: 60000 },
    );
  }, []);

  // ─ isOpen 変化に連動 ───────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) {
      abortRef.current = true;
      clearTimeout(timerRef.current);
      setPhase('idle');
      setNearby([]);
      setUserPos(null);
      setErrorMsg('');
      return;
    }
    abortRef.current = false;
    if (!introSeen.current) {
      setPhase('intro');        // 初回のみ説明画面
    } else {
      startLocating();
    }
  }, [isOpen, startLocating]);

  function handleIntroConfirm() {
    lsSet(INTRO_KEY, '1');
    introSeen.current = true;
    startLocating();
  }

  if (!isOpen) return null;

  const showRadar = phase === 'locating' || phase === 'dramatic';

  return (
    <>
      <style>{MODAL_CSS}</style>

      {/* ── 背景オーバーレイ ─────────────────────────────────────── */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute', inset: 0,
          background: 'rgba(0,0,0,0.52)',
          backdropFilter: 'blur(3px)',
          zIndex: 200,
        }}
      />

      {/* ── ボトムシート ─────────────────────────────────────────── */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        background: 'var(--bg)',
        borderRadius: '20px 20px 0 0',
        boxShadow: '0 -4px 40px rgba(0,0,0,0.28)',
        zIndex: 201,
        display: 'flex', flexDirection: 'column',
        maxHeight: '86vh',
        animation: 'nearby-slide-up 0.28s ease-out',
      }}>

        {/* ドラッグハンドル */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10, flexShrink: 0 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)' }} />
        </div>

        {/* ヘッダー */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 20px 10px', flexShrink: 0,
        }}>
          <div style={{ fontFamily: F.serif, fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>
            近くの施設
          </div>
          <button
            onClick={onClose} aria-label="閉じる"
            style={{
              width: 32, height: 32, borderRadius: 8, border: 'none',
              background: 'var(--border)', cursor: 'pointer', padding: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {ICO.close('#6b7280', 14)}
          </button>
        </div>

        {/* コンテンツ */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 48px' }}>
          {phase === 'intro'  && <IntroView onConfirm={handleIntroConfirm} onCancel={onClose} primary={primary} />}
          {showRadar          && <RadarScreen phase={phase} nearby={nearby} />}
          {phase === 'found'  && <OfficeList offices={nearby} primary={primary} />}
          {phase === 'denied' && <DeniedView onRetry={startLocating} primary={primary} />}
          {phase === 'error'  && <ErrorView  msg={errorMsg} onRetry={startLocating} primary={primary} />}
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────
// IntroView — 初回のみ表示する位置情報の説明画面
// ─────────────────────────────────────────────────────────────────
function IntroView({ onConfirm, onCancel, primary }) {
  return (
    <div style={{ padding: '4px 0 16px', animation: 'intro-in 0.35s ease-out' }}>

      {/* アイコン + タイトル */}
      <div style={{ textAlign: 'center', marginBottom: 22 }}>
        <div style={{
          width: 60, height: 60, borderRadius: '50%',
          background: `${primary}18`, margin: '0 auto 14px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 30,
        }}>
          📍
        </div>
        <div style={{ fontFamily: F.serif, fontSize: 17, fontWeight: 700, color: 'var(--text)', lineHeight: 1.4 }}>
          現在地を使って施設を探す
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.7 }}>
          近くの自衛隊地方協力本部（地本）と<br />
          募集案内所を距離順に表示します
        </div>
      </div>

      {/* プライバシー説明カード */}
      <div style={{
        background: 'var(--card)', borderRadius: 14,
        border: '1px solid var(--border)',
        padding: '14px 16px', marginBottom: 20,
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 12, letterSpacing: 0.2 }}>
          🛡️ プライバシーについて
        </div>
        {[
          '位置情報は端末内でのみ処理されます',
          '外部サーバーへの送信はありません',
          '検索ボタンを押した時のみ一時的に使用します',
        ].map((text, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 9,
            fontSize: 12, color: 'var(--text-muted)',
            marginTop: i > 0 ? 9 : 0,
          }}>
            {ICO.check('#16a34a', 13)}
            <span>{text}</span>
          </div>
        ))}
      </div>

      {/* 確認ボタン */}
      <button
        onClick={onConfirm}
        style={{
          width: '100%', height: 48, borderRadius: 12, border: 'none',
          background: primary, color: '#fff',
          fontSize: 15, fontWeight: 700, fontFamily: F.sans,
          cursor: 'pointer', letterSpacing: 0.3,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}
      >
        {ICO.locator('#fff', 17)} 現在地を使って検索する
      </button>

      {/* キャンセル */}
      <button
        onClick={onCancel}
        style={{
          width: '100%', marginTop: 10, padding: '10px 0',
          background: 'none', border: 'none',
          fontSize: 13, color: 'var(--text-muted)',
          cursor: 'pointer', fontFamily: F.sans,
        }}
      >
        キャンセル
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// RadarScreen — レーダーUI全体（locating / dramatic フェーズ）
// ─────────────────────────────────────────────────────────────────
function RadarScreen({ phase, nearby }) {
  const isDramatic = phase === 'dramatic';

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '18px 0 28px',
    }}>

      {/* ─ レーダー円 ─ */}
      <RadarCircle blips={isDramatic ? nearby : []} />

      {/* ─ ステータステキスト ─ */}
      <div
        key={phase}   /* phase 変化で再アニメーション */
        style={{ marginTop: 22, textAlign: 'center', animation: 'status-in 0.4s ease-out' }}
      >
        <div style={{
          fontSize: 15, fontWeight: 700, color: GREEN,
          letterSpacing: 0.4, lineHeight: 1.4,
        }}>
          {isDramatic
            ? `⚡ ${nearby.length} 件の施設を検出`
            : '📡 スキャン中...'}
        </div>
        <div style={{
          fontSize: 12, color: 'var(--text-muted)', marginTop: 5, lineHeight: 1.6,
        }}>
          {isDramatic
            ? '距離を計算しています...'
            : '現在地と施設データを取得しています'}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// RadarCircle — 実際のレーダー描画（グリーン・スイープアーム・ブリップ）
// ─────────────────────────────────────────────────────────────────
function RadarCircle({ blips }) {
  return (
    <div style={{
      width:  RADAR_PX,
      height: RADAR_PX,
      borderRadius: '50%',
      position: 'relative',
      background: RADAR_BG,
      border: `2px solid ${GREEN}66`,
      boxShadow: `0 0 28px ${GREEN}22, 0 0 60px ${GREEN}0a, inset 0 0 40px rgba(0,0,0,0.6)`,
      overflow: 'hidden',
      flexShrink: 0,
    }}>

      {/* ── 同心円（距離リング）── */}
      {[0.33, 0.66, 1.0].map(r => (
        <div key={r} style={{
          position: 'absolute',
          borderRadius: '50%',
          border: `1px solid ${r < 1 ? GREEN + '22' : GREEN + '44'}`,
          width:  `${r * 100}%`,
          height: `${r * 100}%`,
          top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
        }} />
      ))}

      {/* ── 十字線 ── */}
      <div style={{
        position: 'absolute', top: 0, bottom: 0, left: '50%', width: 1,
        background: `${GREEN}1a`, transform: 'translateX(-50%)', pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', left: 0, right: 0, top: '50%', height: 1,
        background: `${GREEN}1a`, transform: 'translateY(-50%)', pointerEvents: 'none',
      }} />

      {/* ── 斜め補助線 ── */}
      {[45, 135].map(deg => (
        <div key={deg} style={{
          position: 'absolute', top: '50%', left: '50%',
          width: RADAR_PX * 1.42, height: 1,
          background: `${GREEN}0d`,
          transform: `translate(-50%, -50%) rotate(${deg}deg)`,
          pointerEvents: 'none',
        }} />
      ))}

      {/* ── スキャンラインオーバーレイ（CRT感） ── */}
      <div style={{
        position: 'absolute', inset: 0, borderRadius: '50%',
        backgroundImage: `repeating-linear-gradient(0deg, transparent 0px, transparent 3px, rgba(0,0,0,0.07) 3px, rgba(0,0,0,0.07) 4px)`,
        pointerEvents: 'none', zIndex: 5,
      }} />

      {/* ── スイープアーム（コニックグラデーション回転）── */}
      <div style={{
        position: 'absolute', inset: 0, borderRadius: '50%',
        background: `conic-gradient(
          from 0deg,
          ${GREEN}90 0deg 2deg,
          ${GREEN}55 2deg 8deg,
          ${GREEN}28 8deg 20deg,
          ${GREEN}10 20deg 45deg,
          ${GREEN}04 45deg 75deg,
          transparent 75deg 360deg
        )`,
        animation: 'radar-rotate 2.5s linear infinite',
        zIndex: 3,
      }} />

      {/* ── 施設ブリップ（方位・距離から位置計算）── */}
      {blips.map((o, i) => {
        if (o.lat == null || o.lng == null) return null;
        const toRad = d => d * Math.PI / 180;
        const nr    = normDist(o.dist) * RADAR_R;
        const bx    = nr * Math.sin(toRad(o.bearing));
        const by    = -nr * Math.cos(toRad(o.bearing));
        const cx    = RADAR_R + bx;
        const cy    = RADAR_R + by;
        const delay = i * STAGGER_MS;

        return (
          <div key={o.id} style={{
            position: 'absolute',
            left: cx, top: cy,
            width: 7, height: 7,
            borderRadius: '50%',
            background: i === 0 ? '#ffffff' : GREEN,
            transform: 'translate(-50%, -50%) scale(0)',
            animation: [
              `blip-appear 0.45s ease-out ${delay}ms forwards`,
              `blip-glow   2.0s ease-in-out ${delay + 450}ms infinite`,
            ].join(', '),
            zIndex: 10,
            boxShadow: i === 0
              ? `0 0 6px 2px #ffffff88, 0 0 12px ${GREEN}aa`
              : undefined,
          }} />
        );
      })}

      {/* ── 中心点（現在地）── */}
      <div style={{
        position: 'absolute', left: '50%', top: '50%',
        width: 7, height: 7, borderRadius: '50%',
        background: '#ffffff',
        transform: 'translate(-50%, -50%)',
        animation: 'center-pulse 2.2s ease-in-out infinite',
        zIndex: 20,
      }} />

      {/* ── 光沢オーバーレイ ── */}
      <div style={{
        position: 'absolute', inset: 0, borderRadius: '50%',
        background: 'radial-gradient(ellipse 60% 40% at 35% 25%, rgba(0,255,100,0.06) 0%, transparent 70%)',
        pointerEvents: 'none', zIndex: 15,
      }} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// OfficeList / OfficeCard — 施設一覧
// ─────────────────────────────────────────────────────────────────
function OfficeList({ offices, primary }) {
  if (offices.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '44px 0', color: 'var(--text-muted)', fontSize: 14 }}>
        近くの施設が見つかりませんでした
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2, letterSpacing: 0.2 }}>
        現在地から近い順 · {offices.length} 件
      </div>
      {offices.map((o, i) => (
        <OfficeCard key={o.id} office={o} rank={i} primary={primary} />
      ))}
    </div>
  );
}

function OfficeCard({ office, rank, primary }) {
  const typeInfo = TYPE_INFO[office.type] ?? TYPE_INFO.hq;
  const isTop    = rank === 0;

  const distText = office.dist < 1
    ? `${Math.round(office.dist * 1000)} m`
    : `${office.dist.toFixed(1)} km`;

  const mapsUrl = (office.lat && office.lng)
    ? `https://maps.google.com/maps?q=${office.lat},${office.lng}&z=16`
    : `https://maps.google.com/maps?q=${encodeURIComponent(office.address ?? office.name)}`;

  return (
    <div style={{
      background: 'var(--card)',
      border: isTop ? `1.5px solid ${primary}44` : '1px solid var(--border)',
      borderRadius: 12, padding: '12px 14px',
      boxShadow: isTop ? `0 2px 12px ${primary}16` : 'none',
    }}>

      {/* 種別バッジ・名称・距離 */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{
          flexShrink: 0, marginTop: 2, padding: '2px 7px', borderRadius: 5,
          background: isTop ? primary : typeInfo.bg,
          color: '#fff', fontSize: 10, fontWeight: 700, letterSpacing: 0.3,
        }}>
          {typeInfo.short}
        </div>
        <div style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, color: 'var(--text)', lineHeight: 1.35 }}>
          {office.name}
        </div>
        <div style={{
          flexShrink: 0, fontSize: 13, fontWeight: 700, fontFamily: F.mono,
          color: isTop ? primary : 'var(--text-muted)',
        }}>
          {distText}
        </div>
      </div>

      {/* 住所 */}
      {office.address && (
        <div style={{
          marginTop: 6, fontSize: 11, color: 'var(--text-muted)',
          lineHeight: 1.5, display: 'flex', alignItems: 'flex-start', gap: 4,
        }}>
          {ICO.pin('var(--text-muted)', 11)}
          <span style={{ flex: 1 }}>{office.address}</span>
        </div>
      )}

      {/* アクションボタン */}
      <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
        <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
          style={btnStyle(`${primary}14`, `${primary}33`, primary)}>
          {ICO.map(primary, 12)} 地図で開く
        </a>
        {office.tel && (
          <a href={`tel:${office.tel.replace(/[^\d+]/g, '')}`}
            style={btnStyle('#16a34a14', '#16a34a33', '#16a34a')}>
            {ICO.phone('#16a34a', 12)} 電話する
          </a>
        )}
        {office.url && (
          <a href={office.url} target="_blank" rel="noopener noreferrer"
            style={btnStyle('#6b728014', '#6b728033', '#6b7280')}>
            {ICO.extLink('#6b7280', 11)} 公式
          </a>
        )}
      </div>
    </div>
  );
}

function btnStyle(bg, border, color) {
  return {
    flex: 1, height: 34, borderRadius: 8,
    background: bg, border: `1px solid ${border}`, color,
    fontSize: 12, fontWeight: 600, fontFamily: F.sans,
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
    textDecoration: 'none', cursor: 'pointer',
  };
}

// ─────────────────────────────────────────────────────────────────
// DeniedView / ErrorView
// ─────────────────────────────────────────────────────────────────
function DeniedView({ onRetry, primary }) {
  return (
    <div style={{ textAlign: 'center', padding: '44px 16px 52px', animation: 'intro-in 0.35s ease-out' }}>
      <div style={{ fontSize: 42, marginBottom: 14 }}>🔒</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>
        位置情報の使用が拒否されました
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.8, marginBottom: 24 }}>
        設定アプリからブラウザの<br />
        位置情報アクセスを許可してから<br />
        再度お試しください
      </div>
      <button onClick={onRetry} style={retryBtnStyle(primary)}>
        {ICO.refresh('#fff', 14)} 再試行
      </button>
    </div>
  );
}

function ErrorView({ msg, onRetry, primary }) {
  return (
    <div style={{ textAlign: 'center', padding: '44px 16px 52px', animation: 'intro-in 0.35s ease-out' }}>
      <div style={{ fontSize: 42, marginBottom: 14 }}>⚠️</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>
        エラーが発生しました
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: 24 }}>
        {msg}
      </div>
      <button onClick={onRetry} style={retryBtnStyle(primary)}>
        {ICO.refresh('#fff', 14)} 再試行
      </button>
    </div>
  );
}

function retryBtnStyle(primary) {
  return {
    padding: '10px 28px', borderRadius: 10, border: 'none',
    background: primary, color: '#fff',
    fontSize: 14, fontWeight: 600, fontFamily: F.sans, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 7,
  };
}
