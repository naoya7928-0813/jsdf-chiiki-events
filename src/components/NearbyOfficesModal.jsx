/**
 * NearbyOfficesModal.jsx — 近くの施設を現在地から検索するボトムシートモーダル
 *
 * 状態遷移: idle → locating（ソナーアニメーション）→ found / denied / error
 *
 * 対応施設種別:
 *   hq          … 地方協力本部（地本）
 *   recruitment … 募集案内所
 *   cooperation … 協力案内所
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { ICO }                 from './Icons';
import { F }                   from './Shared';
import { calcDistance, fetchOfficesData } from '../hooks/useOffices';

// ─── CSS インジェクション ────────────────────────────────────────
const MODAL_STYLE = `
@keyframes sonar-ring {
  0%   { transform: scale(0.25); opacity: 0.9; }
  100% { transform: scale(4.8);  opacity: 0;   }
}
@keyframes nearby-slide-up {
  from { transform: translateY(100%); }
  to   { transform: translateY(0);    }
}
.sonar-ring {
  position: absolute;
  width: 60px; height: 60px;
  border-radius: 50%;
  border: 2px solid currentColor;
  animation: sonar-ring 2.1s ease-out infinite;
  pointer-events: none;
}
.sonar-ring:nth-child(1) { animation-delay: 0s;    }
.sonar-ring:nth-child(2) { animation-delay: 0.7s;  }
.sonar-ring:nth-child(3) { animation-delay: 1.4s;  }
`;

// ─── 施設種別マスタ ───────────────────────────────────────────────
const TYPE_INFO = {
  hq:          { label: '地方協力本部', short: '地本', bg: '#0b2545', text: '#fff' },
  recruitment: { label: '募集案内所',   short: '募集', bg: '#16a34a', text: '#fff' },
  cooperation: { label: '協力案内所',   short: '協力', bg: '#ea580c', text: '#fff' },
};

// ─── メインコンポーネント ─────────────────────────────────────────
export default function NearbyOfficesModal({ isOpen, onClose, theme }) {
  const { primary } = theme;

  // phase: 'idle' | 'locating' | 'found' | 'denied' | 'error'
  const [phase,    setPhase]    = useState('idle');
  const [nearby,   setNearby]   = useState([]);
  const [errorMsg, setErrorMsg] = useState('');
  const abortRef = useRef(false);   // モーダルが閉じられたら abort フラグを立てる

  const startLocating = useCallback(async () => {
    setPhase('locating');
    setNearby([]);
    setErrorMsg('');

    // offices.json フェッチと Geolocation を並行実行
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
        if (!offices) {
          if (abortRef.current) return;
          setPhase('error');
          setErrorMsg('施設データの取得に失敗しました');
          return;
        }
        const sorted = offices
          .map(o => ({ ...o, dist: calcDistance(lat, lng, o.lat, o.lng) }))
          .sort((a, b) => a.dist - b.dist)
          .slice(0, 15);
        if (abortRef.current) return;
        setNearby(sorted);
        setPhase('found');
      },
      (err) => {
        if (abortRef.current) return;
        if (err.code === 1 /* PERMISSION_DENIED */) {
          setPhase('denied');
        } else {
          setPhase('error');
          setErrorMsg('現在地の取得に失敗しました（タイムアウトまたはエラー）');
        }
      },
      { timeout: 15000, maximumAge: 60000 },
    );
  }, []);

  // モーダル開閉に連動して状態リセット ＋ 測位開始
  useEffect(() => {
    if (!isOpen) {
      abortRef.current = true;
      setPhase('idle');
      setNearby([]);
      setErrorMsg('');
      return;
    }
    abortRef.current = false;
    startLocating();
  }, [isOpen, startLocating]);

  if (!isOpen) return null;

  return (
    <>
      <style>{MODAL_STYLE}</style>

      {/* ── 背景オーバーレイ ── */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute', inset: 0,
          background: 'rgba(0,0,0,0.48)',
          backdropFilter: 'blur(2px)',
          zIndex: 200,
        }}
      />

      {/* ── ボトムシート ── */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        background: 'var(--bg)',
        borderRadius: '20px 20px 0 0',
        boxShadow: '0 -4px 32px rgba(0,0,0,0.22)',
        zIndex: 201,
        display: 'flex', flexDirection: 'column',
        maxHeight: '82vh',
        animation: 'nearby-slide-up 0.28s ease-out',
      }}>

        {/* ドラッグハンドル */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10, flexShrink: 0 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)' }} />
        </div>

        {/* ヘッダー */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 20px 10px', flexShrink: 0,
        }}>
          <div>
            <div style={{ fontFamily: F.serif, fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>
              近くの施設
            </div>
            {phase === 'found' && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                地本・募集案内所を現在地から近い順に表示
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="閉じる"
            style={{
              width: 32, height: 32, borderRadius: 8,
              border: 'none', background: 'var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', padding: 0, flexShrink: 0,
            }}
          >
            {ICO.close('#6b7280', 14)}
          </button>
        </div>

        {/* コンテンツ領域（スクロール可能） */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 16px 40px' }}>
          {phase === 'locating' && <SonarView  primary={primary} />}
          {phase === 'found'    && <OfficeList offices={nearby} primary={primary} />}
          {phase === 'denied'   && <DeniedView onRetry={startLocating} primary={primary} />}
          {phase === 'error'    && <ErrorView  msg={errorMsg} onRetry={startLocating} primary={primary} />}
        </div>
      </div>
    </>
  );
}

// ─── ソナー待機ビュー ────────────────────────────────────────────
function SonarView({ primary }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '52px 0 60px',
    }}>
      {/* ソナーアニメーション */}
      <div style={{
        position: 'relative',
        width: 80, height: 80,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: primary,
      }}>
        <div className="sonar-ring" />
        <div className="sonar-ring" />
        <div className="sonar-ring" />
        {/* 中心のロケーターアイコン */}
        <div style={{
          position: 'relative', zIndex: 1,
          width: 48, height: 48, borderRadius: '50%',
          background: primary,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 0 20px ${primary}55`,
        }}>
          {ICO.locator('#fff', 24)}
        </div>
      </div>

      <div style={{
        marginTop: 28, fontSize: 15, fontWeight: 600,
        color: 'var(--text)', letterSpacing: 0.3,
      }}>
        現在地を取得中...
      </div>
      <div style={{
        marginTop: 8, fontSize: 12, color: 'var(--text-muted)',
        textAlign: 'center', lineHeight: 1.7,
      }}>
        位置情報の使用を許可してください
      </div>
    </div>
  );
}

// ─── 施設一覧ビュー ──────────────────────────────────────────────
function OfficeList({ offices, primary }) {
  if (offices.length === 0) {
    return (
      <div style={{
        textAlign: 'center', padding: '40px 0',
        color: 'var(--text-muted)', fontSize: 14,
      }}>
        近くの施設が見つかりませんでした
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{
        fontSize: 11, color: 'var(--text-muted)',
        marginBottom: 2, letterSpacing: 0.2,
      }}>
        現在地から近い順に {offices.length} 件
      </div>
      {offices.map((o, i) => (
        <OfficeCard key={o.id} office={o} rank={i} primary={primary} />
      ))}
    </div>
  );
}

// ─── 施設カード ──────────────────────────────────────────────────
function OfficeCard({ office, rank, primary }) {
  const typeInfo = TYPE_INFO[office.type] ?? TYPE_INFO.hq;

  // 距離テキスト
  const distText = office.dist < 1
    ? `${Math.round(office.dist * 1000)} m`
    : `${office.dist.toFixed(1)} km`;

  // Google Maps URL（緯度経度優先、なければ住所）
  const mapsUrl = (office.lat && office.lng)
    ? `https://maps.google.com/maps?q=${office.lat},${office.lng}&z=16`
    : `https://maps.google.com/maps?q=${encodeURIComponent(office.address ?? office.name)}`;

  // 最も近い施設（rank=0）はプライマリカラーで強調
  const accentColor  = rank === 0 ? primary : typeInfo.bg;
  const isTop        = rank === 0;

  return (
    <div style={{
      background: 'var(--card)',
      border: isTop ? `1.5px solid ${primary}44` : '1px solid var(--border)',
      borderRadius: 12,
      padding: '12px 14px',
      boxShadow: isTop ? `0 2px 12px ${primary}18` : 'none',
    }}>
      {/* 上段: 種別バッジ・名称・距離 */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        {/* 種別バッジ */}
        <div style={{
          flexShrink: 0, marginTop: 2,
          padding: '2px 7px', borderRadius: 5,
          background: accentColor, color: '#fff',
          fontSize: 10, fontWeight: 700, letterSpacing: 0.3,
          whiteSpace: 'nowrap',
        }}>
          {typeInfo.short}
        </div>

        {/* 施設名 */}
        <div style={{
          flex: 1, minWidth: 0,
          fontSize: 14, fontWeight: 600,
          color: 'var(--text)', lineHeight: 1.35,
        }}>
          {office.name}
        </div>

        {/* 距離 */}
        <div style={{
          flexShrink: 0,
          fontSize: 13, fontWeight: 700, fontFamily: F.mono,
          color: isTop ? primary : 'var(--text-muted)',
        }}>
          {distText}
        </div>
      </div>

      {/* 住所 */}
      {office.address && (
        <div style={{
          marginTop: 6, fontSize: 11,
          color: 'var(--text-muted)', lineHeight: 1.5,
          display: 'flex', alignItems: 'flex-start', gap: 4,
        }}>
          {ICO.pin('var(--text-muted)', 11)}
          <span style={{ flex: 1 }}>{office.address}</span>
        </div>
      )}

      {/* アクションボタン行 */}
      <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
        {/* 地図で開く */}
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            flex: 1, height: 34, borderRadius: 8,
            background: `${primary}14`, border: `1px solid ${primary}33`,
            color: primary, fontSize: 12, fontWeight: 600,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            textDecoration: 'none', cursor: 'pointer',
          }}
        >
          {ICO.map(primary, 12)} 地図で開く
        </a>

        {/* 電話する（tel があるときのみ） */}
        {office.tel && (
          <a
            href={`tel:${office.tel.replace(/[^\d+]/g, '')}`}
            style={{
              flex: 1, height: 34, borderRadius: 8,
              background: '#16a34a14', border: '1px solid #16a34a33',
              color: '#16a34a', fontSize: 12, fontWeight: 600,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              textDecoration: 'none', cursor: 'pointer',
            }}
          >
            {ICO.phone('#16a34a', 12)} 電話する
          </a>
        )}

        {/* 公式サイト（url があるときのみ） */}
        {office.url && (
          <a
            href={office.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              flex: 1, height: 34, borderRadius: 8,
              background: '#6b728014', border: '1px solid #6b728033',
              color: '#6b7280', fontSize: 12, fontWeight: 600,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              textDecoration: 'none', cursor: 'pointer',
            }}
          >
            {ICO.extLink('#6b7280', 11)} 公式
          </a>
        )}
      </div>
    </div>
  );
}

