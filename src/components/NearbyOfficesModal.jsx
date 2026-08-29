/**
 * NearbyOfficesModal.jsx
 * 現在地から近くの地本・募集案内所等をレーダーUIで表示するボトムシートモーダル
 *
 * Phase:
 *   idle → intro(初回のみ) → locating → dramatic → found
 *                              ↓
 *                           denied / error
 *
 * サウンド: Web Audio API でソナーエコー音を合成
 *   - locating: 2.5秒ごとにスイープping + エコー
 *   - dramatic: ブリップ出現ごとに検出ping
 *   - found: ロックオン音
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { ICO } from './Icons';
import { F }   from './Shared';
import { calcDistance, fetchOfficesData } from '../hooks/useOffices';

// ─── 定数 ────────────────────────────────────────────────────────
const GREEN       = '#00e060';
const RADAR_PX    = 244;
const RADAR_R     = RADAR_PX / 2;
const DRAMATIC_MS = 2800;
const SWEEP_MS    = 2500;  // CSS animation と同期
const INTRO_KEY   = 'jsdf-nearby-intro-seen';

// ─── CSS ────────────────────────────────────────────────────────
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
/* スイープアーム通過時フラッシュ（グリーンのみ・白い光は使わない） */
@keyframes blip-pass {
  0%   { box-shadow: 0 0 18px 8px #00e060ff, 0 0 36px 16px #00e06088; opacity: 1; }
  10%  { box-shadow: 0 0 10px 4px #00e060cc; opacity: 0.95; }
  100% { box-shadow: 0 0 2px  1px #00e06033; opacity: 0.55; }
}
/* 最近傍を少し強めに光らせる（同じくグリーン） */
@keyframes blip-pass-strong {
  0%   { box-shadow: 0 0 22px 10px #00e060ff, 0 0 44px 20px #00e060aa; opacity: 1; }
  10%  { box-shadow: 0 0 12px 5px #00e060dd; opacity: 0.97; }
  100% { box-shadow: 0 0 3px  1px #00e06044; opacity: 0.7; }
}
/* JPN ラベル出現 */
@keyframes blip-label-appear {
  from { opacity: 0; transform: translate(-50%, 0) scale(0.7); }
  to   { opacity: 0.9; transform: translate(-50%, 0) scale(1); }
}
@keyframes center-pulse {
  0%,100% { box-shadow: 0 0 0  0px #00e06060, 0 0 8px  #00e06070; }
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
  hq:          { short: '地本',  bg: '#0b2545' },
  recruitment: { short: '窓口',  bg: '#16a34a' },
  cooperation: { short: '協力',  bg: '#ea580c' },
};

// ─── ユーティリティ ────────────────────────────────────────────
function calcBearing(lat1, lng1, lat2, lng2) {
  const r = d => d * Math.PI / 180;
  const y = Math.sin(r(lng2 - lng1)) * Math.cos(r(lat2));
  const x = Math.cos(r(lat1)) * Math.sin(r(lat2))
           - Math.sin(r(lat1)) * Math.cos(r(lat2)) * Math.cos(r(lng2 - lng1));
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function normDist(km) {
  return Math.min(Math.log(Math.max(km, 0.1) + 1) / Math.log(1001), 0.92);
}

function lsGet(k)   { try { return localStorage.getItem(k);   } catch { return null; } }
function lsSet(k,v) { try { localStorage.setItem(k, v);        } catch {} }

// 端末の向き（コンパス方位）を一度だけ取得する。取得できなければ null。
// iOS(13+) は要許可（ユーザー操作起点で呼ぶこと）。方位＝端末上端が指す向き（0=北, 時計回り）。
function captureHeading() {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || typeof window.DeviceOrientationEvent === 'undefined') return resolve(null);
    let done = false;
    const finish = (v) => {
      if (done) return; done = true;
      window.removeEventListener('deviceorientationabsolute', handler);
      window.removeEventListener('deviceorientation', handler);
      resolve(v);
    };
    const handler = (e) => {
      let h = null;
      if (typeof e.webkitCompassHeading === 'number') h = e.webkitCompassHeading;       // iOS: 磁北からの時計回り
      else if (e.alpha != null && (e.absolute || e.absolute === undefined)) h = (360 - e.alpha) % 360; // その他: alpha から換算
      if (h != null) finish(((h % 360) + 360) % 360);
    };
    const attach = () => {
      window.addEventListener('deviceorientationabsolute', handler, true);
      window.addEventListener('deviceorientation', handler, true);
      setTimeout(() => finish(null), 1200); // 取得できなければ諦める
    };
    const D = window.DeviceOrientationEvent;
    if (typeof D.requestPermission === 'function') {
      D.requestPermission().then(s => (s === 'granted' ? attach() : resolve(null))).catch(() => resolve(null));
    } else {
      attach();
    }
  });
}

// ─── Web Audio ソナーエンジン ─────────────────────────────────
class SonarAudio {
  constructor() { this._ctx = null; }

  _ctx_() {
    if (!this._ctx) {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (this._ctx.state === 'suspended') this._ctx.resume();
    }
    return this._ctx;
  }

  /**
   * 純粋なソナーping（潜水艦ソナー音）
   * - 正弦波のみ（ハーモニクスなし）
   * - 瞬時立ち上がり → 長いフェードアウト
   * - ごく微妙な周波数降下（-8%）でリアルなping感
   */
  _ping(freq, dur, vol, delay = 0) {
    try {
      const ctx  = this._ctx_();
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      const t = ctx.currentTime + delay;
      // 周波数: ごくわずかな下降のみ（-8%、半音以下）
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.linearRampToValueAtTime(freq * 0.92, t + dur * 0.6);
      // ゲイン: 極短アタック → 緩やかな指数的フェードアウト
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(vol, t + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    } catch { /* AudioContext がない環境では無視 */ }
  }

  /** スイープ音: レーダーアームが1周するたびに鳴る純粋なping */
  sweep() {
    this._ping(820, 2.8, 0.14);
  }

  destroy() {
    try { if (this._ctx) { this._ctx.close(); this._ctx = null; } } catch {}
  }
}

// ─────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────
export default function NearbyOfficesModal({ isOpen, onClose, theme }) {
  const { primary } = theme;

  const [phase,    setPhase]    = useState('idle');
  const [nearby,   setNearby]   = useState([]);
  const [userPos,  setUserPos]  = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  // レーダーの方角オフセット（0=北が上。端末の向き設定時はコンパス方位を入れる）
  const [headingOffset, setHeadingOffset] = useState(0);

  const abortRef    = useRef(false);
  const timerRef    = useRef(null);    // dramatic → found のタイマー
  const sweepRef    = useRef(null);    // スイープ音インターバル
  const audioRef    = useRef(null);    // SonarAudio インスタンス
  const introSeen   = useRef(lsGet(INTRO_KEY) === '1');

  // アンマウント時クリーンアップ
  useEffect(() => () => {
    clearTimeout(timerRef.current);
    clearInterval(sweepRef.current);
    audioRef.current?.destroy();
  }, []);

  // ─ スイープ音の開始・停止ヘルパー ─────────────────────────
  const startSweep = useCallback(() => {
    clearInterval(sweepRef.current);
    audioRef.current?.sweep();
    sweepRef.current = setInterval(() => {
      if (!abortRef.current) audioRef.current?.sweep();
    }, SWEEP_MS);
  }, []);

  const stopSweep = useCallback(() => {
    clearInterval(sweepRef.current);
    sweepRef.current = null;
  }, []);

  // ─ 測位メイン ─────────────────────────────────────────────
  const startLocating = useCallback(async () => {
    setPhase('locating');
    setNearby([]);
    setUserPos(null);
    setErrorMsg('');
    setHeadingOffset(0);

    // サウンド開始
    if (!audioRef.current) audioRef.current = new SonarAudio();
    startSweep();

    // レーダーの方角設定。「端末の向き」なら方位センサーを（この操作起点で）取得開始する。
    const orientation = lsGet('jsdf-radar-orientation') === 'heading' ? 'heading' : 'north';
    const headingPromise = orientation === 'heading' ? captureHeading() : Promise.resolve(null);

    const officesPromise = fetchOfficesData().catch(() => null);

    if (!navigator.geolocation) {
      stopSweep();
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
          stopSweep();
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

        // 端末の向き（取得できた場合のみ）をレーダーの回転オフセットに反映
        const hRaw = await headingPromise;
        if (abortRef.current) return;
        setHeadingOffset(orientation === 'heading' && hRaw != null ? hRaw : 0);

        setUserPos({ lat, lng });
        setNearby(sorted);
        setPhase('dramatic');

        // ヒット音・ロックオン音なし（スイープ音のみ）

        // found 遷移タイマー
        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          if (!abortRef.current) {
            stopSweep();
            setPhase('found');
          }
        }, DRAMATIC_MS);
      },
      (err) => {
        if (abortRef.current) return;
        stopSweep();
        if (err.code === 1) {
          setPhase('denied');
        } else {
          setPhase('error');
          setErrorMsg('現在地の取得に失敗しました（タイムアウトまたはエラー）');
        }
      },
      { timeout: 15000, maximumAge: 60000 },
    );
  }, [startSweep, stopSweep]);

  // ─ isOpen 変化 ─────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) {
      abortRef.current = true;
      clearTimeout(timerRef.current);
      stopSweep();
      audioRef.current?.destroy();
      audioRef.current = null;
      setPhase('idle');
      setNearby([]);
      setUserPos(null);
      setErrorMsg('');
      return;
    }
    abortRef.current = false;
    if (!introSeen.current) {
      setPhase('intro');
    } else {
      startLocating();
    }
  }, [isOpen, startLocating, stopSweep]);

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

      {/* 背景オーバーレイ */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute', inset: 0,
          background: 'rgba(0,0,0,0.52)',
          backdropFilter: 'blur(3px)',
          zIndex: 200,
        }}
      />

      {/* ボトムシート */}
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

        {/* ハンドル */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10, flexShrink: 0 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)' }} />
        </div>

        {/* ヘッダー */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 20px 10px', flexShrink: 0,
        }}>
          <div>
            <div style={{ fontFamily: F.serif, fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>
              近くの施設
            </div>
            {phase === 'found' && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                地本・地域事務所・募集案内所
              </div>
            )}
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
          {showRadar          && <RadarScreen phase={phase} nearby={nearby} headingOffset={headingOffset} />}
          {phase === 'found'  && <OfficeList offices={nearby} primary={primary} />}
          {phase === 'denied' && <DeniedView onRetry={startLocating} primary={primary} />}
          {phase === 'error'  && <ErrorView  msg={errorMsg} onRetry={startLocating} primary={primary} />}
        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────
// IntroView
// ─────────────────────────────────────────────────────────────────
function IntroView({ onConfirm, onCancel, primary }) {
  return (
    <div style={{ padding: '4px 0 16px', animation: 'intro-in 0.35s ease-out' }}>
      <div style={{ textAlign: 'center', marginBottom: 22 }}>
        <div style={{
          width: 60, height: 60, borderRadius: '50%',
          background: `${primary}18`, margin: '0 auto 14px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>{ICO.pin('var(--brand-fg)', 28)}</div>
        <div style={{ fontFamily: F.serif, fontSize: 17, fontWeight: 700, color: 'var(--text)', lineHeight: 1.4 }}>
          現在地を使って施設を探す
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.7 }}>
          近くの地本・地域事務所・募集案内所を<br />距離順に表示します
        </div>
      </div>

      <div style={{
        background: 'var(--card)', borderRadius: 14, border: '1px solid var(--border)',
        padding: '14px 16px', marginBottom: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>
          {ICO.shield('var(--text)', 14)} プライバシーについて
        </div>
        {[
          '位置情報は端末内でのみ処理されます',
          '外部サーバーへの送信はありません',
          '検索ボタンを押した時のみ一時的に使用します',
        ].map((text, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 9,
            fontSize: 12, color: 'var(--text-muted)', marginTop: i > 0 ? 9 : 0,
          }}>
            {ICO.check('#16a34a', 13)}
            <span>{text}</span>
          </div>
        ))}
      </div>

      <button onClick={onConfirm} style={{
        width: '100%', height: 48, borderRadius: 12, border: 'none',
        background: primary, color: '#fff', fontSize: 15, fontWeight: 700,
        fontFamily: F.sans, cursor: 'pointer', letterSpacing: 0.3,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      }}>
        {ICO.locator('#fff', 17)} 現在地を使って検索する
      </button>
      <button onClick={onCancel} style={{
        width: '100%', marginTop: 10, padding: '10px 0',
        background: 'none', border: 'none',
        fontSize: 13, color: 'var(--text-muted)', cursor: 'pointer', fontFamily: F.sans,
      }}>
        キャンセル
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// RadarScreen
// ─────────────────────────────────────────────────────────────────
function RadarScreen({ phase, nearby, headingOffset }) {
  const isDramatic = phase === 'dramatic';
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '18px 0 28px',
    }}>
      <RadarCircle blips={isDramatic ? nearby : []} headingOffset={headingOffset || 0} />

      <div key={phase} style={{ marginTop: 22, textAlign: 'center', animation: 'status-in 0.4s ease-out' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 15, fontWeight: 700, color: GREEN, letterSpacing: 0.4, lineHeight: 1.4 }}>
          {isDramatic
            ? <>{ICO.locator(GREEN, 15)}<span>{nearby.length} 件の施設を検出</span></>
            : <>{ICO.radar(GREEN, 15)}<span>スキャン中...</span></>}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 5, lineHeight: 1.6 }}>
          {isDramatic ? '距離を計算しています...' : '現在地と施設データを取得しています'}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// RadarCircle — グリーンレーダー
