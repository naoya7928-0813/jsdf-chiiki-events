// イベント詳細: 公共交通機関でのアクセス。
//
// 流れ: ボタンで開く → 会場（入場口）と会場の最寄り駅の候補 → 出発地（現在地 or 手入力）→ 経路。
// - 位置情報は「現在地を使う」を押したときだけ取得し、画面の状態にだけ持つ（保存・送信しない。
//   経路APIを接続した場合のみ、検索のために /api/transit へ送る）
// - 最寄り駅は直線距離の近い順の「候補」。断定せず利用者に選ばせる（徒歩経路は地図で確認）
// - 経路・運賃・所要時間は経路APIの応答だけを表示する。未接続・失敗時は Google マップの経路検索へ案内する
// 調査と構成の理由: docs/TRANSIT_API_2026-10.md / ロジック: shared/transit.cjs
import { useState, useEffect, useRef } from 'react';
import { SectionTitle, F } from './Shared';
import { nearestStations, resolveDestination, googleDirectionsUrl, formatDistance, sanitizeAccess, sanitizeRoutes, STATION_SOURCE } from '../../shared/transit.cjs';
import { sanitizePublicGuide } from '../../shared/eventGuide.cjs';

let stationsPromise = null;
function loadStations() {
  if (!stationsPromise) {
    stationsPromise = fetch('/data/stations.json')
      .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .catch(err => { stationsPromise = null; throw err; });
  }
  return stationsPromise;
}

const REASON_TEXT = {
  not_configured: 'このアプリでは経路・運賃・所要時間の検索を行っていません。下のボタンから Google マップで確認できます。',
  quota: '今月の経路検索の上限に達しました。Google マップで確認してください。',
  timeout: '経路検索が時間内に応答しませんでした。Google マップで確認してください。',
  no_route: '経路が見つかりませんでした。Google マップで確認してください。',
  unavailable: '経路検索を一時的に利用できません。Google マップで確認してください。',
  network: '通信できませんでした。電波の良い場所で再度お試しいただくか、Google マップで確認してください。',
};
const MODE_LABEL = { walk: '徒歩', train: '電車', subway: '地下鉄', bus: 'バス', ferry: '船', air: '飛行機', other: '移動' };

const linesText = (s) => [...new Set(s.lines.map(l => l.line))].slice(0, 4).join('・');

function LinkButton({ href, children, primary }) {
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 42, padding: '8px 12px',
      borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 700, fontFamily: F.sans,
      background: primary ? 'var(--brand-fg)' : 'var(--tag-bg)', color: primary ? 'var(--bg)' : 'var(--text)',
      border: primary ? 'none' : '1px solid var(--border)', textAlign: 'center',
    }}>{children}</a>
  );
}