// ─── GPS 拒否ビュー ──────────────────────────────────────────────
function DeniedView({ onRetry, primary }) {
  return (
    <div style={{ textAlign: 'center', padding: '44px 16px 52px' }}>
      <div style={{ fontSize: 40, marginBottom: 14 }}>🔒</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>
        位置情報の使用が拒否されました
      </div>
      <div style={{
        fontSize: 12, color: 'var(--text-muted)',
        lineHeight: 1.8, marginBottom: 24,
      }}>
        設定アプリからブラウザの<br />
        位置情報アクセスを許可してから<br />
        再度お試しください
      </div>
      <button
        onClick={onRetry}
        style={{
          padding: '10px 28px', borderRadius: 10, border: 'none',
          background: primary, color: '#fff',
          fontSize: 14, fontWeight: 600, fontFamily: F.sans,
          cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}
      >
        {ICO.refresh('#fff', 14)} 再試行
      </button>
    </div>
  );
}

// ─── エラービュー ────────────────────────────────────────────────
function ErrorView({ msg, onRetry, primary }) {
  return (
    <div style={{ textAlign: 'center', padding: '44px 16px 52px' }}>
      <div style={{ fontSize: 40, marginBottom: 14 }}>⚠️</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>
        エラーが発生しました
      </div>
      <div style={{
        fontSize: 12, color: 'var(--text-muted)',
        lineHeight: 1.7, marginBottom: 24,
      }}>
        {msg}
      </div>
      <button
        onClick={onRetry}
        style={{
          padding: '10px 28px', borderRadius: 10, border: 'none',
          background: primary, color: '#fff',
          fontSize: 14, fontWeight: 600, fontFamily: F.sans,
          cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}
      >
        {ICO.refresh('#fff', 14)} 再試行
      </button>
    </div>
  );
}