// ─────────────────────────────────────────────────────────────────
function RadarCircle({ blips, headingOffset = 0 }) {
  return (
    <div style={{
      width: RADAR_PX, height: RADAR_PX,
      borderRadius: '50%', position: 'relative',
      background: '#010e1a',
      border: `2px solid ${GREEN}66`,
      boxShadow: `0 0 28px ${GREEN}22, 0 0 60px ${GREEN}0a, inset 0 0 40px rgba(0,0,0,0.6)`,
      overflow: 'hidden', flexShrink: 0,
    }}>
      {/* 同心円（距離リング） */}
      {[0.33, 0.66, 1.0].map(r => (
        <div key={r} style={{
          position: 'absolute', borderRadius: '50%',
          border: `1px solid ${r < 1 ? GREEN + '22' : GREEN + '44'}`,
          width: `${r * 100}%`, height: `${r * 100}%`,
          top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)', pointerEvents: 'none',
        }} />
      ))}

      {/* 十字線 */}
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: 1, background: `${GREEN}1a`, transform: 'translateX(-50%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: 1, background: `${GREEN}1a`, transform: 'translateY(-50%)', pointerEvents: 'none' }} />

      {/* 斜め補助線 */}
      {[45, 135].map(deg => (
        <div key={deg} style={{
          position: 'absolute', top: '50%', left: '50%',
          width: RADAR_PX * 1.42, height: 1, background: `${GREEN}0d`,
          transform: `translate(-50%, -50%) rotate(${deg}deg)`, pointerEvents: 'none',
        }} />
      ))}

      {/* CRTスキャンライン */}
      <div style={{
        position: 'absolute', inset: 0, borderRadius: '50%',
        backgroundImage: `repeating-linear-gradient(0deg, transparent 0px, transparent 3px, rgba(0,0,0,0.07) 3px, rgba(0,0,0,0.07) 4px)`,
        pointerEvents: 'none', zIndex: 5,
      }} />

      {/* スイープアーム */}
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

      {/* 施設ブリップ（結果件数分）＋ JPN ラベル。
          ・現在地からの実際の方位（＋端末の向きオフセット）に配置する
          ・スイープアームがその方位に到達した瞬間に出現し、以後は通過ごとに光る（白い光は使わない） */}
      {blips.flatMap((o, i) => {
        if (o.lat == null || o.lng == null) return [];
        const toRad  = d => d * Math.PI / 180;
        // 表示方位＝地理方位 − 端末の向き（北が上のときは headingOffset=0）
        const disp   = (((o.bearing - headingOffset) % 360) + 360) % 360;
        const nr     = normDist(o.dist) * RADAR_R;
        const bx     = nr * Math.sin(toRad(disp));
        const by     = -nr * Math.cos(toRad(disp));
        const cx     = RADAR_R + bx;
        const cy     = RADAR_R + by;
        const isNearest = i === 0;
        const dotD   = isNearest ? 9 : 7;
        const dotR   = dotD / 2;

        // スイープアームがこの方位に達する時刻（0deg=上=北から時計回り）。
        // この時刻に出現させ、以後 SWEEP_MS ごとの通過で光らせる。
        const passTime = (disp / 360) * SWEEP_MS;
        const passKf   = isNearest ? 'blip-pass-strong' : 'blip-pass';

        return [
          // ブリップ本体（グリーンのみ）
          <div key={`d${o.id}`} style={{
            position: 'absolute',
            left: cx, top: cy,
            width: dotD, height: dotD,
            borderRadius: '50%',
            background: GREEN,
            transform: 'translate(-50%, -50%) scale(0)',
            opacity: 0,
            animation: [
              `blip-appear 0.4s ease-out ${passTime}ms forwards`,
              `${passKf} ${SWEEP_MS}ms linear ${passTime}ms infinite`,
            ].join(', '),
            zIndex: 10,
          }} />,

          // JPN ラベル（ブリップの直下）
          <div key={`l${o.id}`} style={{
            position: 'absolute',
            left: cx,
            top: cy + dotR + 2,
            transform: 'translate(-50%, 0) scale(0.7)',
            opacity: 0,
            animation: `blip-label-appear 0.3s ease-out ${passTime + 200}ms forwards`,
            fontSize: 6,
            color: `${GREEN}dd`,
            fontFamily: 'monospace',
            fontWeight: 900,
            letterSpacing: 1.5,
            whiteSpace: 'nowrap',
            zIndex: 10,
            pointerEvents: 'none',
            lineHeight: 1,
            textShadow: `0 0 5px ${GREEN}99`,
          }}>JPN</div>,
        ];
      })}

      {/* 中心点（現在地）＝グリーン（白い光は使わない） */}
      <div style={{
        position: 'absolute', left: '50%', top: '50%',
        width: 7, height: 7, borderRadius: '50%', background: GREEN,
        transform: 'translate(-50%, -50%)',
        animation: 'center-pulse 2.2s ease-in-out infinite',
        zIndex: 20,
      }} />

      {/* 光沢 */}
      <div style={{
        position: 'absolute', inset: 0, borderRadius: '50%',
        background: 'radial-gradient(ellipse 60% 40% at 35% 25%, rgba(0,255,100,0.06) 0%, transparent 70%)',
        pointerEvents: 'none', zIndex: 15,
      }} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// OfficeList / OfficeCard
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
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>
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

  const mapsUrl = (office.lat && office.lng && !office.latApprox)
    ? `https://maps.google.com/maps?q=${office.lat},${office.lng}&z=16`
    : office.address
      ? `https://maps.google.com/maps?q=${encodeURIComponent(office.address)}`
      : `https://maps.google.com/maps?q=${encodeURIComponent(office.name)}`;

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
          color: isTop ? 'var(--brand-fg)' : 'var(--text-muted)',
        }}>
          {distText}
        </div>
      </div>

      {/* 住所 */}
      {office.address && (
        <div style={{
          marginTop: 6, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5,
          display: 'flex', alignItems: 'flex-start', gap: 4,
        }}>
          {ICO.pin('var(--text-muted)', 11)}
          <span style={{ flex: 1 }}>
            {office.address}
            {office.latApprox && (
              <span style={{ marginLeft: 4, color: 'var(--text-muted)', opacity: 0.7, fontSize: 10 }}>
                （概算位置）
              </span>
            )}
          </span>
        </div>
      )}

      {/* 管轄地域 */}
      {office.area && (
        <div style={{
          marginTop: 4, fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.5,
          padding: '3px 6px', borderRadius: 4, background: 'var(--bg)',
          display: 'flex', alignItems: 'flex-start', gap: 4,
        }}>
          <span style={{ display: 'flex', marginTop: 1, flexShrink: 0 }}>{ICO.pin('var(--text-muted)', 10)}</span>
          <span style={{
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>担当: {office.area}</span>
        </div>
      )}

      {/* アクションボタン */}
      <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
        <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
          style={btnStyle(`${primary}14`, `${primary}33`, primary)}>
          {ICO.map('var(--brand-fg)', 12)} 地図で開く
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
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>{ICO.lock('var(--text-muted)', 40)}</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>
        位置情報の使用が拒否されました
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.8, marginBottom: 24 }}>
        設定アプリからブラウザの<br />位置情報アクセスを許可してから<br />再度お試しください
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
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>{ICO.warn(undefined, 40)}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>
        エラーが発生しました
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: 24 }}>{msg}</div>
      <button onClick={onRetry} style={retryBtnStyle(primary)}>
        {ICO.refresh('#fff', 14)} 再試行
      </button>
    </div>
  );
}

function retryBtnStyle(primary) {
  return {
    padding: '10px 28px', borderRadius: 10, border: 'none',
    background: primary, color: '#fff', fontSize: 14, fontWeight: 600,
    fontFamily: F.sans, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 7,
  };
}
