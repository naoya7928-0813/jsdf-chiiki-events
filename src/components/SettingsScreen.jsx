import { useState, useEffect } from 'react';
import { ICO } from './Icons';
import { BottomTabBar, F } from './Shared';
import { COLOR_SCHEMES, REGION_SOURCE, REGION_HQ } from '../config';
import { usePushNotification } from '../hooks/usePushNotification';
import { fetchOfficesData } from '../hooks/useOffices';
import { UPDATE_NOTES, TYPE_LABEL } from '../constants/updates';

// package.json の version を vite.config.js の define で埋め込んだ定数
/* global __APP_VERSION__ */


export default function SettingsScreen({
  theme,
  onColorChange, onDarkModeChange,
  layoutMode = 'auto', onLayoutModeChange, showLayoutSetting = false,
  weatherMapMode = 'auto', onWeatherMapModeChange,
  autoMode, onAutoModeChange,
  autoApply, onAutoApplyChange,
  onOpenHome, onOpenRegion, onOpenList, onOpenFavorites,
  onOpenLegal,
  onOpenReport,
}) {
  const { primary, schemeKey, darkMode } = theme;

  // ── Web Push ─────────────────────────────────────────────────
  const push = usePushNotification();

  // ── 折込（アコーディオン） ────────────────────────────────────
  // 設定項目を縦に並べると全体像が掴めないため、既定では見出しだけを表示し、
  // 開いた節の中身だけを見せる。複数の節を同時に開いてよい。
  const [openSections, setOpenSections] = useState(() => new Set());
  const isOpen = id => openSections.has(id);
  const toggleSection = id => setOpenSections(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const sourceOpen = isOpen('source');

  // ── 表示設定（localStorage 直読み・直書き。一覧/近隣モーダルが参照） ──
  const [viewMode, setViewMode] = useState(() => {
    try { return localStorage.getItem('jsdf-view-mode') === 'calendar' ? 'calendar' : 'card'; } catch { return 'card'; }
  });
  const [radarOri, setRadarOri] = useState(() => {
    try { return localStorage.getItem('jsdf-radar-orientation') === 'heading' ? 'heading' : 'north'; } catch { return 'north'; }
  });
  const changeViewMode = (v) => { setViewMode(v); try { localStorage.setItem('jsdf-view-mode', v); } catch {} };
  const changeRadarOri = (v) => { setRadarOri(v); try { localStorage.setItem('jsdf-radar-orientation', v); } catch {} };

  // ── 掲載元: 各地本の事務所一覧（offices.json を遅延ロード） ──────
  const [offices,   setOffices]   = useState(null);   // null=未取得 / []=取得失敗
  const [openHqs,   setOpenHqs]   = useState(() => new Set()); // 展開中の地本キー
  const [armedOffice, setArmedOffice] = useState(null); // 誤操作防止: 1回目タップで選択中の拠点ID

  // 掲載元セクションを初めて開いたときに offices.json を取得
  useEffect(() => {
    if (sourceOpen && offices === null) {
      fetchOfficesData()
        .then(list => setOffices(list))
        .catch(() => setOffices([]));
    }
  }, [sourceOpen, offices]);

  // pref ごとに事務所をグループ化（HQ を先頭に）
  const officesByPref = {};
  for (const o of offices || []) {
    (officesByPref[o.pref] = officesByPref[o.pref] || []).push(o);
  }
  for (const key of Object.keys(officesByPref)) {
    officesByPref[key].sort((a, b) => (a.type === 'hq' ? -1 : b.type === 'hq' ? 1 : 0));
  }

  // 1地本だけ開く（別の地本を開くと、それまで開いていた地本は自動で閉じる）
  const toggleHq = key => {
    setOpenHqs(prev => (prev.has(key) ? new Set() : new Set([key])));
    setArmedOffice(null); // 地本を切り替えたら拠点の選択(1回目タップ)はリセット
  };

  // 掲載元の各拠点タップ: 1回目で選択（テーマカラーで強調）、2回目で公式サイトへ遷移
  const handleOfficeTap = o => {
    if (!o.url) return;
    if (armedOffice === o.id) {
      window.open(o.url, '_blank', 'noopener,noreferrer');
      setArmedOffice(null);
    } else {
      setArmedOffice(o.id);
    }
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)', fontFamily: F.sans }}>
      {/* ヘッダー */}
      <div style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)',
        paddingBottom: 14, background: primary, color: '#fff', flexShrink: 0,
      }}>
        <div style={{ padding: '0 20px 10px' }}>
          <div style={{ fontSize: 10, letterSpacing: 2, color: 'rgba(255,255,255,0.65)', fontWeight: 500 }}>SETTINGS</div>
          <div style={{ fontFamily: F.serif, fontSize: 19, fontWeight: 600, letterSpacing: 1, marginTop: 2 }}>ユーザー設定</div>
        </div>
      </div>

      {/* 設定は読みやすさ優先。デスクトップでも横に伸ばさず中央 720px に収める */}
      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '16px 0 8px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', width: '100%' }}>

        {/* ─ 1. ブラウザ通知（Web Push） ─ */}
        <GroupTitle>ブラウザ通知</GroupTitle>
        <Card>
          {push.reason === 'ios-not-installed' ? (
            /* iOS Safari でホーム画面未追加の場合 */
            <div style={{ padding: '16px 14px' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 14 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                  background: `${primary}15`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {/* ホーム画面追加アイコン */}
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <rect x="3" y="3" width="18" height="18" rx="3" stroke="var(--brand-fg)" strokeWidth="1.7"/>
                    <path d="M12 8v8M8 12h8" stroke="var(--brand-fg)" strokeWidth="1.7" strokeLinecap="round"/>
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
                    ホーム画面への追加が必要です
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                    iPhone / iPad でプッシュ通知を使うには、まずこのサイトをホーム画面に追加してください。
                  </div>
                </div>
              </div>
              <div style={{ borderTop: '1px solid var(--sep)', paddingTop: 12 }}>
                {[
                  'Safari 下部の共有ボタン（□↑）をタップ',
                  '「ホーム画面に追加」を選択',
                  'ホーム画面のアイコンからアプリを開く',
                  'この設定画面でプッシュ通知をONにする',
                ].map((step, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 8, alignItems: 'flex-start' }}>
                    <div style={{
                      width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                      background: primary, color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 700, fontFamily: F.mono, marginTop: 1,
                    }}>{i + 1}</div>
                    <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.6 }}>{step}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : push.supported ? (
            <ToggleRow
              label="プッシュ通知"
              sub={
                push.subscribed
                  ? '通知が有効です。新しいイベントをお知らせします'
                  : '新しいイベントが追加されたときに通知を受け取る'
              }
              on={push.subscribed}
              loading={push.loading}
              onChange={() => push.subscribed ? push.unsubscribe() : push.subscribe()}
              primary={primary}
            />
          ) : (
            <div style={{ padding: '14px', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              このブラウザはプッシュ通知に対応していません。
            </div>
          )}
          {push.error && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 6,
              padding: '8px 14px 12px', borderTop: '1px solid var(--sep)',
              fontSize: 12, color: '#e05252', lineHeight: 1.5,
            }}>
              <span style={{ display: 'flex', marginTop: 1, flexShrink: 0 }}>{ICO.warn('#e05252', 13)}</span>
              <span>{push.error}</span>
            </div>
          )}
        </Card>
        <div style={{
          margin: '6px 16px 0',
          padding: '8px 12px',
          background: 'var(--tag-bg)',
          borderRadius: 8, fontSize: 11, color: 'var(--text-muted)',
          fontFamily: F.sans, lineHeight: 1.6,
        }}>
          {push.reason === 'ios-not-installed'
            ? 'iOS 16.4以降 / ホーム画面から起動時のみ利用できます。Android・PCのChromeはそのまま使えます。'
            : 'プッシュ通知をONにすると、新しいイベントが検出された際に通知が届きます。通知の許可はブラウザの設定からいつでも取り消せます。'
          }
        </div>

        {/* ─ 1.5 オートモード（自動更新設定） ─ */}
        <GroupTitle>アプリケーション設定</GroupTitle>
        <Card>
          <ToggleRow
            label="オートモード (自動更新)"
            sub="5分ごとの自動更新と、バックグラウンド復帰時の自動再取得を行います"
            on={autoMode}
            onChange={() => onAutoModeChange(!autoMode)}
            primary={primary}
            last
          />
        </Card>

        {/* ─ 2. テーマカラー ─ */}
        <GroupTitle>テーマカラー</GroupTitle>
        <Card>
          <div style={{ padding: '14px' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
              アプリの配色（3自衛隊のカラーから選択）
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {Object.entries(COLOR_SCHEMES).map(([k, v]) => {
                const isA = schemeKey === k;
                return (
                  <button key={k} onClick={() => onColorChange(k)} style={{
                    flex: 1, minHeight: 76, padding: 10,
                    border: `1.5px solid ${isA ? v.primary : 'var(--border)'}`,
                    background: isA ? v.primary : 'var(--card)',
                    borderRadius: 10, cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    gap: 5, fontFamily: F.sans, transition: 'all 0.15s',
                  }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: '50%',
                      background: v.primary,
                      border: '2px solid #fff',
                      boxShadow: isA ? `0 0 0 2px ${v.primary}` : `0 0 0 1.5px ${v.primary}44`,
                    }} />
                    <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.5, color: isA ? '#fff' : 'var(--text)' }}>
                      {v.label}
                    </div>
                    <div style={{ fontSize: 9, letterSpacing: 1.5, fontFamily: F.mono, color: isA ? 'rgba(255,255,255,0.75)' : 'var(--text-muted)' }}>
                      {v.sub}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </Card>

        {/* ─ 4. ダークモード（3択セグメント） ─ */}
        <GroupTitle>ダークモード</GroupTitle>
        <Card>
          <div style={{ padding: '14px' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
              画面の明るさ設定
            </div>
            {/* セグメントコントロール */}
            <div style={{
              display: 'flex', background: 'var(--badge-bg)',
              borderRadius: 8, padding: 3, gap: 2,
            }}>
              {[
                { id: 'system', label: 'システム' },
                { id: 'light',  label: 'ライト'   },
                { id: 'dark',   label: 'ダーク'   },
              ].map(m => {
                const isA = darkMode === m.id;
                return (
                  <button key={m.id} onClick={() => onDarkModeChange(m.id)} style={{
                    flex: 1, height: 40, borderRadius: 6, border: 'none', cursor: 'pointer',
                    // 選択中は primary 背景＋白文字。旧 var(--card)＋primary 文字は
                    // ダークモードで背景に溶けて選択状態が読めなかった（フィードバック§4-2④）
                    background: isA ? primary : 'transparent',
                    color: isA ? '#fff' : 'var(--text-muted)',
                    fontFamily: F.sans, fontSize: 13,
                    fontWeight: isA ? 600 : 400,
                    boxShadow: isA ? '0 1px 3px rgba(0,0,0,0.15)' : 'none',
                    transition: 'all 0.15s',
                  }}>
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>
        </Card>

        {/* ─ 表示設定（一覧の表示形式・レーダーの方角・申請済みの自動切替）（折込） ─ */}
        <Section
          title="表示設定"
          open={isOpen('view')}
          onToggle={() => toggleSection('view')}
        >
          <div style={{ padding: '14px' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 3 }}>イベント一覧の表示形式</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
              カード表示とカレンダー表示を選べます
            </div>
            <Segment
              value={viewMode}
              onChange={changeViewMode}
              primary={primary}
              options={[{ id: 'card', label: 'カード' }, { id: 'calendar', label: 'カレンダー' }]}
            />
          </div>
          <div style={{ padding: '14px', borderTop: '1px solid var(--sep)' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 3 }}>近くの施設レーダーの方角</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
              「北が上」＝地図と同じ向き。「端末の向き」＝スマホを向けた方向が上（方位センサーの許可が必要）
            </div>
            <Segment
              value={radarOri}
              onChange={changeRadarOri}
              primary={primary}
              options={[{ id: 'north', label: '北が上' }, { id: 'heading', label: '端末の向き' }]}
            />
          </div>
          {/* 表示の向き・天気と地図の並び（スマートフォンのみ）
              横向きは「幅に余裕・高さが希少」なので、地図と情報を横に並べる
              デスクトップ相当のレイアウトに切り替える。端末の回転ロックが
              効いていて自動で切り替わらない場合に、手動で選べるようにする。 */}
          {showLayoutSetting && (
            <>
              <div style={{ padding: '14px', borderTop: '1px solid var(--sep)' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 3 }}>表示の向き</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
                  画面の使い方に合わせて選べます
                </div>
                <Segment
                  value={layoutMode}
                  onChange={onLayoutModeChange}
                  primary={primary}
                  options={[{ id: 'portrait', label: '縦表示' }, { id: 'landscape', label: '横表示' }, { id: 'auto', label: '自由回転' }]}
                />
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10, lineHeight: 1.6 }}>
                  {layoutMode === 'portrait'  && '縦表示に固定します。端末を横にしても縦向きの見た目のままです。'}
                  {layoutMode === 'landscape' && '横表示に固定します。地図を大きく表示し、メニューを画面左側に置きます。端末を横にしても切り替わらない場合にお使いください。'}
                  {layoutMode === 'auto'      && '端末の向きに合わせて自動で切り替えます。'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.6 }}>
                  ※ この設定はアプリの表示だけを変えます。iPhone では端末の画面の向きロックを
                  アプリ側から解除できないため、本体を回しても画面が回らない場合は
                  コントロールセンターの向きロックを解除してください。
                </div>
              </div>
              <div style={{ padding: '14px', borderTop: '1px solid var(--sep)' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 3 }}>天気と地図の並び</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
                  イベント詳細で横表示のとき
                </div>
                <Segment
                  value={weatherMapMode}
                  onChange={onWeatherMapModeChange}
                  primary={primary}
                  options={[{ id: 'auto', label: '自動' }, { id: 'stack', label: '上下' }, { id: 'side', label: '左右' }]}
                />
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10, lineHeight: 1.6 }}>
                  {weatherMapMode === 'auto'  && 'スマートフォンでは上下、パソコン・タブレットでは左右に並べます。'}
                  {weatherMapMode === 'stack' && '天気の下に地図を表示します。1つずつ大きく見られます。'}
                  {weatherMapMode === 'side'  && '天気と地図を左右に並べます。スクロールせずに両方見られますが、1つあたりは小さくなります。'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.6 }}>
                  ※ 画面の幅が足りないときは、設定にかかわらず上下に並べます。
                </div>
              </div>
            </>
          )}
          <div style={{ borderTop: '1px solid var(--sep)' }}>
            <ToggleRow
              label="掲載元を見て戻ったら申請済みにする"
              sub="イベント詳細から掲載元（公式ページ）を開き、アプリに戻ってきたときに自動で「申請済み」にします。OFFにすると手動で切り替えるまで変わりません"
              on={autoApply}
              onChange={() => onAutoApplyChange?.(!autoApply)}
              primary={primary}
              last
            />
          </div>
        </Section>

        {/* ─ お問い合わせ ─ */}
        <GroupTitle>お問い合わせ</GroupTitle>
        <Card>
          <LegalLinkRow label="バグ・不具合を報告" onTap={onOpenReport} last />
        </Card>

        {/* ─ 5. 法的情報 ─ */}
        <GroupTitle>法的情報</GroupTitle>
        <Card>
          <LegalLinkRow label="利用規約"             onTap={() => onOpenLegal('terms')}   />
          <LegalLinkRow label="プライバシーポリシー" onTap={() => onOpenLegal('privacy')} last />
        </Card>

        {/* ─ 6. 掲載元（参照元公式サイト） ─ */}
        <Section
          title="掲載元（参照元公式サイト）"
          open={sourceOpen}
          onToggle={() => toggleSection('source')}
        >
          {sourceOpen && (
            <div style={{ padding: '0 16px 14px' }}>
              {/* 各地本ブロック（タップで配下の事務所・募集案内所を展開） */}
              {Object.entries(REGION_SOURCE).map(([key, src]) => {
                const hqName   = REGION_HQ[key]?.name || src.name;
                const list     = officesByPref[key] || [];
                const branches = list.filter(o => o.type !== 'hq');
                const open     = openHqs.has(key);
                return (
                  <div key={key} style={{
                    marginTop: 8, borderRadius: 8,
                    border: '1px solid var(--sep)', overflow: 'hidden',
                  }}>
                    <button
                      onClick={() => toggleHq(key)}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        gap: 8, padding: '9px 11px', background: 'none', border: 'none',
                        cursor: 'pointer', fontFamily: F.sans, textAlign: 'left',
                      }}
                    >
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', lineHeight: 1.4 }}>
                        {hqName}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        {offices !== null && (
                          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                            {branches.length > 0 ? `案内所 ${branches.length}` : '本部のみ'}
                          </span>
                        )}
                        <span style={{
                          display: 'flex', transition: 'transform 0.2s',
                          transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
                        }}>
                          {ICO.chev('var(--text-muted)', 11)}
                        </span>
                      </span>
                    </button>
                    {open && (
                      <div style={{ padding: '2px 11px 10px', borderTop: '1px solid var(--sep)' }}>
                        {/* 公式サイトリンク */}
                        <a
                          href={src.url} target="_blank" rel="noopener noreferrer"
                          style={{
                            display: 'inline-block', fontSize: 11, color: 'var(--brand-fg)',
                            textDecoration: 'none', margin: '8px 0 4px', wordBreak: 'break-all',
                          }}
                        >
                          {src.name} ↗
                        </a>
                        {/* 事務所・募集案内所一覧（位置情報取得済み） */}
                        {offices === null ? (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '4px 0' }}>
                            読み込み中…
                          </div>
                        ) : list.length === 0 ? (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '4px 0' }}>
                            事務所情報なし
                          </div>
                        ) : (
                          list.map(o => {
                            // 個別の公式ページを持つ拠点だけリンク可能にする
                            const clickable = !!o.hasOfficialPage && !!o.url;
                            const armed     = clickable && armedOffice === o.id;
                            return (
                              <div
                                key={o.id}
                                role={clickable ? 'button' : undefined}
                                tabIndex={clickable ? 0 : undefined}
                                onClick={clickable ? () => handleOfficeTap(o) : undefined}
                                onKeyDown={clickable ? e => {
                                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleOfficeTap(o); }
                                } : undefined}
                                style={{
                                  fontSize: 11, color: 'var(--text-muted)',
                                  lineHeight: 1.55, padding: '5px 8px 5px 10px',
                                  borderLeft: `2px solid ${(armed || o.type === 'hq') ? primary : 'var(--sep)'}`,
                                  borderRadius: 4, marginTop: 4,
                                  background: armed ? `${primary}1f` : 'transparent',
                                  cursor: clickable ? 'pointer' : 'default',
                                  transition: 'background 0.15s',
                                  WebkitTapHighlightColor: 'transparent',
                                }}
                              >
                                <span style={{ color: armed ? 'var(--brand-fg)' : 'var(--text)', fontWeight: armed ? 700 : 500 }}>
                                  {o.name}
                                </span>
                                {o.type === 'hq' && (
                                  <span style={{ color: 'var(--brand-fg)', fontSize: 10, marginLeft: 5 }}>本部</span>
                                )}
                                {clickable && (
                                  <span style={{ color: 'var(--brand-fg)', fontSize: 10, marginLeft: 5, fontWeight: armed ? 700 : 400 }}>
                                    {armed ? 'もう一度タップで公式サイトへ ↗' : '↗'}
                                  </span>
                                )}
                                {o.address && <div>{o.address}</div>}
                                {o.tel && <div>TEL {o.tel}</div>}
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.7, paddingLeft: 8, marginTop: 12 }}>
                {'・'}日本地図: Geolonia Inc. / Wikipedia contributors (GFDL)
              </div>
              <div style={{
                fontSize: 11, color: 'var(--text-muted)',
                lineHeight: 1.8, marginTop: 8,
                paddingTop: 8, borderTop: '1px solid var(--sep)',
              }}>
                当サイトは有志による非公式サイトです。防衛省・自衛隊および各地方協力本部とは直接関係ありません。掲載情報は各地方協力本部等の公式公開情報をもとに整理しています。イベントの開催可否・申込方法・参加条件・内容変更などは、必ず公式ページで最新情報をご確認ください。
              </div>
            </div>
          )}
        </Section>

        {/* ─ 7. 更新ノート（従来どおりの折り畳み） ─ */}
        <Section
          title="更新ノート"
          open={isOpen('updates')}
          onToggle={() => toggleSection('updates')}
        >
            <div style={{
              maxHeight: 300,
              overflowY: 'auto',
              WebkitOverflowScrolling: 'touch',
              overscrollBehavior: 'contain',
            }}>
              {UPDATE_NOTES.map((note, i) => {
                const typeInfo = TYPE_LABEL[note.type] || TYPE_LABEL.improvement;
                const isLast   = i === UPDATE_NOTES.length - 1;
                return (
                  <div key={i} style={{
                    padding: '12px 14px',
                    borderBottom: isLast ? 'none' : '1px solid var(--sep)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{
                        fontSize: 9, fontWeight: 700, letterSpacing: 0.5,
                        padding: '2px 7px', borderRadius: 4,
                        background: `${typeInfo.color}18`,
                        color: typeInfo.color,
                        fontFamily: F.sans,
                      }}>
                        {typeInfo.label}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: F.mono }}>
                        v{note.version}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: F.mono, marginLeft: 'auto' }}>
                        {note.date}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>
                      {note.content}
                    </div>
                  </div>
                );
              })}
            </div>
        </Section>

        {/* ─ 8. バージョン ─ */}
        <div style={{ textAlign: 'center', padding: '16px 16px', paddingBottom: 'calc(env(safe-area-inset-bottom,0px) + 20px)', fontSize: 11, color: 'var(--text-muted)', fontFamily: F.mono }}>
          自衛隊地本イベント情報 {__APP_VERSION__}
        </div>
      </div>
      </div>

      <BottomTabBar
        active="settings"
        onChange={id => {
          if (id === 'home')           onOpenHome();
          else if (id === 'list')      onOpenList();
          else if (id === 'favorites') onOpenFavorites();
        }}
        primary={primary}
      />

    </div>
  );
}

