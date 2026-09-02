'use strict';
/**
 * scrapeDeadline — 「配信スロット」と「スクレイプの打ち切り期限」の唯一の出どころ
 *
 * 新着通知は 08:00 / 12:00 / 18:00(JST) のスロットで送る設計になっている。
 * ところが GitHub のスケジュール起動は定刻に来ない（実測: 中央値66分・p75 122分の遅延）。
 * さらにスクレイプ本体は OCR と LLM を挟むため約60分かかる。結果として
 * 「09:32 に届く」「12:40 に届く」といった中途半端な配信が起きていた。
 *
 * そこで **スクレイプ側に締切を持たせる**:
 *   スロットの少し前（RESERVE_MINUTES 前）になったら、そこまでに取れた分で打ち切り、
 *   残りは前回データを引き継いだまま公開する。取得できなかった地本のイベントが
 *   消えるわけではない（既存のエラー時と同じ扱い）。
 *
 * ⚠ ただし「起動が遅すぎて、打ち切ると何も取れない」場合は締切を使わない。
 *   実測で中央値66分の遅延があるため、ここで機械的に打ち切ると
 *   「何もスクレイプせず・新着ゼロで配信」する回が頻発し、その時間帯の情報が
 *   丸ごと落ちる。使える時間が MIN_USEFUL_MINUTES に満たなければ締切を外し、
 *   最後まで実行して（遅れて）配信する。
 *
 * この表は .github/workflows/scrape.yml の cron と通知ステップの TARGET_UTC の
 * 両方から参照される（以前は同じ対応表がワークフロー内に手書きで重複しており、
 * 「cron を変えたら対応表も直す」運用に頼っていた）。
 * shared/scrapeDeadline.test.cjs が実際の scrape.yml を読んでズレを検出する。
 */

/**
 * 配信スロット。cron（UTC）と、その回が狙う配信時刻の対応。
 *   cron      … scrape.yml の schedule と完全一致させること
 *   targetUtc … 配信スロットの UTC 時刻（JST = UTC+9）
 *   labelJst  … 表示用
 * 各スロットの UTC 時刻は、その枠のジョブが動く UTC 同日内に必ず来る並びにしてある。
 */
const SLOTS = [
  { cron: '33 20 * * *', targetUtc: '23:00', labelJst: '08:00' },
  { cron: '33 0 * * *',  targetUtc: '03:00', labelJst: '12:00' },
  { cron: '33 6 * * *',  targetUtc: '09:00', labelJst: '18:00' },
];

/**
 * スロットの何分前にスクレイプを打ち切るか。
 * 打ち切ったあとに「品質チェック → コミット → Vercel デプロイ → CDN 伝播待機(60秒)」が
 * 必要で、実測で約3分。デプロイの混雑で伸びても間に合うよう倍の余裕を見て6分にする。
 */
const RESERVE_MINUTES = 6;

/**
 * 締切までにこれだけの時間が無ければ、締切そのものを使わない（最後まで走らせる）。
 * これ未満だと更新できる地本がごく一部で、「定刻に届くが中身がほぼ前回のまま」に
 * なってしまい、定刻を守る意味が無い。
 */
const MIN_USEFUL_MINUTES = 15;

/** cron 文字列 → スロット定義。未知（手動実行など）は null */
function slotForSchedule(schedule) {
  const s = String(schedule || '').trim();
  return SLOTS.find(x => x.cron === s) || null;
}

/**
 * その日の targetUtc を epoch(ms) にする。
 * ジョブは cron から数分〜数時間遅れて動くが、同じ UTC 日のうちに目標時刻が来る
 * 並びにしてあるので、「now と同じ UTC 日付の targetUtc」でよい。
 */
function slotTargetEpoch(slot, nowMs) {
  const now = new Date(nowMs);
  const [h, m] = slot.targetUtc.split(':').map(Number);
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h, m, 0, 0);
}

