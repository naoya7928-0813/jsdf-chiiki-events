// ─── SplashScreen.jsx ─────────────────────────────────────────────
// 起動時に陸/海/空テーマに合わせた乗り物アニメーションを表示

import { useEffect, useState } from 'react';
import tankRaw   from '../assets/vehicles/tank.svg?raw';
import tank16Raw from '../assets/vehicles/tank16.svg?raw';
import pac3Raw   from '../assets/vehicles/pac3.svg?raw';
import shipRaw   from '../assets/vehicles/ship.svg?raw';
import jetRaw    from '../assets/vehicles/jet.svg?raw';

// ──── CSSキーフレームを<head>に注入（1回のみ） ───────────────────
const KF_ID = 'jsdf-splash-kf';
function injectKeyframes() {
  if (document.getElementById(KF_ID)) return;
  const el = document.createElement('style');
  el.id = KF_ID;
  el.textContent = `
    /* ── 空自：戦闘機が左から中央へ飛来して停止（幅220px → 半分110px） ── */
    @keyframes spJetFly {
      0%        { left: -250px; transform: scale(0.82); }
      60%       { transform: scale(1); }
      72%, 100% { left: calc(50% - 110px); transform: scale(1); }
    }
    @keyframes spJetTrail {
      0%   { width: 0; opacity: 0; left: 0; }
      15%  { opacity: 0.85; }
      70%  { width: calc(50% - 110px); opacity: 0.5; }
      100% { width: calc(50% - 110px); opacity: 0; }
    }

    /* ── 陸自：戦車が左から中央へ走り込む（幅220px → 半分110px） ── */
    @keyframes spTankRoll {
      0%        { left: -250px; }
      62%, 100% { left: calc(50% - 110px); }
    }

    /* ── 海自：護衛艦が左から中央へ進入（幅280px → 半分140px） ── */
    @keyframes spShipSail {
      0%        { left: -320px; }
      62%, 100% { left: calc(50% - 140px); }
    }
    @keyframes spWave {
      0%, 100% { transform: translateX(0);    opacity: 0.28; }
      50%       { transform: translateX(-7px); opacity: 0.48; }
    }

    /* ── 陸自：後部砂煙パフ（上昇・膨張） ── */
    @keyframes spDust1 {
      0%   { transform: translate(0,0) scale(0.28); opacity: 0; }
      15%  { opacity: 0.60; }
      100% { transform: translate(-18px,-56px) scale(2.2); opacity: 0; }
    }
    @keyframes spDust2 {
      0%   { transform: translate(0,0) scale(0.20); opacity: 0; }
      18%  { opacity: 0.52; }
      100% { transform: translate(-30px,-42px) scale(2.8); opacity: 0; }
    }
    @keyframes spDust3 {
      0%   { transform: translate(0,0) scale(0.16); opacity: 0; }
      20%  { opacity: 0.45; }
      100% { transform: translate(-10px,-70px) scale(1.9); opacity: 0; }
    }
    @keyframes spDust4 {
      0%   { transform: translate(0,0) scale(0.30); opacity: 0; }
      12%  { opacity: 0.55; }
      100% { transform: translate(-22px,-38px) scale(2.6); opacity: 0; }
    }
    /* ── 陸自：側面砂埃（車体横・低くて横広がり） ── */
    @keyframes spDustSide {
      0%   { transform: scaleX(0.04); opacity: 0; }
      18%  { opacity: 0.52; }
      65%  { opacity: 0.30; }
      100% { transform: scaleX(1); opacity: 0; }
    }

    /* ── 海自：艦首白波スプレー（縦） ── */
    @keyframes spBowSpray {
      0%   { transform: scaleY(0.08) scaleX(0.6); opacity: 0; }
      18%  { transform: scaleY(1) scaleX(1);      opacity: 0.90; }
      100% { transform: scaleY(1.9) scaleX(1.2);  opacity: 0; }
    }
    /* ── 海自：艦首横波ファン（横方向） ── */
    @keyframes spBowFan {
      0%   { transform: scaleX(0.1); opacity: 0; }
      20%  { opacity: 0.80; }
      100% { transform: scaleX(1); opacity: 0; }
    }
    /* ── 海自：艦尾スクリュー波 ── */
    @keyframes spSternWash {
      0%   { transform: scale(0.15) translateX(12px); opacity: 0; }
      22%  { opacity: 0.75; }
      75%  { opacity: 0.40; }
      100% { transform: scale(1.7) translateX(-18px); opacity: 0; }
    }
    /* ── 海自：航跡（船の後ろに伸びる白波ライン） ── */
    @keyframes spWake {
      0%   { width: 0;                 opacity: 0; }
      10%  { opacity: 0.58; }
      62%  { width: calc(50% - 120px); opacity: 0.38; }
      100% { width: calc(50% - 120px); opacity: 0; }
    }

    /* ── 共通 ── */
    @keyframes spTextIn {
      from { opacity: 0; transform: translateY(12px); }
      to   { opacity: 1; transform: translateY(0);    }
    }
    @keyframes spFadeOut {
      to { opacity: 0; }
    }
  `;
  document.head.appendChild(el);
}