// ─── 内部コンポーネント ──────────────────────────────────────

function GroupTitle({ children }) {
  return (
    <div style={{
      fontSize: 11, color: 'var(--text-muted)',
      padding: '14px 24px 6px', letterSpacing: 2,
      fontFamily: F.sans, fontWeight: 500,
    }}>{children}</div>
  );
}

/**
 * 折込セクション（見出し＋現在値のみを常時表示し、中身は開いたときだけ表示）。
 * 見出し右の summary で、開かなくても現在の設定が分かるようにしている。
 */
function Section({ title, summary, open, onToggle, gap = 20, children }) {
  return (
    <div style={{
      margin: `${gap}px 16px 0`,
      background: 'var(--card)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      overflow: 'hidden',
    }}>
      <button
        onClick={onToggle}
        aria-expanded={open}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 10, minHeight: 48, padding: '13px 16px',
          background: 'none', border: 'none', cursor: 'pointer',
          fontFamily: F.sans, textAlign: 'left',
        }}
      >
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: 'var(--text-muted)' }}>
          {title}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {summary && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: F.mono }}>
              {summary}
            </span>
          )}
          <span style={{
            display: 'flex', transition: 'transform 0.2s',
            transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
          }}>
            {ICO.chev('var(--text-muted)', 12)}
          </span>
        </span>
      </button>
      {open && (
        <div style={{ borderTop: '1px solid var(--border)' }}>{children}</div>
      )}
    </div>
  );
}

