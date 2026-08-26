'use strict';

/**
 * llmExtract.cjs — LLM でイベント情報を抽出・検査するための純粋ロジック
 *
 * ★ フィールドの書式・記述ルールの正準は CLAUDE.md「イベントカード記述ルール（正準仕様）」。
 *    このモジュールは「LLM に何を返させるか（スキーマ）」「返ってきたものが規定どおりか
 *    （検証）」「規定外なら再検査すべきか（判定）」を実装する。I/O は持たない
 *    （API 呼び出し・キャッシュは scraper/lib/llmClient.js 側）。
 *
 * 設計方針:
 *   1. LLM の出力は JSON スキーマで縛る。自由文を返させない。
 *   2. チラシ・ページ内に該当情報が無ければ必ず null。推測で埋めさせない
 *      （埋めた値は「一次ソースに無い情報」＝誤情報になる）。
 *   3. タイトル欄にタイトルでない値（住所・部隊名のみ・案内文・ラベル行など）が
 *      入っていたら再検査（段3）へ回す。
 *   4. LLM の出力も信用しきらない。必ず titleQuality の既存ルールを通す（二重防御）。
 */

const {
  isJunkOrStubTitle,
  isSuspiciousTitle,
  cleanEventTitle,
  cleanPlaceText,
  cleanTimeText,
  cleanDeadlineText,
} = require('./titleQuality.cjs');

// ── 正準の固定値 ───────────────────────────────────────────────
/** カテゴリ固定9値（CLAUDE.md）。これ以外は使わない */
const CATEGORIES = [
  '説明会', '採用イベント', '一般公開', '艦艇公開', '体験',
  '演奏会', '記念行事', '広報活動', '地域参加',
];

/** スクレイプ経路で使うタグ（CLAUDE.md「タグ」節） */
const TAGS = [
  '入場無料', '要予約', 'オンライン', '家族向け', '学生向け', '抽選', '個別', 'OB・OG',
];

const DATE_RE     = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE     = /^(?:終日|\d{1,2}:\d{2}(?:～\d{1,2}:\d{2})?)$/;
const DEADLINE_RE = /^\d{1,2}月\d{1,2}日(?:（[日月火水木金土]）)?$/;

/** 実在する暦日か（2月30日などを弾く） */
function isRealDateStr(s) {
  if (!DATE_RE.test(String(s || ''))) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// ── LLM に渡す JSON スキーマ ────────────────────────────────────
// Gemini の responseSchema / Groq の JSON モードの両方で使える最小共通形にする
// （additionalProperties や $schema などプロバイダ差のあるキーは持たせない）。
const EVENT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    title:          { type: ['string', 'null'] },
    date:           { type: ['string', 'null'] },
    endDate:        { type: ['string', 'null'] },
    place:          { type: ['string', 'null'] },
    address:        { type: ['string', 'null'] },
    time:           { type: ['string', 'null'] },
    category:       { type: ['string', 'null'], enum: [...CATEGORIES, null] },
    tag:            { type: ['string', 'null'], enum: [...TAGS, null] },
    ageRequirement: { type: ['string', 'null'] },
    deadline:       { type: ['string', 'null'] },
    notes:          { type: ['string', 'null'] },
    url:            { type: ['string', 'null'] },
  },
  required: ['title', 'date', 'place', 'time', 'category', 'deadline', 'notes'],
};

/** 抽出対象フィールドの一覧（プロンプト・検証で共有） */
const EXTRACT_FIELDS = Object.keys(EVENT_JSON_SCHEMA.properties);

// ── プロンプト ─────────────────────────────────────────────────
// 「無ければ null」を最上位のルールとして繰り返し明示する。
// LLM は空欄を埋めたがるため、ここを緩めると一次ソースに無い情報が混入する。
const NULL_RULE = [
  '【最重要】資料（チラシ・ページ本文）に書かれていない情報は、絶対に推測せず必ず null にすること。',
  '「たぶんこうだろう」「一般的にはこう」で埋めてはならない。読み取れない・書かれていない＝null。',
  '曖昧な場合も null。誤った値を入れるより null のほうが常に良い。',
].join('\n');

