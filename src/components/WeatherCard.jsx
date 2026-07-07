import { useState, useEffect } from 'react';
import { F, SectionTitle } from './Shared';
import W from '../../shared/weather.cjs';

// WMO weather code → 日本語名称 + アイコン種別（Open-Meteo の weather_code に対応）。
// 端末で見た目が変わる絵文字を廃し、線画アイコン（WeatherGlyph）へ統一（フィードバック§4-2⑦）。
const WMO = {
  0:  ['快晴', 'clear'],
  1:  ['晴れ', 'partly'], 2: ['薄曇り', 'partly'], 3: ['曇り', 'cloudy'],
  45: ['霧', 'fog'], 48: ['霧（着氷）', 'fog'],
  51: ['霧雨（弱）', 'rain'], 53: ['霧雨', 'rain'], 55: ['霧雨（強）', 'rain'],
  56: ['着氷性の霧雨', 'rain'], 57: ['着氷性の霧雨', 'rain'],
  61: ['弱い雨', 'rain'], 63: ['雨', 'rain'], 65: ['強い雨', 'rain'],
  66: ['着氷性の雨', 'rain'], 67: ['着氷性の雨', 'rain'],
  71: ['弱い雪', 'snow'], 73: ['雪', 'snow'], 75: ['強い雪', 'snow'],
  77: ['霧雪', 'snow'],
  80: ['にわか雨（弱）', 'rain'], 81: ['にわか雨', 'rain'], 82: ['激しいにわか雨', 'thunder'],
  85: ['にわか雪', 'snow'], 86: ['強いにわか雪', 'snow'],
  95: ['雷雨', 'thunder'], 96: ['雷雨（ひょう）', 'thunder'], 99: ['激しい雷雨（ひょう）', 'thunder'],
};
function describeCode(code) {
  return WMO[code] || ['天気', 'cloudy'];
}

// 天気カテゴリ → 線画アイコン。ストロークは細めでナビ・ヘッダーの線画と統一。
const CLOUD_PATH = 'M7 17.5h9.2a3.3 3.3 0 00.3-6.6 4.8 4.8 0 00-9.2-1.1A3.4 3.4 0 007 17.5z';
function WeatherGlyph({ cat, size = 40 }) {
  const sw = 1.6;
  const sun = '#f59e0b', cloud = '#94a3b8', rain = '#3b82f6', snow = '#7ca8d6', bolt = '#f59e0b';
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true };
  if (cat === 'clear') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="5" stroke={sun} strokeWidth={sw} />
        <path d="M12 1.5v2.5M12 20v2.5M1.5 12H4M20 12h2.5M4.2 4.2l1.8 1.8M18 18l1.8 1.8M19.8 4.2L18 6M6 18l-1.8 1.8"
          stroke={sun} strokeWidth={sw} strokeLinecap="round" />
      </svg>
    );
  }
  if (cat === 'partly') {
    return (
      <svg {...common}>
        <circle cx="8.5" cy="8" r="3.2" stroke={sun} strokeWidth={sw} />
        <path d="M8.5 2.2v1.6M2.7 8h1.6M4.4 4l1.1 1.1M12.6 4l-1.1 1.1" stroke={sun} strokeWidth={sw} strokeLinecap="round" />
        <path d={CLOUD_PATH} stroke={cloud} strokeWidth={sw} strokeLinejoin="round" fill="var(--card)" />
      </svg>
    );
  }
  if (cat === 'cloudy') {
    return <svg {...common}><path d={CLOUD_PATH} stroke={cloud} strokeWidth={sw} strokeLinejoin="round" /></svg>;
  }
  if (cat === 'fog') {
    return (
      <svg {...common}>
        <path d="M4 9h14M6 13h14M4 17h12" stroke={cloud} strokeWidth={sw} strokeLinecap="round" />
      </svg>
    );
  }
  if (cat === 'rain') {
    return (
      <svg {...common}>
        <path d={CLOUD_PATH} stroke={cloud} strokeWidth={sw} strokeLinejoin="round" />
        <path d="M9 19.5l-1 2.5M13 19.5l-1 2.5M16.5 19.5l-1 2.5" stroke={rain} strokeWidth={sw} strokeLinecap="round" />
      </svg>
    );
  }
  if (cat === 'snow') {
    return (
      <svg {...common}>
        <path d={CLOUD_PATH} stroke={cloud} strokeWidth={sw} strokeLinejoin="round" />
        <g fill={snow}><circle cx="9" cy="20.6" r="1" /><circle cx="12.8" cy="21.2" r="1" /><circle cx="16.3" cy="20.6" r="1" /></g>
      </svg>
    );
  }
  // thunder
  return (
    <svg {...common}>
      <path d={CLOUD_PATH} stroke={cloud} strokeWidth={sw} strokeLinejoin="round" />
      <path d="M13 18.5l-3.2 3.8h2.4L11 24.5l3.4-4.2h-2.4l1-1.8z" fill={bolt} />
    </svg>
  );
}