// 2択以上のセグメントコントロール（ダークモード設定と同じ見た目）
function Segment({ value, onChange, options, primary }) {
  return (
    <div style={{ display: 'flex', background: 'var(--badge-bg)', borderRadius: 8, padding: 3, gap: 2 }}>
      {options.map(o => {
        const isA = value === o.id;
        return (
          <button key={o.id} onClick={() => onChange(o.id)} style={{
            flex: 1, height: 40, borderRadius: 6, border: 'none', cursor: 'pointer',
            background: isA ? primary : 'transparent',
            color: isA ? '#fff' : 'var(--text-muted)',
            fontFamily: F.sans, fontSize: 13, fontWeight: isA ? 600 : 400,
            boxShadow: isA ? '0 1px 3px rgba(0,0,0,0.15)' : 'none',
            transition: 'all 0.15s',
          }}>{o.label}</button>
        );
      })}
    </div>
  );
}

function ToggleRow({ label, sub, on, onChange, primary, last, loading }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', minHeight: 60,
      padding: '12px 14px', gap: 12,
      borderBottom: last ? 'none' : '1px solid var(--sep)',
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', letterSpacing: 0.2 }}>{label}</div>
        {sub && (
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.4 }}>{sub}</div>
        )}
      </div>
      {/* スイッチ自体には文字が無いため、行の見出し（label）を読み上げ用の名前にする。
          無いと読み上げでは「スイッチ」としか分からない。 */}
      <button
        role="switch" aria-checked={on} aria-label={label}
        onClick={loading ? undefined : onChange}
        disabled={loading}
        style={{
          width: 44, height: 26, borderRadius: 26,
          background: loading ? 'var(--border)' : on ? primary : 'var(--border)',
          position: 'relative', cursor: loading ? 'not-allowed' : 'pointer', border: 'none',
          transition: 'background 0.2s', padding: 0, flexShrink: 0,
          opacity: loading ? 0.6 : 1,
        }}
      >
        <div style={{
          position: 'absolute', width: 22, height: 22, borderRadius: '50%',
          background: '#fff', top: 2, left: on ? 20 : 2,
          transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        }} />
      </button>
    </div>
  );
}