const FIELD_RULES = [
  'title: 資料に書かれている正確なイベント名。',
  '  - 部隊名・学校名・組織名だけは不可（「海上自衛隊」「防衛医科大学校」→ 種別まで含めて「防衛医科大学校説明会」）。',
  '  - 住所・郵便番号・電話番号・受付時刻・装備の性能諸元・「詳細はこちら」等の案内文・',
  '    入札や契約などの調達文書の件名・表の見出し行は、いずれもイベント名ではない → null。',
  '  - イベント名が読み取れない場合は null。',
  'date: 開催日（初日）を YYYY-MM-DD 形式で。和暦（令和X年）は西暦へ換算する。年が書かれていなければ null。',
  'endDate: 連日開催の最終日を YYYY-MM-DD 形式で。単日開催なら null。',
  'place: 会場名のみ（施設名）。住所・開催時間・事務所の一覧は含めない。',
  'address: 資料に住所が書かれていればそのまま。無ければ null。',
  'time: 開催時間。「HH:MM～HH:MM」形式（開始のみなら「HH:MM」、終日開催は「終日」）。',
  '  書かれていなければ null（推測で埋めない）。',
  `category: 次の9つから1つだけ選ぶ: ${CATEGORIES.join(' / ')}。判断できなければ null。`,
  `tag: 次から最も適切なもの1つ、無ければ null: ${TAGS.join(' / ')}。`,
  'ageRequirement: 参加対象・応募資格（例「18歳以上33歳未満」「高校生以上」）。無ければ null。',
  'deadline: 申込締切日。「M月D日（曜）」形式（例「7月10日（金）」）。',
  '  「定員に達し次第締切」等の条件文しかなく具体的な日付が無い場合は null。',
  'notes: 定員・抽選の有無・注意事項など重要事項のみ50文字以内。無ければ null。',
  'url: 資料内のQRコード・URL が指す申込先。無ければ null。',
].join('\n');

/**
 * テキスト（OCR生テキスト / ページ本文）からの抽出プロンプト。
 * @param {Object} [opts]
 * @param {string} [opts.prefLabel] 地本名（会場の地域推定の手がかり）
 * @param {string} [opts.today]     実行日 YYYY-MM-DD（年が省略された日付の解決に使う）
 */
function buildTextExtractPrompt({ prefLabel = '', today = '' } = {}) {
  return [
    '次のテキストは、自衛隊地方協力本部のイベント告知（チラシのOCR結果またはページ本文）です。',
    'ここからイベント情報を1件抽出し、指定のJSONだけを返してください（説明文・前置き不要）。',
    '',
    NULL_RULE,
    '',
    '各フィールドのルール:',
    FIELD_RULES,
    '',
    prefLabel ? `参考: この資料は「${prefLabel}」のものです。` : '',
    today ? `参考: 本日は ${today} です。年が省略された日付はこれを基準に解釈してよいが、` +
            '年が特定できない場合は date を null にすること。' : '',
    '',
    'イベント告知ではない（募集要項・入札公告・組織案内・単なる一覧ページ等）場合は、',
    'すべてのフィールドを null にしてください。',
  ].filter(Boolean).join('\n');
}

/**
 * 一次ソース（チラシ画像・PDF）を直接見て再抽出するプロンプト（段3）。
 * 既存データを提示して「合っているか」を確認させるのではなく、
 * 資料だけを見て独立に抽出させる（提示データへの引きずられを防ぐ）。
 */
function buildRecheckPrompt({ prefLabel = '', today = '' } = {}) {
  return [
    'この画像／PDFは自衛隊地方協力本部のイベント告知（チラシ・ポスター）です。',
    '資料に実際に印刷されている内容だけを読み取り、指定のJSONだけを返してください。',
    '',
    NULL_RULE,
    '',
    '各フィールドのルール:',
    FIELD_RULES,
    '',
    prefLabel ? `参考: この資料は「${prefLabel}」のものです。` : '',
    today ? `参考: 本日は ${today} です。` : '',
    '',
    'この資料がイベント告知でない場合は、すべてのフィールドを null にしてください。',
  ].filter(Boolean).join('\n');
}

// ── 正規化 ─────────────────────────────────────────────────────
/** 空文字・"null"・"なし" 等を null に潰す */
function nullify(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return String(v);
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s) return null;
  if (/^(?:null|undefined|なし|不明|未定|該当なし|記載なし|N\/A|-|―|—)$/i.test(s)) return null;
  return s;
}