/** JST 今日 "YYYY-MM-DD" */
function jstToday() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
function fmtFetched(iso) {
  try {
    return new Date(iso).toLocaleString('ja-JP', {
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo',
    });
  } catch { return ''; }
}

// 天気予報は全表示で必ず出す共通注記
const BASE_NOTE = '天気予報は参考情報です。開催・中止・内容変更については、必ず主催者の公式情報をご確認ください。';

// カードの外枠
function CardShell({ children, heading }) {
  return (
    <div style={{ padding: '6px 16px 14px' }}>
      <SectionTitle>{heading}</SectionTitle>
      <div style={{ background: 'var(--card)', borderRadius: 12, border: '1px solid var(--border)', padding: 14 }}>
        {children}
      </div>
    </div>
  );
}

// 注記（複数あってもまとめて読みやすく）＋ 出典
function Footnotes({ primary, extraNotes }) {
  return (
    <div style={{
      marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--sep)',
      fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.7, fontFamily: F.sans,
    }}>
      <ul style={{ margin: 0, paddingLeft: 16 }}>
        <li>{BASE_NOTE}</li>
        {(extraNotes || []).map((n, i) => <li key={i} style={{ marginTop: 3 }}>{n}</li>)}
      </ul>
      <div style={{ marginTop: 6 }}>
        出典: 天気予報 <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer"
          style={{ color: primary, textDecoration: 'none' }}>Open-Meteo</a>
        ／座標検索 <a href="https://www.gsi.go.jp/" target="_blank" rel="noopener noreferrer"
          style={{ color: primary, textDecoration: 'none' }}>国土地理院</a>
      </div>
    </div>
  );
}

function Badge({ children, primary }) {
  return (
    <span style={{
      display: 'inline-block', fontSize: 10, fontWeight: 700, fontFamily: F.mono,
      padding: '3px 8px', borderRadius: 4, marginRight: 6, marginBottom: 6,
      background: `${primary}12`, color: primary, letterSpacing: 1,
    }}>{children}</span>
  );
}

function StatLine({ label, value }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '5px 0' }}>
      <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: F.sans }}>{label}</span>
      <span style={{ fontSize: 14, color: 'var(--text)', fontWeight: 600, fontFamily: F.mono }}>{value}</span>
    </div>
  );
}

function Message({ heading, text, primary, extraNotes }) {
  return (
    <CardShell heading={heading}>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7, fontFamily: F.sans }}>{text}</div>
      <Footnotes primary={primary} extraNotes={extraNotes} />
    </CardShell>
  );
}

/**
 * イベント詳細画面の天気カード。
 * 表示判定は shared/weather.cjs の decideWeatherDisplay に集約（精度別制御・テスト共有）。
 * - address/venue/manual: 通常の「開催日の天気予報」
 * - municipality: 天気は出すが「開催地域の参考予報」バッジ＋注記
 * - prefecture: API を呼ばず非表示メッセージ（既定。将来 allowPrefecture で許可可能）
 * - 17日以上先 / 座標なし / 終了済み / APIエラー / stale もそれぞれ表示
 */