function Card({ children }) {
  return (
    <div style={{
      background: 'var(--card)', margin: '0 16px',
      borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden',
    }}>{children}</div>
  );
}

/** 法的情報リンク行（タップで画面遷移） */
function LegalLinkRow({ label, onTap, last }) {
  return (
    <button
      onClick={onTap}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', minHeight: 50,
        padding: '12px 14px', gap: 10,
        borderBottom: last ? 'none' : '1px solid var(--sep)',
        background: 'transparent', border: 'none',
        borderBottomWidth: last ? 0 : 1,
        borderBottomStyle: last ? 'none' : 'solid',
        borderBottomColor: 'var(--sep)',
        cursor: 'pointer', textAlign: 'left', fontFamily: F.sans,
      }}
    >
      <div style={{ flex: 1, fontSize: 14, color: 'var(--text)', fontWeight: 500 }}>{label}</div>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
        <path d="M9 18l6-6-6-6" stroke="var(--icon-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </button>
  );
}

/** 準備中行（タップ不可・バッジ表示） */
function ComingSoonRow({ label, last }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', minHeight: 50,
      padding: '12px 14px', gap: 10,
      borderBottom: last ? 'none' : '1px solid var(--sep)',
    }}>
      <div style={{ flex: 1, fontSize: 14, color: 'var(--text-muted)', fontWeight: 500 }}>{label}</div>
      <span style={{
        fontSize: 10, padding: '2px 9px', borderRadius: 10,
        background: 'var(--badge-bg)', color: 'var(--text-muted)',
        fontFamily: F.mono, letterSpacing: 1, fontWeight: 500,
      }}>準備中</span>
    </div>
  );
}

/** 外部リンク行（アイコン付き） */
function ExternalLinkRow({ label, url, last }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'flex', alignItems: 'center', minHeight: 50,
        padding: '12px 14px', gap: 10,
        borderBottom: last ? 'none' : '1px solid var(--sep)',
        textDecoration: 'none',
      }}
    >
      <div style={{ flex: 1, fontSize: 14, color: 'var(--text)', fontWeight: 500 }}>{label}</div>
      {/* 外部リンクアイコン */}
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <path d="M14 4h6v6M20 4L10 14M6 6h4M6 6v12h12v-4"
          stroke="var(--text-muted)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </a>
  );
}
