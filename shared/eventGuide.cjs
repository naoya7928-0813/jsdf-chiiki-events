// イベント別 FAQ・参加準備ガイド — 純粋ロジック（管理API・公開API・画面で共有）。
//
// 方針:
// - 内容は運営が入力したものだけ。**未入力・未確認の項目を推測で埋めない**（公開画面にも出さない）。
// - ガイドの各項目は状態を持つ:
//     unknown   … 未確認（既定。公開しない）
//     na        … 該当なし（例: 駐車場の案内が無い・持ち物の指定が無い。公開時は「該当なし」とだけ出す）
//     confirmed … 確認済み（本文を公開する。本文が空なら公開しない）
// - FAQ は質問ごとに公開／非公開を持ち、並び順は配列の順。
// - HTML は持たせない（< > は全角へ）。画面はテキストとして描画する。
'use strict';

const GUIDE_ITEMS = Object.freeze([
  { id: 'reservation', label: '事前申込',         placeholder: '例: 要事前申込（10月10日締切・先着30名）' },
  { id: 'fee',         label: '参加費',           placeholder: '例: 無料' },
  { id: 'age',         label: '年齢制限',         placeholder: '例: 中学生以上（中学生は保護者同伴）' },
  { id: 'belongings',  label: '持ち物',           placeholder: '例: 筆記用具、飲み物' },
  { id: 'dress',       label: '推奨服装',         placeholder: '例: 歩きやすい服装・運動靴' },
  { id: 'parking',     label: '駐車場',           placeholder: '例: 来場者用駐車場なし。公共交通機関をご利用ください' },
  { id: 'rain',        label: '雨天時の対応',     placeholder: '例: 小雨決行。荒天時は前日17時に公式サイトでお知らせ' },
  { id: 'photo',       label: '写真撮影',         placeholder: '例: 可（隊員の顔・一部装備は撮影不可）' },
  { id: 'idCard',      label: '身分証明書',       placeholder: '例: 必要（顔写真付き。入門時に確認）' },
  { id: 'other',       label: 'その他注意事項',   placeholder: '例: 敷地内は禁煙です' },
]);
const GUIDE_ITEM_IDS = Object.freeze(GUIDE_ITEMS.map(i => i.id));
const GUIDE_STATES = Object.freeze({ unknown: '未確認', na: '該当なし', confirmed: '確認済み' });

const LIMITS = Object.freeze({ question: 120, answer: 600, guideText: 200, maxFaq: 20 });
const FAQ_ID_RE = /^faq-[a-z0-9]{6,20}$/;

function cleanText(input, maxLen) {
  let s = String(input ?? '');
  // eslint-disable-next-line no-control-regex
  s = s.replace(/[\u0000-\u0009\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩﻿]/g, '');
  s = s.replace(/<|>/g, ch => (ch === '<' ? '＜' : '＞'));
  s = s.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t　]{2,}/g, ' ').trim();
  if (s.length > maxLen) s = s.slice(0, maxLen);
  return s;
}
const oneLine = (s) => s.replace(/\s*\n\s*/g, ' ');

function randomId() {
  try {
    const c = globalThis.crypto;
    if (c && typeof c.getRandomValues === 'function') {
      const a = new Uint8Array(8);
      c.getRandomValues(a);
      return Array.from(a, b => b.toString(36).padStart(2, '0')).join('').slice(0, 12);
    }
  } catch { /* fallthrough */ }
  return Math.random().toString(36).slice(2, 14);
}

/**
 * 運営の入力から FAQ 一覧を作る（純粋）。並びは入力順。
 * 質問・回答のどちらかが空の行は捨てる（入力途中の空行を保存しない）。
 * @returns {{faq: Object[]}|{error: string}}
 */
function normalizeFaqInput(list) {
  if (list == null) return { faq: [] };
  if (!Array.isArray(list)) return { error: 'FAQ の形式が不正です' };
  const out = [];
  const seen = new Set();
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const q = oneLine(cleanText(raw.q, LIMITS.question));
    const a = cleanText(raw.a, LIMITS.answer);
    if (!q && !a) continue;
    if (!q || !a) return { error: '質問と回答の両方を入力してください（片方だけの行があります）' };
    let id = typeof raw.id === 'string' && FAQ_ID_RE.test(raw.id) ? raw.id : `faq-${randomId()}`;
    while (seen.has(id)) id = `faq-${randomId()}`;
    seen.add(id);
    out.push({ id, q, a, public: raw.public !== false });
  }
  if (out.length > LIMITS.maxFaq) return { error: `FAQ は ${LIMITS.maxFaq} 件までです` };
  return { faq: out };
}