export default function AccessGuide({ ev, online = true }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [dataErr, setDataErr] = useState(false);
  const [geo, setGeo] = useState({ status: 'idle', coords: null });
  const [picked, setPicked] = useState(null);         // 選んだ出発駅
  const [manual, setManual] = useState('');           // 手入力の出発地
  const [route, setRoute] = useState(null);           // /api/transit の結果
  const [searching, setSearching] = useState(false);
  const manualRef = useRef(null);

  // 別のイベントへ移ったら位置・選択を捨てる（位置情報を持ち回らない）
  useEffect(() => { setOpen(false); setGeo({ status: 'idle', coords: null }); setPicked(null); setManual(''); setRoute(null); }, [ev && ev.id]);
  useEffect(() => {
    if (!open || data) return;
    loadStations().then(setData).catch(() => setDataErr(true));
  }, [open, data]);

  if (!ev) return null;
  const access = sanitizeAccess(ev.access);
  const dest = resolveDestination(ev);
  const parking = sanitizePublicGuide(ev.guide).find(g => g.id === 'parking');
  const hasDestCoords = Number.isFinite(dest.lat) && Number.isFinite(dest.lon);
  const venueStations = data && hasDestCoords ? nearestStations(data, dest.lat, dest.lon, { limit: 3, maxM: 4000 }) : [];
  const nearMe = data && geo.coords ? nearestStations(data, geo.coords.lat, geo.coords.lon, { limit: 5, maxM: 3000 }) : [];
  const nearMeWide = data && geo.coords && !nearMe.length ? nearestStations(data, geo.coords.lat, geo.coords.lon, { limit: 3, maxM: 15000 }) : [];

  function locate() {
    setRoute(null);
    if (typeof navigator === 'undefined' || !navigator.geolocation) { setGeo({ status: 'unsupported', coords: null }); return; }
    setGeo({ status: 'locating', coords: null });
    navigator.geolocation.getCurrentPosition(
      pos => { setGeo({ status: 'ok', coords: { lat: pos.coords.latitude, lon: pos.coords.longitude } }); setPicked(null); },
      err => {
        setGeo({ status: err && err.code === 1 ? 'denied' : 'failed', coords: null });
        setTimeout(() => manualRef.current?.focus(), 50);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  }

  // 経路の出発地: 選んだ駅 > 手入力 > 現在地
  const origin = picked ? { lat: picked.lat, lon: picked.lon }
    : manual.trim() ? { query: manual.trim() }
    : geo.coords ? { lat: geo.coords.lat, lon: geo.coords.lon } : null;
  const destination = hasDestCoords ? { lat: dest.lat, lon: dest.lon } : (dest.query ? { query: dest.query } : null);
  const transitUrl = destination ? googleDirectionsUrl({ origin, destination, mode: 'transit' }) : '';

  async function search() {
    if (!origin || !destination) return;
    setSearching(true); setRoute(null);
    try {
      const r = await fetch('/api/transit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: origin, to: destination, date: ev.date }),
        signal: AbortSignal.timeout ? AbortSignal.timeout(12000) : undefined,
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.available) setRoute({ ok: true, routes: sanitizeRoutes(j.routes) });
      else setRoute({ ok: false, reason: j.reason || 'unavailable' });
    } catch { setRoute({ ok: false, reason: 'network' }); }
    finally { setSearching(false); }
  }

  const card = { background: 'var(--card)', borderRadius: 12, border: '1px solid var(--border)', padding: 14 };
  const small = { fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7 };

  return (
    <div style={{ padding: '6px 16px 14px' }}>
      <SectionTitle>公共交通機関でのアクセス</SectionTitle>
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} style={{
          width: '100%', minHeight: 46, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card)',
          color: 'var(--text)', fontSize: 14, fontWeight: 700, fontFamily: F.sans, cursor: 'pointer',
        }}>
          駅・経路を調べる
        </button>
      ) : (
        <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* 目的地（入場口） */}
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--brand-fg)', marginBottom: 4 }}>目的地</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
              {dest.label || '会場'}{dest.basis === 'entrance' ? '（来場者用入口）' : ''}
            </div>
            {access?.entranceLabel && <div style={small}>入場: {access.entranceLabel}</div>}
            {dest.basis === 'text' && <div style={small}>会場の位置が特定できていないため、住所・会場名で検索します。</div>}
            {dest.basis === 'none' && <div style={small}>会場の情報がありません。公式ページでご確認ください。</div>}
            {access?.station && <div style={{ ...small, color: 'var(--text)' }}>主催者が案内する最寄り駅: <strong>{access.station}</strong></div>}
            {access?.busStop && <div style={{ ...small, color: 'var(--text)' }}>主催者が案内するバス停: <strong>{access.busStop}</strong></div>}
            {access?.notes && <div style={{ ...small, color: 'var(--text)', whiteSpace: 'pre-line' }}>{access.notes}</div>}
            {parking && <div style={small}>駐車場: {parking.text}</div>}
            {access?.url && <a href={access.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--brand-fg)' }}>公式のアクセス案内を見る</a>}
          </div>

          {/* 会場の最寄り駅（候補） */}
          {hasDestCoords && (
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--brand-fg)', marginBottom: 4 }}>会場近くの駅（直線距離が近い順の候補）</div>
              {dataErr && <div style={small}>駅データを読み込めませんでした{online ? '' : '（オフライン）'}。</div>}
              {!data && !dataErr && <div style={small}>読み込み中…</div>}
              {data && !venueStations.length && <div style={small}>4km 以内に駅が見つかりません。バスなどの経路は Google マップで確認してください。</div>}
              {venueStations.map(s => (
                <div key={`${s.name}-${s.lat}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderTop: '1px solid var(--sep)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, color: 'var(--text)', fontWeight: 600 }}>{s.name}駅 <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 12 }}>直線 {formatDistance(s.distanceM)}</span></div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{linesText(s)}</div>
                  </div>
                  <a href={googleDirectionsUrl({ origin: { lat: s.lat, lon: s.lon }, destination, mode: 'walking' })} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand-fg)', flexShrink: 0 }}>駅からの徒歩ルート</a>
                </div>
              ))}
            </div>
          )}

          {/* 出発地 */}
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--brand-fg)', marginBottom: 6 }}>出発地</div>
            <button type="button" onClick={locate} disabled={geo.status === 'locating'} style={{
              width: '100%', minHeight: 42, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--tag-bg)',
              color: 'var(--text)', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginBottom: 6,
            }}>{geo.status === 'locating' ? '現在地を確認中…' : '現在地から探す'}</button>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, lineHeight: 1.6 }}>
              位置情報は近くの駅を探すためだけに使い、保存しません（許可しなくても下の欄に入力できます）。
            </div>
            {geo.status === 'denied' && <div style={{ ...small, color: '#b45309' }}>位置情報の利用が許可されませんでした。出発駅や地域を入力してください。</div>}
            {(geo.status === 'failed' || geo.status === 'unsupported') && <div style={{ ...small, color: '#b45309' }}>現在地を取得できませんでした。出発駅や地域を入力してください。</div>}

            {geo.coords && data && (
              <div role="radiogroup" aria-label="出発する駅" style={{ marginBottom: 6 }}>
                {nearMe.length ? <div style={small}>近くの駅（直線距離が近い順）。利用する駅を選んでください:</div>
                  : <div style={small}>3km 以内に駅が見つかりません。バス停など他の交通手段は Google マップで確認してください。</div>}
                {(nearMe.length ? nearMe : nearMeWide).map(s => {
                  const on = picked && picked.name === s.name && picked.lat === s.lat;
                  return (
                    <label key={`${s.name}-${s.lat}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderTop: '1px solid var(--sep)', cursor: 'pointer' }}>
                      <input type="radio" name="origin-station" checked={!!on} onChange={() => { setPicked(s); setManual(''); setRoute(null); }} />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: 13.5, color: 'var(--text)', fontWeight: 600 }}>{s.name}駅</span>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}> 直線 {formatDistance(s.distanceM)}</span>
                        <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{linesText(s)}</span>
                      </span>
                      {on && geo.coords && (
                        <a href={googleDirectionsUrl({ origin: geo.coords, destination: { lat: s.lat, lon: s.lon }, mode: 'walking' })} target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand-fg)', flexShrink: 0 }}>駅までの徒歩ルート</a>
                      )}
                    </label>
                  );
                })}
              </div>
            )}

            <input ref={manualRef} value={manual} onChange={e => { setManual(e.target.value); setPicked(null); setRoute(null); }} maxLength={80}
              placeholder="出発駅・地域を入力（例: 新宿駅、宇都宮市）" aria-label="出発駅・地域"
              style={{ width: '100%', boxSizing: 'border-box', fontSize: 14, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }} />
          </div>

          {/* 経路 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {origin && destination && (
              <button type="button" onClick={search} disabled={searching || !online} style={{
                minHeight: 44, borderRadius: 8, border: 'none', background: 'var(--brand-fg)', color: 'var(--bg)',
                fontSize: 14, fontWeight: 700, cursor: searching || !online ? 'default' : 'pointer', opacity: online ? 1 : 0.6,
              }}>{searching ? '検索中…' : '経路を検索'}</button>
            )}
            {!online && <div style={small}>オフラインのため経路を検索できません。</div>}
            {route && route.ok && route.routes.map((r, i) => (
              <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 10 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
                  経路{i + 1}
                  {r.summary.departure && r.summary.arrival && ` ${r.summary.departure}→${r.summary.arrival}`}
                  {Number.isFinite(r.summary.durationMin) && `・${r.summary.durationMin}分`}
                  {Number.isFinite(r.summary.transfers) && `・乗換${r.summary.transfers}回`}
                  {Number.isFinite(r.summary.fareYen) && `・${r.summary.fareYen.toLocaleString()}円`}
                </div>
                {r.legs.map((l, k) => (
                  <div key={k} style={{ fontSize: 12.5, color: 'var(--text)', lineHeight: 1.7 }}>
                    {MODE_LABEL[l.mode]}{l.line ? `（${l.line}）` : ''}{l.from || l.to ? `：${l.from || ''}${l.from && l.to ? ' → ' : ''}${l.to || ''}` : ''}
                    {Number.isFinite(l.durationMin) ? `・${l.durationMin}分` : ''}
                  </div>
                ))}
              </div>
            ))}
            {route && !route.ok && <div style={{ ...small, color: 'var(--text)' }}>{REASON_TEXT[route.reason] || REASON_TEXT.unavailable}</div>}
            <LinkButton href={transitUrl} primary={!origin}>Google マップで公共交通機関の経路を見る ↗</LinkButton>
            <div style={{ fontSize: 10.5, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              運賃・所要時間・乗換はこのアプリでは推測で表示しません。駅の位置: {STATION_SOURCE}。距離は直線距離です。
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