/** 和暦・区切り揺れを吸収して YYYY-MM-DD に寄せる。できなければ null */
function normalizeDate(v) {
  const s = nullify(v);
  if (!s) return null;
  const half = s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
  let m = half.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (!m) m = half.match(/^(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/);
  if (!m) {
    const r = half.match(/^令和\s*(\d{1,2})年\s*(\d{1,2})月\s*(\d{1,2})日/);
    if (r) m = [null, String(2018 + Number(r[1])), r[2], r[3]];
  }
  if (!m) return null;
  const out = `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
  return isRealDateStr(out) ? out : null;
}

/**
 * LLM が返した生 JSON を正準スキーマの形に整える。
 * 規定外の値は「捨てて null」にする（規定外のまま通すと下流の書式が壊れる）。
 */
function normalizeLlmEvent(raw) {
  const src = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
  const title = nullify(src.title);
  const date  = normalizeDate(src.date);
  let endDate = normalizeDate(src.endDate);
  if (endDate && date && endDate < date) endDate = null;   // 逆転は無かったことにする
  if (endDate && !date) endDate = null;                    // 開始日が無ければ意味を持たない

  const category = CATEGORIES.includes(nullify(src.category)) ? nullify(src.category) : null;
  const tag      = TAGS.includes(nullify(src.tag)) ? nullify(src.tag) : null;

  const time     = nullify(cleanTimeText(nullify(src.time) || ''));
  const deadline = nullify(cleanDeadlineText(nullify(src.deadline) || ''));
  const place    = nullify(cleanPlaceText(nullify(src.place) || ''));

  return {
    title:          title ? nullify(cleanEventTitle(title)) : null,
    date,
    endDate,
    place,
    address:        nullify(src.address),
    time:           time && TIME_RE.test(time) ? time : null,
    category,
    tag,
    ageRequirement: nullify(src.ageRequirement),
    deadline:       deadline && DEADLINE_RE.test(deadline) ? deadline : null,
    notes:          nullify(src.notes),
    url:            (() => {
      const u = nullify(src.url);
      return u && /^https?:\/\//i.test(u) ? u : null;
    })(),
  };
}

// ── 検証 ───────────────────────────────────────────────────────
/**
 * 正準スキーマの書式に沿っているかを検査する。
 * normalizeLlmEvent を通した後なら通常は空配列になる（通らない＝正規化漏れ）。
 * @returns {string[]} 違反の説明（空なら適合）
 */
function schemaIssues(ev) {
  const issues = [];
  const e = ev || {};
  // 欠損の表し方は経路によって null / undefined / '' とばらつく。
  // nullify で「値なし」を一本化してから見る（空文字を「規定外の値」と誤判定しない）。
  const v = k => nullify(e[k]);

  const date = v('date');
  if (date !== null && !isRealDateStr(date)) issues.push('date が YYYY-MM-DD の実在日付でない');
  const endDate = v('endDate');
  if (endDate !== null) {
    if (!isRealDateStr(endDate)) issues.push('endDate が YYYY-MM-DD の実在日付でない');
    else if (date !== null && endDate < date) issues.push('endDate が date より前');
  }
  const time = v('time');
  if (time !== null && !TIME_RE.test(time)) issues.push('time が規定書式でない');
  const deadline = v('deadline');
  if (deadline !== null && !DEADLINE_RE.test(deadline)) issues.push('deadline が規定書式でない');
  const category = v('category');
  if (category !== null && !CATEGORIES.includes(category)) issues.push('category が固定9値でない');
  const tag = v('tag');
  if (tag !== null && !TAGS.includes(tag)) issues.push('tag が規定値でない');
  for (const k of EXTRACT_FIELDS) {
    if (!(k in e)) continue;
    const raw = e[k];
    if (raw !== null && raw !== undefined && typeof raw !== 'string') {
      issues.push(`${k} が文字列でも null でもない`);
    }
  }
  return issues;
}

// ── 「タイトルらしくない値」の検知（再検査トリガー） ─────────────
// 住所・電話・部隊名のみ・案内文・ラベル行など、タイトル欄に入るべきでない値を検知する。
// 既存の titleQuality ルールを土台にし、LLM 抽出でとくに出やすいものを足す。
const NOT_A_TITLE_PATTERNS = [
  [/^https?:\/\//i,                       'URL がタイトルになっている'],
  [/^[\d\s:：～~-]+$/,                     '数字・記号のみ'],
  [/[0-9]{1,2}:[0-9]{2}\s*[～~-]\s*[0-9]{1,2}:[0-9]{2}/, '開催時間がタイトルになっている'],
  [/^(?:令和|平成)?\s*\d{1,4}\s*年/,       '日付がタイトルになっている'],
  [/^\d{1,2}月\d{1,2}日/,                 '日付がタイトルになっている'],
  [/(?:について|のお知らせ|のご案内)$/,     '案内文の見出しでイベント名でない可能性'],
  // チラシ・表の項目名がタイトルへ流れ込んだもの
  // 例:「若狭高校祭り 場 所：若狭高等学校 内 容：自衛隊車両展示…」
  [/(?:場\s*所|会\s*場|内\s*容|日\s*時|対\s*象|定\s*員|締\s*切|申\s*込)\s*[:：]/, '項目ラベルが本文に混ざっている'],
  [/=\s*NEW\s*=/i,                         '更新マークが本文に混ざっている'],
];

/** タイトルの長さ上限。scripts/check-event-titles.mjs の「極端に長い」と揃える */
const TITLE_MAX_LEN = 45;

/**
 * 同じ語句が繰り返されているか（複数イベントの連結・見出しの二重取り）。
 * 例:「「公務員合同説明会in豊岡」 「公務員合同説明会in豊岡」 「公務員合同説明会in長田」」
 */
function hasRepeatedPhrase(t) {
  const s = String(t).replace(/[\s　]/g, '');
  for (let len = Math.min(12, Math.floor(s.length / 2)); len >= 6; len--) {
    for (let i = 0; i + len * 2 <= s.length; i++) {
      const part = s.slice(i, i + len);
      if (s.indexOf(part, i + len) !== -1) return true;
    }
  }
  return false;
}

/**
 * タイトル欄の値が「タイトルとして妥当か」を判定する。
 * @returns {{ ok: boolean, reasons: string[] }}
 */
function titleIssues(title) {
  const reasons = [];
  const t = nullify(title);
  if (!t) return { ok: false, reasons: ['タイトルが空'] };
  if (t.length < 4)              reasons.push('タイトルが短すぎる');
  if (t.length >= TITLE_MAX_LEN) reasons.push('タイトルが長すぎる（説明文・別イベントの混入）');
  if (hasRepeatedPhrase(t))      reasons.push('同じ語句が繰り返されている（複数イベントの連結）');
  if (isJunkOrStubTitle(t)) reasons.push('既知の不正パターン（住所・案内文・組織名のみ等）');
  if (isSuspiciousTitle(t)) reasons.push('イベント語が無く非イベントの兆候がある');
  for (const [re, why] of NOT_A_TITLE_PATTERNS) if (re.test(t)) reasons.push(why);
  return { ok: reasons.length === 0, reasons };
}

// ── 掲載可否・再検査判定 ───────────────────────────────────────
/** 必須フィールド（date / title）が揃っていて掲載できるか */
function isPublishable(ev) {
  const e = ev || {};
  return Boolean(nullify(e.title)) && isRealDateStr(e.date);
}

/**
 * 段2の判定。イベント1件を見て「そのまま掲載 / 再検査 / 除外」を決める。
 *
 *   ok      … 規定どおり。そのまま掲載
 *   recheck … タイトルらしくない値・書式違反がある。一次ソースで再検査（段3）
 *   junk    … イベントではないと確定できる。除外
 *
 * 「一次ソースを持たない」イベントは再検査できないため、recheck 相当でも
 * 検疫（呼び出し側で判断）に回す。ここでは判定理由まで返して呼び出し側に委ねる。
 *
 * @param {Object} ev イベント（正準フィールド名）
 * @returns {{ action: 'ok'|'recheck'|'junk', reasons: string[], hasSource: boolean }}
 */
function decideRecheck(ev) {
  const e = ev || {};
  const hasSource = Boolean(nullify(e.imageUrl) || nullify(e.url));
  const formatIssues = schemaIssues(e);

  if (!nullify(e.title)) {
    return { action: 'junk', reasons: ['タイトルが空'], formatIssues, hasSource };
  }
  // 「確実に不正」は再検査せず除外（既存 isJunkOrStubTitle と同じ扱い）。
  // 一次ソースを見ても救えないものに vision LLM を使わない。
  if (isJunkOrStubTitle(e.title)) {
    return { action: 'junk', reasons: ['既知の不正パターン'], formatIssues, hasSource };
  }

  // 再検査に回すのは「タイトル欄にタイトルでない値が入っている」場合と、
  // 必須の開催日が取れていない場合だけ。
  // time / tag / deadline のような任意項目の書式ズレは、整形（cleanTimeText 等）で
  // 直すべきものであって、チラシを読み直す理由にはならない。ここを再検査条件に
  // 入れると、ほぼ全イベントが対象になり上限を食い潰す（実測 179 件中 175 件）。
  const reasons = [];
  const t = titleIssues(e.title);
  if (!t.ok) reasons.push(...t.reasons);
  if (!isRealDateStr(nullify(e.date))) reasons.push('date が実在日付でない');

  if (reasons.length > 0) return { action: 'recheck', reasons, formatIssues, hasSource };
  return { action: 'ok', reasons: [], formatIssues, hasSource };
}

// ── 段3の突合 ──────────────────────────────────────────────────
/** 比較用の正規化（空白・全半角の揺れで差異と誤判定しない） */
function sameValue(a, b) {
  const na = nullify(a), nb = nullify(b);
  if (na === null && nb === null) return true;
  if (na === null || nb === null) return false;
  const norm = s => s.replace(/[０-９Ａ-Ｚａ-ｚ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
                     .replace(/[\s　]/g, '').toLowerCase();
  return norm(na) === norm(nb);
}

/** 段3で上書きしてよいフィールド（id・pref・source_type 等の管理項目は触らない） */
const RECHECKABLE_FIELDS = [
  'title', 'date', 'endDate', 'place', 'address', 'time',
  'category', 'tag', 'ageRequirement', 'deadline', 'notes',
];

/**
 * 一次ソースからの再抽出結果を元イベントへ反映する（段3）。
 *
 * 反映ルール:
 *   - 再抽出が値を返したフィールド … 一次ソースを直接見た結果なので採用する
 *   - 再抽出が null を返したフィールド … 「資料に無い」＝元の値の裏付けが取れない。
 *       title/date（必須）は元の値を残さず null にする（＝掲載不可→検疫へ）。
 *       それ以外の任意フィールドは元の値を消す（誤情報を残さない）。
 *
 * @param {Object} original    元イベント
 * @param {Object} reextracted normalizeLlmEvent 済みの再抽出結果
 * @returns {{ merged: Object, changes: Array<{field:string, from:*, to:*}> }}
 */
function mergeRecheck(original, reextracted) {
  const orig = original || {};
  const re   = reextracted || {};
  const merged = { ...orig };
  const changes = [];

  for (const f of RECHECKABLE_FIELDS) {
    const before = nullify(orig[f]);
    const after  = Object.prototype.hasOwnProperty.call(re, f) ? nullify(re[f]) : before;
    if (sameValue(before, after)) continue;
    merged[f] = after;
    changes.push({ field: f, from: before, to: after });
  }
  if (changes.length > 0) {
    merged.verifiedBy   = 'llm-recheck';
    merged.verifiedAt   = re.verifiedAt || null;
  }
  return { merged, changes };
}

module.exports = {
  CATEGORIES,
  TAGS,
  EVENT_JSON_SCHEMA,
  EXTRACT_FIELDS,
  RECHECKABLE_FIELDS,
  DATE_RE,
  TIME_RE,
  DEADLINE_RE,
  isRealDateStr,
  buildTextExtractPrompt,
  buildRecheckPrompt,
  nullify,
  normalizeDate,
  normalizeLlmEvent,
  schemaIssues,
  titleIssues,
  isPublishable,
  decideRecheck,
  hasRepeatedPhrase,
  TITLE_MAX_LEN,
  sameValue,
  mergeRecheck,
};