// ════════════════════════════════════════════════════════════════════
//  SVG シルエット
// ════════════════════════════════════════════════════════════════════

/** F-15 戦闘機（航空自衛隊） */
function JetSVG({ color }) {
  return (
    <div
      style={{
        width: 220, color, display: 'block',
        filter: 'drop-shadow(0 6px 20px rgba(0,0,0,0.55))',
        transform: 'scaleX(-1)',
      }}
      dangerouslySetInnerHTML={{ __html: jetRaw }}
    />
  );
}

/** 10式戦車（陸上自衛隊） */
function TankSVG({ color }) {
  return (
    <div
      style={{
        width: 220, color, display: 'block',
        filter: 'drop-shadow(0 4px 14px rgba(0,0,0,0.6))',
        transform: 'scaleX(-1)',
      }}
      dangerouslySetInnerHTML={{ __html: tankRaw }}
    />
  );
}

/** 16式機動戦闘車（陸上自衛隊） */
function Tank16SVG({ color }) {
  return (
    <div
      style={{
        width: 220, color, display: 'block',
        filter: 'drop-shadow(0 4px 14px rgba(0,0,0,0.6))',
        transform: 'scaleX(-1)',
      }}
      dangerouslySetInnerHTML={{ __html: tank16Raw }}
    />
  );
}

/** PAC-3（陸上自衛隊） */
function PAC3SVG({ color }) {
  return (
    <div
      style={{
        width: 220, color, display: 'block',
        filter: 'drop-shadow(0 4px 14px rgba(0,0,0,0.6))',
        transform: 'scaleX(-1)',
      }}
      dangerouslySetInnerHTML={{ __html: pac3Raw }}
    />
  );
}

/** 護衛艦（海上自衛隊） */
function ShipSVG({ color }) {
  return (
    <div
      style={{
        width: 280, color, display: 'block',
        filter: 'drop-shadow(0 4px 16px rgba(0,0,0,0.65))',
        transform: 'scaleX(-1)',
      }}
      dangerouslySetInnerHTML={{ __html: shipRaw }}
    />
  );
}

// ════════════════════════════════════════════════════════════════════
//  スプラッシュ設定（自衛隊種別ごと）
// ════════════════════════════════════════════════════════════════════
const CONFIGS = {
  jgsdf: {
    bg:           'radial-gradient(ellipse 130% 90% at 50% 108%, #2e3c1c 0%, #1a2410 52%, #0b1108 100%)',
    groundColor:  '#3a4a20',
    accentColor:  '#8bc34a',
    vehicleColor: '#c8d8a8',
    labelEn:      'JAPAN GROUND SELF-DEFENSE FORCE',
    labelJa:      '陸上自衛隊モード · 起動中',
    vehicles:     [TankSVG, Tank16SVG, PAC3SVG],  // 均等ランダム
    mode:         'tank',
    duration:     2700,
    textDelay:    '1.4s',
  },
  jmsdf: {
    bg:           'radial-gradient(ellipse 130% 80% at 50% 8%, #0b2545 0%, #071833 52%, #030d1e 100%)',
    seaTop:       '#071030',
    accentColor:  '#4a90d9',
    vehicleColor: '#b8d4f0',
    labelEn:      'JAPAN MARITIME SELF-DEFENSE FORCE',
    labelJa:      '海上自衛隊モード · 起動中',
    vehicles:     [ShipSVG],
    mode:         'ship',
    duration:     2900,
    textDelay:    '1.5s',
  },
  jasdf: {
    bg:           'radial-gradient(130% 95% at 50% 0%, #0b2545 0%, #071a33 68%, #03101f 100%)',
    accentColor:  '#4aa3ff',
    vehicleColor: '#dfeeff',
    labelEn:      'JAPAN AIR SELF-DEFENSE FORCE',
    labelJa:      '航空自衛隊モード · 起動中',
    vehicles:     [JetSVG],
    mode:         'jet',
    duration:     2600,
    textDelay:    '1.3s',
  },
};