/**
 * 運営の入力から参加準備ガイドを作る（純粋）。未知の項目・状態は捨てる。
 * 「確認済み」なのに本文が空なら保存時に弾く（空の「確認済み」を作らない）。
 * @returns {{guide: Object}|{error: string}}
 */
function normalizeGuideInput(raw) {
  if (raw == null) return { guide: {} };
  if (typeof raw !== 'object' || Array.isArray(raw)) return { error: '参加準備ガイドの形式が不正です' };
  const items = (raw.items && typeof raw.items === 'object') ? raw.items : raw;
  const out = {};
  for (const id of GUIDE_ITEM_IDS) {
    const it = items[id];
    if (!it || typeof it !== 'object') continue;
    const state = Object.prototype.hasOwnProperty.call(GUIDE_STATES, it.state) ? it.state : 'unknown';
    const text = cleanText(it.text, LIMITS.guideText);
    if (state === 'unknown' && !text) continue;           // 既定値は保存しない
    if (state === 'confirmed' && !text) {
      const label = GUIDE_ITEMS.find(i => i.id === id).label;
      return { error: `「${label}」を確認済みにするには内容を入力してください` };
    }
    out[id] = { state, text: state === 'na' ? '' : text };
  }
  return { guide: out };
}

/** 保存済みの値を信用できる形にする（壊れたデータ・旧形式の防御） */
function sanitizeStored(record) {
  const f = normalizeFaqInput(record && record.faq);
  const g = normalizeGuideInput(record && record.guide);
  return { faq: f.faq || [], guide: g.guide || {} };
}

/** 公開してよい FAQ（公開フラグの立ったもの・並び順を保つ） */
function publicFaq(list) {
  const f = normalizeFaqInput(Array.isArray(list) ? list.map(x => (x && typeof x === 'object' ? x : null)) : list);
  return (f.faq || []).filter(x => x.public).map(({ id, q, a }) => ({ id, q, a }));
}

/** 公開してよいガイド項目（未確認は出さない。表示順は GUIDE_ITEMS の順） */
function publicGuide(guide) {
  const g = normalizeGuideInput(guide);
  const src = g.guide || {};
  const out = [];
  for (const item of GUIDE_ITEMS) {
    const v = src[item.id];
    if (!v || v.state === 'unknown') continue;
    out.push({ id: item.id, label: item.label, state: v.state, text: v.state === 'na' ? '該当なし' : v.text });
  }
  return out;
}

/**
 * 公開API 用: レコードの faq/guide を公開形に置き換える（空なら項目ごと消す）。
 * 公開形: faq=[{id,q,a}] / guide=[{id,label,state,text}]
 */
function toPublicRecord(o) {
  if (!o || (o.faq === undefined && o.guide === undefined)) return o;
  const { faq, guide, guideUpdatedAt, ...rest } = o;
  const pf = publicFaq(faq);
  const pg = publicGuide(guide);
  return {
    ...rest,
    ...(pf.length ? { faq: pf } : {}),
    ...(pg.length ? { guide: pg } : {}),
    ...((pf.length || pg.length) && guideUpdatedAt ? { guideUpdatedAt } : {}),
  };
}

/** 画面用: 公開API から受け取った値を検証して返す（壊れた値で描画を落とさない） */
function sanitizePublicFaq(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter(x => x && typeof x === 'object')
    .map(x => ({ id: String(x.id || '').slice(0, 40), q: oneLine(cleanText(x.q, LIMITS.question)), a: cleanText(x.a, LIMITS.answer) }))
    .filter(x => x.q && x.a)
    .slice(0, LIMITS.maxFaq);
}
function sanitizePublicGuide(list) {
  if (!Array.isArray(list)) return [];
  const byId = new Map(list.filter(x => x && typeof x === 'object').map(x => [x.id, x]));
  const out = [];
  for (const item of GUIDE_ITEMS) {
    const v = byId.get(item.id);
    if (!v || (v.state !== 'na' && v.state !== 'confirmed')) continue;
    const text = v.state === 'na' ? '該当なし' : cleanText(v.text, LIMITS.guideText);
    if (!text) continue;
    out.push({ id: item.id, label: item.label, state: v.state, text });
  }
  return out;
}

module.exports = {
  GUIDE_ITEMS, GUIDE_ITEM_IDS, GUIDE_STATES, LIMITS,
  normalizeFaqInput, normalizeGuideInput, sanitizeStored,
  publicFaq, publicGuide, toPublicRecord, sanitizePublicFaq, sanitizePublicGuide,
};