/**
 * スクレイプの締切を決める。
 *
 * @param {object}  opts
 * @param {string}  opts.schedule  github.event.schedule（手動実行なら空）
 * @param {number}  opts.nowMs     現在時刻（epoch ms）
 * @param {number} [opts.reserveMinutes]
 * @param {number} [opts.minUsefulMinutes]
 * @returns {{
 *   deadlineMs: number|null,  // 打ち切り時刻。null = 締切なし（最後まで走る）
 *   targetMs:   number|null,  // 配信スロットの時刻
 *   slot:       object|null,
 *   reason:     'ok'|'no-slot'|'too-late',
 *   availableMinutes: number|null,
 * }}
 */
function resolveDeadline(opts = {}) {
  const {
    schedule,
    nowMs = Date.now(),
    reserveMinutes   = RESERVE_MINUTES,
    minUsefulMinutes = MIN_USEFUL_MINUTES,
  } = opts;

  const slot = slotForSchedule(schedule);
  // 手動実行・未知の cron には狙うスロットが無い。締切もかけない。
  if (!slot) return { deadlineMs: null, targetMs: null, slot: null, reason: 'no-slot', availableMinutes: null };

  const targetMs   = slotTargetEpoch(slot, nowMs);
  const deadlineMs = targetMs - reserveMinutes * 60_000;
  const availableMinutes = (deadlineMs - nowMs) / 60_000;

  // 起動が遅すぎる（すでにスロットを過ぎた／使える時間がわずか）。
  // 締切を外し、最後まで実行して遅れて配信する。
  if (availableMinutes < minUsefulMinutes) {
    return { deadlineMs: null, targetMs, slot, reason: 'too-late', availableMinutes };
  }
  return { deadlineMs, targetMs, slot, reason: 'ok', availableMinutes };
}

// ── 打ち切りに伴う2つの決めごと ────────────────────────────────
// どちらも「打ち切りで壊れないこと」を担保する部分なので、純粋関数にして
// shared/scrapeDeadline.test.cjs で検証する。

/** 開始位置をずらす歩幅。地本数（50）と互いに素な値にすること */
const ROTATION_STEP = 17;

/**
 * 実行ごとにずらす開始位置。
 *
 * 打ち切りがあると、固定順のままでは毎回同じ後半（九州・沖縄）だけが切られ、
 * そこが一度も更新されない。開始位置をずらして一周させる。
 * ROTATION_STEP は地本数と互いに素なので、実行を重ねればどの地本も必ず
 * 先頭側に来る（＝どの地本にも更新の機会が回る）。
 *
 * @param {number} length 対象の件数
 * @param {object} [env]  runNumber: GITHUB_RUN_NUMBER / nowMs: ローカル実行時の代替
 */
function rotationOffset(length, env = {}) {
  if (!Number.isInteger(length) || length <= 1) return 0;
  const runNumber = Number.parseInt(env.runNumber, 10);
  // GitHub Actions では実行ごとに増える run number を使う。
  // ローカル等で無い場合は8時間窓（1日3回の実行に対応）で代用する。
  const base = Number.isFinite(runNumber)
    ? runNumber
    : Math.floor((env.nowMs ?? Date.now()) / (8 * 3600 * 1000));
  return ((base * ROTATION_STEP) % length + length) % length;
}

/**
 * 取得できなかった地本のキーを洗い出す。
 *
 * 「取得失敗」と「時間切れで見送り」は原因が違うだけで扱いは同じで、
 * どちらも**前回データを引き継ぐ**必要がある。ここで漏らすと、その地本の
 * イベントが公開データから丸ごと消える（打ち切り機能で一番怖い壊れ方）。
 *
 * @param {object} args
 * @param {string[]} args.keys        全地本のキー（PREF_TASKS の並び）
 * @param {object}   args.errors      key -> 取得失敗したか
 * @param {string[]} args.skippedKeys 時間切れで見送ったキー
 * @returns {string[]} 前回データを引き継ぐべきキー（keys の並び順）
 */
function keysNeedingCarryOver({ keys = [], errors = {}, skippedKeys = [] } = {}) {
  const skipped = new Set(skippedKeys);
  return keys.filter(k => skipped.has(k) || Boolean(errors[k]));
}

module.exports = {
  SLOTS, RESERVE_MINUTES, MIN_USEFUL_MINUTES, ROTATION_STEP,
  slotForSchedule, slotTargetEpoch, resolveDeadline,
  rotationOffset, keysNeedingCarryOver,
};