// ════════════════════════════════════════════════════════════════════
//  メインコンポーネント
// ════════════════════════════════════════════════════════════════════
export default function SplashScreen({ schemeKey, onDone }) {
  const cfg = CONFIGS[schemeKey] ?? CONFIGS.jasdf;
  const [fading, setFading] = useState(false);

  // 起動ごとにプールからランダム選択（useState初期化関数で1回だけ決定）
  const [Vehicle] = useState(() => {
    const pool = cfg.vehicles;
    return pool[Math.floor(Math.random() * pool.length)];
  });

  useEffect(() => {
    injectKeyframes();
    const t = setTimeout(dismiss, cfg.duration);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function dismiss() {
    if (fading) return;
    setFading(true);
    setTimeout(onDone, 680);
  }

  return (
    <div
      onClick={dismiss}
      style={{
        position: 'absolute', inset: 0, zIndex: 50,
        background: cfg.bg,
        overflow: 'hidden',
        cursor: 'pointer',
        fontFamily: '"Hiragino Kaku Gothic ProN","Yu Gothic",sans-serif',
        animation: fading ? 'spFadeOut 0.68s ease forwards' : 'none',
      }}
    >
      <GlowLayer />

      {cfg.mode === 'jet'  && <JetScene  cfg={cfg} Vehicle={Vehicle} />}
      {cfg.mode === 'tank' && <TankScene cfg={cfg} Vehicle={Vehicle} />}
      {cfg.mode === 'ship' && <ShipScene cfg={cfg} Vehicle={Vehicle} />}

      {/* テキスト */}
      <div style={{
        position: 'absolute', bottom: '14%', left: 0, right: 0,
        textAlign: 'center', color: '#fff',
        opacity: 0,
        animation: `spTextIn 0.85s ease ${cfg.textDelay} both`,
      }}>
        <div style={{
          fontSize: 10, letterSpacing: '0.28em',
          color: 'rgba(255,255,255,0.5)', marginBottom: 10,
          textTransform: 'uppercase',
        }}>
          {cfg.labelEn}
        </div>
        <div style={{
          fontSize: 17, fontWeight: 700,
          letterSpacing: '0.14em', color: cfg.accentColor,
        }}>
          {cfg.labelJa}
        </div>
      </div>

      {/* スキップ */}
      <div style={{
        position: 'absolute', top: 18, right: 18,
        fontSize: 11, color: 'rgba(255,255,255,0.42)',
        border: '1px solid rgba(255,255,255,0.22)',
        padding: '5px 14px', borderRadius: 20,
        letterSpacing: '0.08em', pointerEvents: 'none',
      }}>
        タップでスキップ
      </div>

    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
//  サブシーン
// ════════════════════════════════════════════════════════════════════

function GlowLayer() {
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      <div style={{
        position: 'absolute', width: '75%', height: '75%', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(130,190,255,0.07), transparent 65%)',
        filter: 'blur(28px)', top: '-18%', left: '-12%',
      }}/>
      <div style={{
        position: 'absolute', width: '65%', height: '65%', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(130,190,255,0.05), transparent 65%)',
        filter: 'blur(22px)', bottom: '-12%', right: '-8%',
      }}/>
    </div>
  );
}

/** 空自：戦闘機 + 多層飛行機雲（外側グロー＋中層＋2本コアライン） */
function JetScene({ cfg, Vehicle }) {
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {/* 飛行機雲 ① 外側の拡散グロー（幅広・強ぼかし） */}
      <div style={{
        position: 'absolute', top: 'calc(40% + 1px)', left: 0,
        height: 22,
        background: 'linear-gradient(90deg, transparent 3%, rgba(200,228,255,0.20))',
        filter: 'blur(7px)', borderRadius: 11,
        animation: 'spJetTrail 2.4s ease-out forwards',
      }}/>
      {/* 飛行機雲 ② 中間拡散層（半透明・軽くぼかし） */}
      <div style={{
        position: 'absolute', top: 'calc(40% + 5px)', left: 0,
        height: 9,
        background: 'linear-gradient(90deg, transparent 8%, rgba(230,244,255,0.60))',
        filter: 'blur(2.5px)', borderRadius: 5,
        animation: 'spJetTrail 2.4s ease-out 0.06s both',
      }}/>
      {/* 飛行機雲 ③ エンジン1コアライン（上） */}
      <div style={{
        position: 'absolute', top: 'calc(40% + 5px)', left: 0,
        height: 2,
        background: 'linear-gradient(90deg, transparent 14%, rgba(255,255,255,0.95))',
        borderRadius: 1,
        animation: 'spJetTrail 2.4s ease-out 0.04s both',
      }}/>
      {/* 飛行機雲 ④ エンジン2コアライン（下・6px離す） */}
      <div style={{
        position: 'absolute', top: 'calc(40% + 11px)', left: 0,
        height: 2,
        background: 'linear-gradient(90deg, transparent 14%, rgba(255,255,255,0.95))',
        borderRadius: 1,
        animation: 'spJetTrail 2.4s ease-out 0.08s both',
      }}/>
      {/* 戦闘機本体 */}
      <div style={{
        position: 'absolute', top: '38%', left: -250,
        animation: 'spJetFly 2.4s cubic-bezier(.18,.72,.28,1) forwards',
      }}>
        <Vehicle color={cfg.vehicleColor} />
      </div>
    </div>
  );
}

