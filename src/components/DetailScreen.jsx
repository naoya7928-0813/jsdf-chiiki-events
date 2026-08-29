import { useState, useCallback, useEffect, useRef } from 'react';
import { ICO } from './Icons';
import { Emblem, F, splitDate, SectionTitle, iconBtnStyle, StatusBadge } from './Shared';
import { REGION_HQ, REGION_SOURCE } from '../config';
import WeatherCard from './WeatherCard';
import { useElementWidth, isTouchPhone, useIsShortViewport } from '../hooks/useBreakpoint';
import { googleCalendarUrl, downloadIcs } from '../utils/calendar';
import { useOnline } from '../hooks/useOnline';

function officeSourceLabel(ev) {
  if (!ev?.source_type) return null;
  if (ev.source_type === 'office_notice') return '公式確認';
  if (ev.source_type.startsWith('office_')) return '募集案内所';
  return null;
}

export default function DetailScreen({ event, onBack, theme, favorites, applied, onToggleFavorite, onToggleApplied, autoApply, onMarkApplied, onReport, adminAuthed, onEditEvent, weatherMapMode = 'auto' }) {
  // ── フック（Rules of Hooks: 早期 return の前に宣言する） ─────────
  const [copied,    setCopied]    = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [mapOpen,   setMapOpen]   = useState(true);    // 地図は既定で開く（会場位置は毎回見たい情報のため）
  // オフラインでは Google マップの埋め込みが読み込めず、枠内にブラウザの
  // エラーページが出てしまう。事前に代替表示へ切り替える。
  // ⚠ 早期 return（ev が無い場合）より前で呼ぶこと。後ろに置くとフックの数が
  //    レンダーごとに変わり、React が「Rendered fewer hooks than expected」で落ちる。
  const online = useOnline();

  // 本文の実寸で「天気」と「開催場所+地図」を横並びにするか決める。
  //
  // 閾値 660px の根拠: 2カラムに割ると 1 列あたり約 320px 必要（天気カードの
  // 「28°C 20°C」行と、地図の最小実用サイズ）。gap を足して 660px。
  // 一覧の右ペインは「シェル上限1600 − サイドナビ232 − 一覧500 = 最大868px」で、
  // 900px にすると通常の導線（一覧→詳細）では一生横並びにならなかった。
  // 横向きスマホでは高さ393pxのうちヘッダーが240px（61%）を占め本文がほぼ見えない。
  // 高さが足りない画面ではヒーローヘッダーを詰める。
  const shortVp     = useIsShortViewport();
  const bodyRef     = useRef(null);
  const bodyWidth   = useElementWidth(bodyRef);
  // スマホ横向きは幅こそ 852px 等になるが、物理的な画面は 6 インチ程度しかない。
  // PC と同じく2カラムに割ると1列が実寸で小さすぎて読めないため、
  // 端末がスマホなら幅が足りていても縦に積む（PC・タブレットのみ横並び）。
  // 設定で明示指定があればそれに従う。auto は端末で判断する
  // （スマホ横向きは幅こそ足りるが物理画面が小さく、2カラムだと実寸が足りない）。
  // どの設定でも、そもそも幅が 660px 未満なら横並びにはしない。
  const wantSide    = weatherMapMode === 'side'  ? true
                    : weatherMapMode === 'stack' ? false
                    : !isTouchPhone();
  // 必要な最小幅。自動判定は余裕をみて 660px。
  // 利用者が「左右」を明示的に選んだ場合はその意思を尊重し 560px まで許容する
  // （スマホ横向きの本文は約620pxで、660px だと選んでも一生効かないため）。
  const minSideWidth = weatherMapMode === 'side' ? 560 : 660;
  const sideBySide   = bodyWidth >= minSideWidth && wantSide;
  // 見出しの横に日付を添える条件。横向き（縦の余白が乏しい）か、
  // 2ペインになる程度に横幅がある場合（PC・タブレット）。
  const showTitleDate = shortVp || bodyWidth >= 600;

  // ── 掲載元へ遷移 →「戻ってきたら」申請済みにする（設定でON/OFF） ──
  // 開いた瞬間ではなく復帰時に付ける。誤タップで即座に申請済みにならず、
  // 「掲載元を見て戻ってきた＝申込動線に入った」ときだけ記録される。
  // 実際にアプリを離れたこと（hidden / blur）を確認してから復帰を待つため、
  // リンクが開かなかった場合（ポップアップブロック等）は何も起きない。
  const pendingApply = useRef(null);   // { id, left } | null
  useEffect(() => {
    const onLeave = () => {
      if (pendingApply.current) pendingApply.current.left = true;
    };
    const onReturn = () => {
      const p = pendingApply.current;
      if (!p || !p.left || document.visibilityState !== 'visible') return;
      pendingApply.current = null;
      onMarkApplied?.(p.id);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') onLeave(); else onReturn();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur',  onLeave);
    window.addEventListener('focus', onReturn);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur',  onLeave);
      window.removeEventListener('focus', onReturn);
    };
  }, [onMarkApplied]);

  // ev が null のときは空文字で代替（実運用では null になることはない）
  const ev = event;
  // 共有はこのイベントの個別URL（/event/:id）。受け取った相手はアプリ内で
  // 直接このイベント詳細が開く（公式ページへのリンクはカード内に別途あり）
  const shareUrl  = ev?.id
    ? `${window.location.origin}/event/${encodeURIComponent(ev.id)}`
    : (ev?.url || window.location.origin);
  const dateStr   = ev ? (ev.endDate ? `${ev.date}〜${ev.endDate}` : ev.date) : '';

  // ネイティブシェア（Web Share API）
  const handleNativeShare = useCallback(() => {
    if (!ev) return;
    navigator.share({
      title: ev.title,
      text: `${ev.title}\n📅 ${dateStr}　📍 ${ev.place}\n\n自衛隊地本イベント情報で見つけたイベントです。最新情報は公式ページをご確認ください。`,
      url: shareUrl,
    }).catch(() => {});
  }, [ev, dateStr, shareUrl]);

  // クリップボードコピー
  const handleCopy = useCallback(() => {
    if (!ev) return;
    const text = `${ev.title}\n📅 ${dateStr}\n📍 ${ev.place}\n${shareUrl}\n\n※最新情報は各地方協力本部の公式ページをご確認ください`;
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    });
  }, [ev, dateStr, shareUrl]);

  // ── 早期リターン（ev が null の場合：通常は発生しない） ──────────
  if (!ev) return null;

  const starred    = favorites.has(ev.id);
  const isApplied  = applied?.has(ev.id) ?? false;
  const { m, d }  = ev.date ? splitDate(ev.date) : { m: null, d: null };
  const endSplit  = ev.endDate ? splitDate(ev.endDate) : null;
  const todayStr  = new Date(Date.now() + 9*3600*1000).toISOString().slice(0,10);
  const isOngoing = !!(ev.endDate && ev.date < todayStr);

  // ── 見出しの横に日付を出すか ──────────────────────────────
  // PC の2ペインではヒーローヘッダーが固定され、日付ブロックだけが
  // 本文と一緒にスクロールして見えなくなる。横向きでも縦の余白が乏しく
  // 日付までたどり着きにくい。どちらの場合もイベント名の横に日付を添える。
  // 幅の狭い縦持ちスマホは従来どおり（下の日付ブロックがすぐ見える）。
  const titleDate = (() => {
    if (m === null) return '日程未定';
    const wd  = ev.weekday    ? `（${ev.weekday}）`    : '';
    const ewd = ev.endWeekday ? `（${ev.endWeekday}）` : '';
    if (!endSplit) return `${m}/${d}${wd}`;
    // 連日開催。月をまたぐときだけ終了側にも月を付ける
    const end = endSplit.m !== m ? `${endSplit.m}/${endSplit.d}` : `${endSplit.d}`;
    return `${m}/${d}${wd}〜${end}${ewd}`;
  })();
  // 時間も同じ行に添える。未取得なら「時間未定」と明示する（空欄にして
  // 「時間の記載がない」のか「取れていない」のか分からなくしない）。
  const titleTime = ev.time || '時間未定';
  const { primary, accent } = theme;
  const sourceLabel = officeSourceLabel(ev);

  // X 共有テキスト（280字制限配慮・非公式サイト注記あり）
  const shareTextX = `${ev.title}\n📅 ${dateStr}　📍 ${ev.place}\n\n自衛隊地本イベント情報で見つけました。最新情報は公式ページをご確認ください。\n#自衛隊 #地本イベント`;
  // LINE 共有テキスト（詳細注記付き）
  const shareTextLine = `${ev.title}\n📅 ${dateStr}\n📍 ${ev.place}\n\n自衛隊地本イベント情報で見つけたイベントです。\n参加・申込・中止・変更などの最新情報は、必ず公式ページをご確認ください。`;

  // X (Twitter) シェアURL
  const xShareUrl    = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareTextX)}&url=${encodeURIComponent(shareUrl)}`;
  // LINE シェアURL
  const lineShareUrl = `https://line.me/R/msg/text/?${encodeURIComponent(`${shareTextLine}\n${shareUrl}`)}`;

  // pref フィールド優先。旧イベント（pref なし）は ID プレフィックスで判別
  const regionKey = ev.pref
    ?? (ev.id.startsWith('k-') ? 'kanagawa'
      : ev.id.startsWith('s-') ? 'saitama'
      : 'tokyo');
  const hq        = REGION_HQ[regionKey]    ?? REGION_HQ['tokyo'];
  const source    = REGION_SOURCE[regionKey] ?? REGION_SOURCE['tokyo'];

  // 地図クエリ: place が取れていれば表示（address があれば精度向上）
  // 「A×B」「A・B」のように複数会場が列挙される場合は最初の会場のみ Map 検索に使う
  const hasLocation = !!(ev.place && ev.place.trim());
  const primaryPlace = ev.place
    ? ev.place.replace(/×/g, '・').split(/[・\/]/)[0].trim()
    : '';
  const mapQuery    = encodeURIComponent(
    [ev.address || primaryPlace].filter(Boolean).join(' ')
  );
  const mapSrc      = `https://maps.google.com/maps?q=${mapQuery}&output=embed&hl=ja&z=15`;

  // 個別URL → なければ地本公式サイト にフォールバック
  const targetUrl = ev.url || source?.url || '';
  // 掲載元を開く。設定がONなら「戻ってきたとき」に申請済みにする（上の useEffect）
  const armAutoApply = () => {
    if (autoApply && !isApplied) pendingApply.current = { id: ev.id, left: false };
  };
  const openUrl = () => {
    if (!targetUrl) return;
    armAutoApply();
    window.open(targetUrl, '_blank', 'noopener,noreferrer');
  };

  // ヒーローヘッダー。横向き（低い画面）ではスクロール本文の中に入れるため、
  // 置き場所を差し替えられるよう変数にしておく。
  const heroHeader = (
    <div style={{
      paddingTop: shortVp ? 'calc(env(safe-area-inset-top, 0px) + 2px)'
                          : 'calc(env(safe-area-inset-top, 0px) + 8px)',
      background: primary, color: '#fff',
      position: 'relative', overflow: 'hidden', flexShrink: 0,
    }}>
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(45deg,rgba(255,255,255,0.04) 0 12px,transparent 12px 24px)' }} />
      <div style={{ position: 'relative', padding: shortVp ? '2px 16px 6px' : '6px 16px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: shortVp ? 6 : 14 }}>
          <button onClick={onBack} aria-label="戻る" style={iconBtnStyle}>
            {ICO.back('#fff', 16)}
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            {/* 運営者ログイン時: イベントの編集（右上）。手動／自動収集どちらも可 */}
            {adminAuthed && onEditEvent && (
              <button onClick={() => onEditEvent(ev)} aria-label="このイベントを編集" style={{ ...iconBtnStyle, background: '#fff' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={primary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
              </button>
            )}
            {/* 申請済みトグル */}
            <button
              onClick={() => onToggleApplied?.(ev.id)}
              aria-label={isApplied ? '申請済みを解除' : '申請済みにする'}
              style={{
                ...iconBtnStyle,
                background: isApplied ? '#16a34a' : 'rgba(255,255,255,0.1)',
                border: isApplied ? 'none' : '1px solid rgba(255,255,255,0.18)',
              }}
            >
              {ICO.applied(isApplied ? '#fff' : '#fff', 16, isApplied)}
            </button>
            <button onClick={() => onToggleFavorite(ev.id)} aria-label={starred ? 'お気に入り解除' : 'お気に入り登録'} style={{
              ...iconBtnStyle,
              background: starred ? '#fff' : 'rgba(255,255,255,0.1)',
            }}>
              {ICO.star(starred ? accent : '#fff', 16, starred ? accent : 'none')}
            </button>
            {typeof navigator.share === 'function' && (
              <button
                onClick={handleNativeShare}
                aria-label="このイベントを共有"
                style={iconBtnStyle}
              >
                {ICO.share('#fff', 16)}
              </button>
            )}
          </div>
        </div>
    
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* 中止/受付終了を最優先で表示 */}
          <StatusBadge status={ev.status} size="lg" />
          {ev.ended && (
            <div style={{ display: 'inline-block', fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 3, background: '#fff', color: '#6b7280', letterSpacing: 1 }}>終了済み</div>
          )}
          <div style={{
            display: 'inline-block', fontSize: 10, fontFamily: F.mono,
            padding: '3px 8px', borderRadius: 'var(--radius-tag)',
            background: 'rgba(255,255,255,0.15)', letterSpacing: 1.5,
          }}>{ev.category}{ev.tag ? ` · ${ev.tag}` : ''}</div>
          {sourceLabel && (
            <div style={{
              display: 'inline-block', fontSize: 10, fontFamily: F.mono,
              padding: '3px 8px', borderRadius: 3,
              background: 'rgba(255,255,255,0.18)', letterSpacing: 1.2,
            }}>{sourceLabel}</div>
          )}
          {isApplied && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              fontSize: 11, fontWeight: 700, fontFamily: F.mono,
              padding: '3px 10px', borderRadius: 3,
              background: '#16a34a', color: '#fff', letterSpacing: 1,
            }}>
              {ICO.applied('#fff', 12, true)} 申請済み
            </div>
          )}
        </div>
    
        <div style={{
          display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap',
          marginTop: shortVp ? 6 : 12,
        }}>
          {showTitleDate && (
            <div style={{
              flexShrink: 0,
              fontFamily: F.mono, fontSize: shortVp ? 12.5 : 14, fontWeight: 600,
              padding: '3px 9px', borderRadius: 'var(--radius-element)',
              background: 'rgba(255,255,255,0.16)', letterSpacing: 0.5,
              whiteSpace: 'nowrap',
            }}>
              {isOngoing ? `開催中 ${titleDate}` : titleDate}
              <span style={{ opacity: 0.55, margin: '0 6px' }}>|</span>
              <span style={{ opacity: ev.time ? 1 : 0.7 }}>{titleTime}</span>
            </div>
          )}
          <div style={{
            fontFamily: F.serif, fontSize: shortVp ? 17 : 21, fontWeight: 600,
            lineHeight: 1.3, minWidth: 0, flex: '1 1 auto',
          }}>
            {ev.title}
          </div>
        </div>
    
        {/* 日時ブロック。見出しの横に日付・時間を出しているときは重複するので描かない
            （PC・横向きでは見出し行だけで日時が分かる） */}
        {!showTitleDate && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, marginTop: shortVp ? 5 : 14,
          paddingTop: shortVp ? 5 : 14,
          borderTop: shortVp ? 'none' : '1px solid rgba(255,255,255,0.15)',
        }}>
          <div style={{
            minWidth: 56, textAlign: 'center', padding: '6px 10px',
            background: 'rgba(255,255,255,0.12)', borderRadius: 8,
          }}>
            {m !== null ? (
              <>
                <div style={{ fontSize: 9, fontFamily: F.mono, opacity: 0.8 }}>
                  {endSplit && endSplit.m !== m ? `${m}〜${endSplit.m}月` : `${m}月`}
                </div>
                <div style={{ fontFamily: F.serif, fontSize: endSplit ? 15 : 24, fontWeight: 600, lineHeight: 1 }}>
                  {endSplit ? `${d}〜${endSplit.d}日` : d}
                </div>
                {ev.weekday && (
                  <div style={{ fontSize: 9, marginTop: 2 }}>
                    {isOngoing ? '開催中' : `(${ev.endWeekday ? `${ev.weekday}〜${ev.endWeekday}` : ev.weekday})`}
                  </div>
                )}
              </>
            ) : (
              /* 日程未定（CF ブロックで日付取得不能） */
              <div style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 600, lineHeight: 1.6, opacity: 0.85 }}>
                日程<br/>未定
              </div>
            )}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, opacity: 0.65, fontFamily: F.mono, letterSpacing: 1 }}>TIME</div>
            {ev.time ? (
              <div style={{ fontSize: 15, fontFamily: F.mono, fontWeight: 500, marginTop: 2 }}>
                {ev.time}
              </div>
            ) : (
              <div style={{ marginTop: 2 }}>
                <div style={{ fontSize: 14, fontFamily: F.mono, fontWeight: 500, color: 'rgba(255,255,255,0.6)' }}>
                  時間未定
                </div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', marginTop: 2, lineHeight: 1.5 }}>
                  公式ページでご確認ください
                </div>
              </div>
            )}
          </div>
        </div>
        )}
      </div>
    </div>
  );

  // カレンダー登録・共有。横向きでは固定CTAに置かず本文末尾へ移す。
  const secondaryActions = (
    <>
      {/* カレンダー登録（Google / iPhone・その他=.ics） */}
      <div style={{ display: 'flex', gap: 8 }}>
        <a
          href={googleCalendarUrl(ev)} target="_blank" rel="noopener noreferrer"
          aria-label="Googleカレンダーに追加"
          style={{
            flex: 1, height: 42, borderRadius: 8, border: '1px solid var(--border)',
            background: 'var(--tag-bg)', color: 'var(--text)', textDecoration: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            fontSize: 12.5, fontWeight: 600, fontFamily: F.sans, cursor: 'pointer',
          }}
        >
          {ICO.cal('var(--text)', 15)} Googleカレンダー
        </a>
        <button
          onClick={() => downloadIcs(ev)}
          aria-label="カレンダーに追加（iPhone・その他）"
          style={{
            flex: 1, height: 42, borderRadius: 8, border: '1px solid var(--border)',
            background: 'var(--tag-bg)', color: 'var(--text)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            fontSize: 12.5, fontWeight: 600, fontFamily: F.sans, cursor: 'pointer',
          }}
        >
          {ICO.cal('var(--text)', 15)} iPhone・その他
        </button>
      </div>
      
      {/* 共有エリア：「このイベントを共有」ボタン → 展開して手段を選択 */}
      {!shareOpen ? (
        <button
          onClick={() => setShareOpen(true)}
          aria-label="このイベントを共有"
          style={{
            width: '100%', height: 42, borderRadius: 8,
            border: `1px solid var(--border)`,
            background: 'var(--tag-bg)', color: 'var(--text)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            fontSize: 13, fontWeight: 600, fontFamily: F.sans, cursor: 'pointer',
          }}
        >
          {ICO.share('var(--text-muted)', 14)} このイベントを共有
        </button>
      ) : (
        <div>
          {/* 共有方法の選択ラベル＋閉じるボタン */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 7,
          }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: F.sans }}>
              共有方法を選択してください
            </span>
            <button
              onClick={() => setShareOpen(false)}
              aria-label="共有メニューを閉じる"
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 11, color: 'var(--text-muted)', fontFamily: F.sans, padding: '2px 4px',
              }}
            >
              閉じる
            </button>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {/* X (旧Twitter) でシェア */}
            <a
              href={xShareUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="X (旧Twitter) でシェア"
              style={{
                flex: 1, height: 42, borderRadius: 8,
                background: '#000', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                textDecoration: 'none', fontSize: 11, fontWeight: 700, fontFamily: F.sans,
              }}
            >
              {ICO.twitterX('#fff', 13)}
              <span>X でシェア</span>
            </a>
      
            {/* LINE で送る */}
            <a
              href={lineShareUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="LINE で送る"
              style={{
                flex: 1, height: 42, borderRadius: 8,
                background: '#06C755', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                textDecoration: 'none', fontSize: 11, fontWeight: 700, fontFamily: F.sans,
              }}
            >
              {ICO.lineApp('#fff', 14)}
              <span>LINE で送る</span>
            </a>
      
            {/* URLをコピー */}
            <button
              onClick={handleCopy}
              aria-label="URLをコピー"
              style={{
                flex: 1, height: 42, borderRadius: 8, border: '1px solid var(--border)',
                background: copied ? `${primary}18` : 'var(--tag-bg)',
                color: copied ? primary : 'var(--text-muted)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                fontSize: 11, fontWeight: 600, fontFamily: F.sans,
                cursor: 'pointer', transition: 'background 0.2s, color 0.2s',
              }}
            >
              {copied
                ? <>{ICO.check(primary, 12)} コピー済</>
                : <>{ICO.copy('var(--text-muted)', 13)} URLをコピー</>
              }
            </button>
          </div>
        </div>
      )}
    </>
  );

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)', fontFamily: F.sans }}>
      {/* ヒーローヘッダー（横向きは本文と一緒にスクロールさせる） */}
      {!shortVp && heroHeader}

      {/* スクロール本文
           ホームから直接開くとデスクトップでは幅いっぱい（約1200px）になり、
           「降水確率 …… 30%」のように行が間延びして読みにくい。
           一覧の2ペイン（約700px）と体感を揃えるため上限を設ける。 */}
      <div ref={bodyRef} style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '16px 0' }}>
        {shortVp && heroHeader}
        <div style={{ maxWidth: sideBySide ? 1200 : 860, margin: '0 auto', width: '100%' }}>

        {/* 横長のときは 天気 と 開催場所+地図 を横並びにする。
            縦に積むと地図まで必ずスクロールが要るため、広い画面では並べて
            両方を一度に見せる。狭いペインでは従来どおり縦積み。 */}
        <div style={sideBySide
          ? { display: 'flex', alignItems: 'flex-start', gap: 4 }
          : undefined}>
          <div style={sideBySide ? { flex: '1 1 0', minWidth: 0 } : undefined}>
            {/* 開催日の天気（詳細画面でのみ遅延取得） */}
            <WeatherCard event={ev} theme={theme} />
          </div>
          <div style={sideBySide ? { flex: '1 1 0', minWidth: 0 } : undefined}>

        {/* 開催場所 + 地図 */}
        <div style={{ padding: '6px 16px 14px' }}>
          <SectionTitle>開催場所</SectionTitle>
          <div style={{ background: 'var(--card)', borderRadius: 12, border: '1px solid var(--border)', padding: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: ev.address ? 4 : 12 }}>
              {ev.place}
            </div>
            {ev.address && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>{ev.address}</div>
            )}
            {/* インライン地図（折り畳み）— place が取れていれば表示。
                開いたときに初めて iframe を読み込む */}
            {hasLocation ? (
              <>
                <button
                  onClick={() => setMapOpen(v => !v)}
                  aria-expanded={mapOpen}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    gap: 10, minHeight: 42, padding: '10px 12px',
                    borderRadius: 8, border: '1px solid var(--border)',
                    background: 'var(--bg)', cursor: 'pointer',
                    fontFamily: F.sans, textAlign: 'left',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                    {ICO.pin('var(--text-muted)', 14)}
                    {mapOpen ? '地図を隠す' : '地図を表示'}
                  </span>
                  <span style={{ display: 'flex', transition: 'transform 0.2s', transform: mapOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                      <path d="M9 18l6-6-6-6" stroke="var(--icon-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </span>
                </button>
                {mapOpen && (
                  <>
                    <div style={{ marginTop: 8, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)', height: 200, position: 'relative', background: 'var(--card)' }}>
                      {/* 読み込み中フォールバック（オフライン時はそのまま案内として残る） */}
                      <div style={{
                        position: 'absolute', inset: 0,
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        gap: 6, pointerEvents: 'none', padding: '0 16px', textAlign: 'center',
                      }}>
                        {ICO.pin('var(--text-muted)', 26)}
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: F.sans, lineHeight: 1.7 }}>
                          {online
                            ? '地図を読み込んでいます…'
                            : 'オフラインのため地図を表示できません。会場名・住所は上に表示しています。'}
                        </span>
                      </div>
                      {online && (
                        <iframe
                          src={mapSrc}
                          width="100%"
                          height="200"
                          style={{ border: 0, display: 'block', position: 'relative', zIndex: 1 }}
                          loading="lazy"
                          referrerPolicy="no-referrer-when-downgrade"
                          title={`${ev.place}の地図`}
                        />
                      )}
                    </div>
                    {/* Google Maps で開くリンク */}
                    <a
                      href={`https://maps.google.com/maps?q=${mapQuery}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        marginTop: 8, padding: '10px 12px', borderRadius: 8,
                        border: `1px solid ${primary}33`, color: primary,
                        fontSize: 13, textDecoration: 'none', fontFamily: F.sans,
                        background: `${primary}06`,
                      }}
                    >
                      {ICO.extLink(primary, 13)} Google Maps で開く
                    </a>
                  </>
                )}
              </>
            ) : (
              /* place も空：プレースホルダーを表示 */
              <div style={{
                borderRadius: 8, border: '1px solid var(--border)',
                background: 'var(--bg)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: 10, padding: '24px 16px', textAlign: 'center',
              }}>
                {ICO.pin('var(--text-muted)', 28)}
                <div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>
                    場所情報がありません
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.7 }}>
                    詳細な開催場所は公式ページをご確認ください
                  </div>
                </div>
                {targetUrl && (
                  <a
                    href={targetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={armAutoApply}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '8px 16px', borderRadius: 8,
                      border: `1px solid ${primary}33`, color: primary,
                      fontSize: 12, textDecoration: 'none', fontFamily: F.sans,
                      background: `${primary}08`, fontWeight: 600,
                    }}
                  >
                    {ICO.extLink(primary, 12)} 公式ページを確認する
                  </a>
                )}
              </div>
            )}
          </div>
        </div>

          </div>
        </div>
        {/* ここまでが 天気 / 開催場所 の横並びブロック */}

        {/* 参加資格・締切 */}
        {(ev.ageRequirement || ev.deadline) && (
          <div style={{ padding: '6px 16px 14px' }}>
            <SectionTitle>参加資格・締切</SectionTitle>
            <div style={{ background: 'var(--card)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
              {ev.ageRequirement && (
                <div style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px',
                  borderBottom: ev.deadline ? '1px solid var(--sep)' : 'none',
                }}>
                  <div style={{ fontSize: 10, fontFamily: 'monospace', color: primary, fontWeight: 700, paddingTop: 2, minWidth: 52 }}>年齢</div>
                  <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.6 }}>{ev.ageRequirement}</div>
                </div>
              )}
              {ev.deadline && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px' }}>
                  <div style={{ fontSize: 10, fontFamily: 'monospace', color: primary, fontWeight: 700, paddingTop: 2, minWidth: 52 }}>締切</div>
                  <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.6 }}>{ev.deadline}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 参加時の注意事項 */}
        {ev.notes && (
          <div style={{ padding: '6px 16px 14px' }}>
            <SectionTitle>イベント内容</SectionTitle>
            <div style={{
              background: 'var(--card)', borderRadius: 12,
              border: '1px solid var(--border)', padding: '14px 16px',
            }}>
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{
                  width: 22, height: 22, borderRadius: '50%',
                  background: `${primary}18`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, marginTop: 1,
                }}>
                  {ICO.check(primary, 12)}
                </div>
                <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.75, flex: 1, whiteSpace: 'pre-line' }}>
                  {ev.notes}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 主催・お問い合わせ */}
        <div style={{ padding: '6px 16px 20px' }}>
          <SectionTitle>主催・お問い合わせ</SectionTitle>
          <div style={{ background: 'var(--card)', borderRadius: 12, border: '1px solid var(--border)', padding: 14 }}>
            {/* 担当事務所（place が地本名でなければ表示） */}
            {ev.place && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: '50%',
                  background: `${primary}18`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  {ICO.pin(primary, 16)}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{ev.place}</div>
              </div>
            )}
            {/* 地本本部（電話番号フォールバック） */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              paddingTop: ev.place ? 12 : 0,
              borderTop: ev.place ? '1px solid var(--sep)' : 'none',
            }}>
              <Emblem ch={hq.emblem} size={38} primary={primary} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{hq.name}</div>
                <a href={`tel:${hq.tel.replace(/-/g, '')}`} style={{
                  fontSize: 12, color: primary, marginTop: 2, display: 'block',
                  fontFamily: F.mono, textDecoration: 'none',
                }}>
                  {hq.tel}
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* 掲載元・公式確認 */}
        <div style={{ padding: '0 16px 20px' }}>
          <div style={{
            borderRadius: 10,
            border: '1px solid var(--border)',
            background: 'var(--card)',
            padding: '12px 14px',
          }}>
            {/* 掲載元（どの地方協力本部が公開しているか） */}
            <div style={{ marginBottom: 10 }}>
              <div style={{
                fontSize: 10, fontWeight: 700, letterSpacing: 1.5,
                color: 'var(--text-muted)', marginBottom: 4,
              }}>
                掲載元
              </div>
              <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500, lineHeight: 1.5 }}>
                {source.name}
              </div>
            </div>
            {/* 公式ページで確認（最新情報・申込方法・変更確認用の外部リンク） */}
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={armAutoApply}
              aria-label={`${source.name}の公式ページで確認（外部サイトへ移動）`}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '9px 12px', borderRadius: 8,
                border: `1px solid ${primary}33`, color: primary,
                fontSize: 12, textDecoration: 'none', fontFamily: F.sans,
                background: `${primary}06`, fontWeight: 600,
                marginBottom: 10,
              }}
            >
              {ICO.extLink(primary, 12)} 公式ページで確認
            </a>
            {/* 非公式サイトの注記 */}
            <div style={{
              fontSize: 11, color: 'var(--text-muted)',
              lineHeight: 1.75, paddingTop: 8, borderTop: '1px solid var(--sep)',
            }}>
              当サイトは有志による非公式サイトです。防衛省・自衛隊および各地方協力本部とは直接関係ありません。イベントの開催可否・申込方法・変更などは、必ず公式ページで最新情報をご確認ください。
            </div>
            {/* この情報の誤りを報告（イベントID・地本名を引き継ぐ） */}
            {onReport && (
              <button
                onClick={() => onReport(ev, regionKey)}
                style={{
                  marginTop: 10, width: '100%', minHeight: 40,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  background: 'transparent', border: '1px solid var(--border)', borderRadius: 8,
                  color: 'var(--text-muted)', fontSize: 12, fontWeight: 600,
                  fontFamily: F.sans, cursor: 'pointer',
                }}
              >
                この情報の誤りを報告する
              </button>
            )}
          </div>
        </div>
        {shortVp && (
          <div style={{ padding: '4px 16px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {secondaryActions}
          </div>
        )}
        </div>
      </div>

      {/* 下部 CTA */}
      <div style={{
        padding: shortVp ? '6px 12px' : '10px 16px',
        paddingBottom: shortVp ? 'calc(env(safe-area-inset-bottom,0px) + 6px)'
                               : 'calc(env(safe-area-inset-bottom,0px) + 12px)',
        background: 'var(--card)', borderTop: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', gap: shortVp ? 5 : 8, flexShrink: 0,
      }}>
        {/* 公式ページボタン */}
        <button onClick={openUrl} disabled={!targetUrl} style={{
          width: '100%', minHeight: shortVp ? 36 : 46, border: 'none',
          background: targetUrl ? primary : 'var(--tag-bg)',
          color: targetUrl ? '#fff' : 'var(--text-muted)',
          borderRadius: 8, cursor: targetUrl ? 'pointer' : 'default',
          fontWeight: 600, fontFamily: F.sans, fontSize: 14, letterSpacing: 0.5,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          <span>{targetUrl ? (ev.url ? 'イベント詳細・申込方法を見る' : '地本の公式ページを確認') : '公式ページなし'}</span>
          {targetUrl && ICO.extLink('#fff', 14)}
        </button>

        {/* 横向きでは本文末尾へ移して固定領域を減らす */}
        {!shortVp && secondaryActions}
      </div>
    </div>
  );
}