export default function WeatherCard({ event, theme }) {
  const primary = theme?.primary || '#0b2545';
  const ev = event;
  const today = jstToday();
  const decision = W.decideWeatherDisplay(ev || {}, today);

  const shouldFetch = decision.status === 'forecast';
  const loc = ev?.weatherLocation;
  const [state, setState] = useState({ status: 'idle', data: null });

  useEffect(() => {
    if (!shouldFetch) return;
    let cancelled = false;
    setState({ status: 'loading', data: null });
    const qs = new URLSearchParams({
      latitude: String(loc.latitude),
      longitude: String(loc.longitude),
      date: ev.date,
    });
    fetch(`/api/weather?${qs.toString()}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(data => { if (!cancelled) setState({ status: 'ok', data }); })
      .catch(() => { if (!cancelled) setState({ status: 'error', data: null }); });
    return () => { cancelled = true; };
  }, [shouldFetch, loc?.latitude, loc?.longitude, ev?.date]);

  // 終了済み → カード非表示
  if (decision.status === 'ended') return null;

  // 座標なし
  if (decision.status === 'no-coords') {
    return <Message heading="開催日の天気" primary={primary}
      text="天気表示に必要な位置情報を取得できませんでした。" />;
  }

  // 都道府県代表座標のみ → API を呼ばず非表示
  if (decision.status === 'prefecture-blocked') {
    return <Message heading="開催日の天気" primary={primary}
      text="開催場所の詳細な位置を特定できないため、天気予報を表示できません。" />;
  }

  // 17日以上先（予報発表前）
  if (decision.status === 'too-far') {
    return <Message heading="開催日の天気（予報発表前）" primary={primary}
      text={`天気予報は開催日の${W.FORECAST_MAX_DAYS}日前から表示されます。`} />;
  }

  // ── forecast ──
  const heading = '開催日の天気予報';

  if (state.status === 'loading' || state.status === 'idle') {
    return (
      <CardShell heading={heading}>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: F.sans }}>天気情報を取得しています…</div>
      </CardShell>
    );
  }
  if (state.status === 'error') {
    return <Message heading={heading} primary={primary} text="天気情報を取得できませんでした。" />;
  }

  const d = state.data || {};
  const stale = !!d.stale;
  const [name, iconCat] = describeCode(d.weatherCode);
  const u = d.units || {};
  const tMax = typeof d.temperatureMax === 'number' ? `${Math.round(d.temperatureMax)}${u.temperature || '°C'}` : '—';
  const tMin = typeof d.temperatureMin === 'number' ? `${Math.round(d.temperatureMin)}${u.temperature || '°C'}` : '—';
  const pop  = typeof d.precipitationProbabilityMax === 'number' ? `${d.precipitationProbabilityMax}${u.precipitationProbability || '%'}` : '—';
  const wind = typeof d.windSpeedMax === 'number' ? `${Math.round(d.windSpeedMax)} ${u.windSpeed || 'km/h'}` : '—';

  // バッジ・追加注記（複数あってもまとめて表示）
  const extraNotes = [];
  if (decision.isMunicipality) extraNotes.push('開催地の市区町村を基準にした参考予報です。');
  if (stale) extraNotes.push('現在、最新の予報を取得できないため、前回取得した情報を表示しています。');

  return (
    <CardShell heading={heading}>
      <div>
        {decision.isMunicipality
          ? <Badge primary={primary}>開催地域の参考予報</Badge>
          : decision.isDistanceReference && <Badge primary={primary}>参考予報</Badge>}
        {stale && <Badge primary={primary}>前回の情報</Badge>}
      </div>
      {/* 天気アイコン + 名称 + 最高/最低気温 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 6 }}>
        <div style={{ display: 'flex', lineHeight: 1 }}><WeatherGlyph cat={iconCat} size={40} /></div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', fontFamily: F.sans }}>{name}</div>
          <div style={{ marginTop: 4, display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: '#dc2626', fontFamily: F.mono }}>{tMax}</span>
            <span style={{ fontSize: 16, fontWeight: 600, color: '#2563eb', fontFamily: F.mono }}>{tMin}</span>
          </div>
        </div>
      </div>
      {/* 降水確率・最大風速 */}
      <div style={{ borderTop: '1px solid var(--sep)', marginTop: 8, paddingTop: 4 }}>
        <StatLine label="降水確率" value={pop} />
        <StatLine label="最大風速" value={wind} />
      </div>
      {d.fetchedAt && (
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6, fontFamily: F.mono, textAlign: 'right' }}>
          最終取得 {fmtFetched(d.fetchedAt)}
        </div>
      )}
      <Footnotes primary={primary} extraNotes={extraNotes} />
    </CardShell>
  );
}