/** 陸自：戦車 + 地面 + 砂煙（後部上昇パフ + 側面横広がり） */
function TankScene({ cfg, Vehicle }) {
  // scaleX(-1) 後の車体座標：左端 = 後部、右端 = 砲身
  // 後部パフは left: -30〜10px あたり（コンテナ内）
  const rearPuffs = [
    { left: -22, bottom: 4,  size: 34, delay: '0.22s', anim: 'spDust1' },
    { left: -36, bottom: 2,  size: 44, delay: '0.42s', anim: 'spDust2' },
    { left:  -8, bottom: 8,  size: 26, delay: '0.60s', anim: 'spDust3' },
    { left: -30, bottom: 0,  size: 50, delay: '0.78s', anim: 'spDust4' },
    { left: -14, bottom: 6,  size: 36, delay: '0.96s', anim: 'spDust1' },
  ];

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {/* 地面グラデーション */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: '36%',
        background: `linear-gradient(180deg, transparent, ${cfg.groundColor}55 40%, ${cfg.groundColor}99)`,
      }}/>
      {/* 地平線ライン */}
      <div style={{
        position: 'absolute', bottom: '35%', left: 0, right: 0, height: 2,
        background: `linear-gradient(90deg, transparent 5%, ${cfg.groundColor}cc 30%, ${cfg.groundColor}cc 70%, transparent 95%)`,
      }}/>

      {/* 戦車本体（砂煙もコンテナ内に入れて追従させる） */}
      <div style={{
        position: 'absolute', bottom: 'calc(35% + 2px)', left: -250,
        animation: 'spTankRoll 2.2s cubic-bezier(.22,.80,.22,1) forwards',
      }}>
        <Vehicle color={cfg.vehicleColor} />

        {/* ── 後部排気砂煙（上昇パフ） ── */}
        {rearPuffs.map((p, i) => (
          <div key={i} style={{
            position: 'absolute',
            bottom: p.bottom,
            left:   p.left,
            width: p.size, height: p.size,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(165,148,92,0.72), transparent 62%)',
            filter: 'blur(7px)',
            animation: `${p.anim} 1.9s ease-out ${p.delay} both`,
          }}/>
        ))}

        {/* ── 車体側面砂埃①（履帯上面・上側） ── */}
        <div style={{
          position: 'absolute',
          bottom: -4, left: -10,
          width: 190, height: 26,
          borderRadius: '50%',
          background: 'radial-gradient(ellipse 100% 100% at 8% 50%, rgba(155,138,82,0.58), transparent 72%)',
          filter: 'blur(9px)',
          transformOrigin: 'left center',
          animation: 'spDustSide 1.9s ease-out 0.28s both',
        }}/>
        {/* ── 車体側面砂埃②（履帯下面・地面スレスレ） ── */}
        <div style={{
          position: 'absolute',
          bottom: -9, left: 5,
          width: 160, height: 18,
          borderRadius: '50%',
          background: 'radial-gradient(ellipse 100% 100% at 6% 50%, rgba(130,115,65,0.50), transparent 68%)',
          filter: 'blur(7px)',
          transformOrigin: 'left center',
          animation: 'spDustSide 2.1s ease-out 0.62s both',
        }}/>
      </div>
    </div>
  );
}

