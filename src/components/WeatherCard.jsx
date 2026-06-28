import { useState, useEffect } from 'react';
import { F, SectionTitle } from './Shared';

// WMO weather code → 日本語名称 + 絵文字アイコン（Open-Meteo の weather_code に対応）
const WMO = {
  0:  ['快晴', '☀️'],
  1:  ['晴れ', '🌤️'], 2: ['薄曇り', '⛅'], 3: ['曇り', '☁️'],
  45: ['霧', '🌫️'], 48: ['霧（着氷）', '🌫️'],
  51: ['霧雨（弱）', '🌦️'], 53: ['霧雨', '🌦️'], 55: ['霧雨（強）', '🌦️'],
  56: ['着氷性の霧雨', '🌧️'], 57: ['着氷性の霧雨', '🌧️'],
  61: ['弱い雨', '🌦️'], 63: ['雨', '🌧️'], 65: ['強い雨', '🌧️'],
  66: ['着氷性の雨', '🌧️'], 67: ['着氷性の雨', '🌧️'],
  71: ['弱い雪', '🌨️'], 73: ['雪', '🌨️'], 75: ['強い雪', '❄️'],
  77: ['霧雪', '🌨️'],
  80: ['にわか雨（弱）', '🌦️'], 81: ['にわか雨', '🌧️'], 82: ['激しいにわか雨', '⛈️'],
  85: ['にわか雪', '🌨️'], 86: ['強いにわか雪', '❄️'],
  95: ['雷雨', '⛈️'], 96: ['雷雨（ひょう）', '⛈️'], 99: ['激しい雷雨（ひょう）', '⛈️'],
};
function describeCode(code) {
  return WMO[code] || ['天気', '🌡️'];
}

/** JST 今日 "YYYY-MM-DD" */
function jstToday() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
function daysBetween(a, b) {
  const da = Date.parse(a + 'T00:00:00Z');
  const db = Date.parse(b + 'T00:00:00Z');
  if (Number.isNaN(da) || Number.isNaN(db)) return NaN;
  return Math.round((db - da) / 86400000);
}
function fmtFetched(iso) {
  try {
    return new Date(iso).toLocaleString('ja-JP', {
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo',
    });
  } catch { return ''; }
}

const FORECAST_MAX_DAYS = 16;

// 天気カードの外枠（状態表示も共通の枠を使う）
function CardShell({ children, primary, heading }) {
  return (
    <div style={{ padding: '6px 16px 14px' }}>
      <SectionTitle>{heading}</SectionTitle>
      <div style={{ background: 'var(--card)', borderRadius: 12, border: '1px solid var(--border)', padding: 14 }}>
        {children}
      </div>
    </div>
  );
}

// 注記＋出典（天気カード下部に常に表示）
function Disclaimer({ primary }) {
  return (
    <div style={{
      marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--sep)',
      fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.7, fontFamily: F.sans,
    }}>
      <div>天気は参考情報であり、開催可否は公式情報を確認してください。</div>
      <div style={{ marginTop: 4 }}>
        出典: <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer"
          style={{ color: primary, textDecoration: 'none' }}>Open-Meteo</a>
      </div>
    </div>
  );
}

function StatLine({ label, value, primary }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '5px 0' }}>
      <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: F.sans }}>{label}</span>
      <span style={{ fontSize: 14, color: 'var(--text)', fontWeight: 600, fontFamily: F.mono }}>{value}</span>
    </div>
  );
}

/**
 * イベント詳細画面の天気カード。
 * - 開催日が今日から0〜16日以内のときのみ /api/weather を遅延取得する。
 * - 17日以上先 / 座標なし / API エラー / 終了済みはそれぞれ状態表示（API を呼ばない）。
 */
export default function WeatherCard({ event, theme }) {
  const primary = theme?.primary || '#0b2545';
  const ev = event;

  const loc = ev?.weatherLocation;
  const hasCoords = !!(loc && typeof loc.latitude === 'number' && typeof loc.longitude === 'number');
  const today = jstToday();
  const eventEnd = ev?.endDate || ev?.date;
  const isEnded = !!ev?.ended || (eventEnd && eventEnd < today);
  const daysAhead = ev?.date ? daysBetween(today, ev.date) : NaN;
  const inRange = Number.isFinite(daysAhead) && daysAhead >= 0 && daysAhead <= FORECAST_MAX_DAYS;
  const shouldFetch = !isEnded && hasCoords && inRange;

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

  // 終了済みは天気カードを出さない（API も呼ばない）
  if (isEnded) return null;

  // 座標なし
  if (!hasCoords) {
    return (
      <CardShell heading="開催日の天気" primary={primary}>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7, fontFamily: F.sans }}>
          天気表示に必要な位置情報を取得できませんでした。
        </div>
        <Disclaimer primary={primary} />
      </CardShell>
    );
  }

  // 17日以上先（予報発表前）
  if (Number.isFinite(daysAhead) && daysAhead > FORECAST_MAX_DAYS) {
    return (
      <CardShell heading="開催日の天気（予報発表前）" primary={primary}>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7, fontFamily: F.sans }}>
          天気予報は開催日の{FORECAST_MAX_DAYS}日前から表示されます。
        </div>
        <Disclaimer primary={primary} />
      </CardShell>
    );
  }

  // 範囲内（0〜16日）。8〜16日前は「参考予報」、7日以内は「開催日の天気予報」
  const isReference = daysAhead >= 8;
  const heading = isReference ? '開催日の天気（参考予報）' : '開催日の天気予報';

  if (state.status === 'loading' || state.status === 'idle') {
    return (
      <CardShell heading={heading} primary={primary}>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: F.sans }}>天気情報を取得しています…</div>
      </CardShell>
    );
  }

  if (state.status === 'error') {
    return (
      <CardShell heading={heading} primary={primary}>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7, fontFamily: F.sans }}>
          天気情報を取得できませんでした。
        </div>
        <Disclaimer primary={primary} />
      </CardShell>
    );
  }

  const d = state.data || {};
  const [name, icon] = describeCode(d.weatherCode);
  const u = d.units || {};
  const tMax = typeof d.temperatureMax === 'number' ? `${Math.round(d.temperatureMax)}${u.temperature || '°C'}` : '—';
  const tMin = typeof d.temperatureMin === 'number' ? `${Math.round(d.temperatureMin)}${u.temperature || '°C'}` : '—';
  const pop  = typeof d.precipitationProbabilityMax === 'number' ? `${d.precipitationProbabilityMax}${u.precipitationProbability || '%'}` : '—';
  const wind = typeof d.windSpeedMax === 'number' ? `${Math.round(d.windSpeedMax)} ${u.windSpeed || 'km/h'}` : '—';

  return (
    <CardShell heading={heading} primary={primary}>
      {isReference && (
        <div style={{
          display: 'inline-block', fontSize: 10, fontWeight: 700, fontFamily: F.mono,
          padding: '3px 8px', borderRadius: 4, marginBottom: 10,
          background: `${primary}12`, color: primary, letterSpacing: 1,
        }}>参考予報</div>
      )}
      {/* 天気アイコン + 名称 + 最高/最低気温 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 6 }}>
        <div style={{ fontSize: 40, lineHeight: 1 }} aria-hidden="true">{icon}</div>
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
        <StatLine label="降水確率" value={pop} primary={primary} />
        <StatLine label="最大風速" value={wind} primary={primary} />
      </div>
      {d.fetchedAt && (
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6, fontFamily: F.mono, textAlign: 'right' }}>
          最終取得 {fmtFetched(d.fetchedAt)}
        </div>
      )}
      <Disclaimer primary={primary} />
    </CardShell>
  );
}