/** 海自：護衛艦 + 海面 + 波 + 艦首白波 + 艦尾スクリュー波 + 航跡 */
function ShipScene({ cfg, Vehicle }) {
  // ShipSVG は scaleX(-1) 済み → 艦首(bow)=右端、艦尾(stern)=左端
  // コンテナ幅 280px : 艦首 ≈ right:12px / 艦尾 ≈ left:8px
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {/* 海面グラデーション */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: '42%',
        background: `linear-gradient(180deg, transparent, ${cfg.seaTop}88 35%, ${cfg.seaTop})`,
      }}/>
      {/* 波紋ライン */}
      {[0, 14, 28].map((offset, i) => (
        <div key={offset} style={{
          position: 'absolute', bottom: `calc(30% + ${offset}px)`, left: 0, right: 0, height: 2,
          background: 'linear-gradient(90deg, transparent 4%, rgba(80,140,210,0.32) 25%, rgba(80,140,210,0.32) 75%, transparent 96%)',
          animation: `spWave ${1.9 + i * 0.18}s ease-in-out infinite`,
          animationDelay: `${i * 0.22}s`,
        }}/>
      ))}
      {/* 航跡ライン① 拡散グロー */}
      <div style={{
        position: 'absolute', bottom: 'calc(30% + 2px)', left: 0,
        height: 14,
        background: 'linear-gradient(90deg, transparent 2%, rgba(190,220,255,0.18) 25%, rgba(220,240,255,0.50))',
        filter: 'blur(4px)', borderRadius: 7,
        animation: 'spWake 2.4s ease-out forwards',
      }}/>
      {/* 航跡ライン② コアライン */}
      <div style={{
        position: 'absolute', bottom: 'calc(30% + 7px)', left: 0,
        height: 2,
        background: 'linear-gradient(90deg, transparent 5%, rgba(255,255,255,0.65))',
        borderRadius: 1,
        animation: 'spWake 2.4s ease-out 0.05s both',
      }}/>
      {/* 護衛艦本体（水飛沫・反射もコンテナ内で追従） */}
      <div style={{
        position: 'absolute', bottom: 'calc(30% + 4px)', left: -320,
        animation: 'spShipSail 2.4s cubic-bezier(.22,.80,.22,1) forwards',
      }}>
        {/* 水面反射（コンテナ内に配置 → 艦と一緒に動く） */}
        <div style={{
          position: 'absolute', top: 52, left: 0,
          opacity: 0.10, transform: 'scaleY(-0.38)', transformOrigin: 'top left',
          filter: 'blur(4px)', pointerEvents: 'none',
        }}>
          <Vehicle color={cfg.vehicleColor} />
        </div>
        <Vehicle color={cfg.vehicleColor} />

        {/* ── 艦首スプレー（縦・右端）：船首が水を切る柱状の飛沫 ── */}
        <div style={{
          position: 'absolute',
          bottom: -6, right: 10,
          width: 26, height: 52,
          transformOrigin: 'bottom center',
          background: 'radial-gradient(ellipse 60% 100% at 50% 100%, rgba(255,255,255,0.92), transparent 72%)',
          filter: 'blur(5px)',
          animation: 'spBowSpray 2.0s ease-in-out 0.12s both',
        }}/>
        {/* ── 艦首横波ファン（右方向へ扇状に広がる白波） ── */}
        <div style={{
          position: 'absolute',
          bottom: -12, right: -8,
          width: 68, height: 22,
          transformOrigin: 'right center',
          background: 'radial-gradient(ellipse 100% 80% at 85% 50%, rgba(210,238,255,0.82), transparent 70%)',
          filter: 'blur(5px)',
          animation: 'spBowFan 2.1s ease-out 0.18s both',
        }}/>
        {/* ── 艦尾スクリュー波①（大：楕円） ── */}
        <div style={{
          position: 'absolute',
          bottom: -10, left: 4,
          width: 52, height: 24,
          borderRadius: '50%',
          background: 'radial-gradient(ellipse 100% 80% at 30% 50%, rgba(200,232,255,0.78), transparent 68%)',
          filter: 'blur(6px)',
          animation: 'spSternWash 2.2s ease-out 0.20s both',
        }}/>
        {/* ── 艦尾スクリュー波②（小・細かい泡） ── */}
        <div style={{
          position: 'absolute',
          bottom: -5, left: 18,
          width: 34, height: 16,
          borderRadius: '50%',
          background: 'radial-gradient(ellipse 100% 80% at 35% 50%, rgba(230,245,255,0.70), transparent 65%)',
          filter: 'blur(4px)',
          animation: 'spSternWash 1.8s ease-out 0.42s both',
        }}/>
      </div>
    </div>
  );
}
