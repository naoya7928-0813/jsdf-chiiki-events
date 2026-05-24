#!/usr/bin/env node
'use strict';

// scraper/.env 縺九ｉ迺ｰ蠅・､画焚繧定ｪｭ縺ｿ霎ｼ繧・・ITE_URL, NOTIFY_SECRET・・require('dotenv').config({ path: require('path').join(__dirname, '.env') });

/**
 * 閾ｪ陦幃嚏蝨ｰ譛ｬ繧､繝吶Φ繝域ュ蝣ｱ繧ｹ繧ｯ繝ｬ繧､繝代・
 *
 * 菴ｿ縺・婿:
 *   node scraper/index.js          # 螳滄圀縺ｮ繧ｵ繧､繝医°繧峨せ繧ｯ繝ｬ繧､繝斐Φ繧ｰ
 *   node scraper/index.js --mock   # 繝｢繝・け繝・・繧ｿ繧貞・蜉幢ｼ・TTP繧｢繧ｯ繧ｻ繧ｹ縺ｪ縺暦ｼ・ *
 * 蜃ｺ蜉・ public/data/events.json
 */

const path    = require('path');
const fs      = require('fs');
const iconv   = require('iconv-lite');
const cheerio = require('cheerio');

const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

const { parseKanagawa }      = require('./parsers/kanagawa');
const { parseTokyo }         = require('./parsers/tokyo');
const { parseSaitama }       = require('./parsers/saitama');
const { parseGunma }         = require('./parsers/gunma');
const { parseIbaraki }       = require('./parsers/ibaraki');
const { parseChiba }         = require('./parsers/chiba');
const { parseTochigiImages } = require('./parsers/tochigi');
// 蛹玲ｵｷ驕灘慍譛ｬ
const { parseSapporoPage }   = require('./parsers/sapporo');
const { parseAsahikawa }     = require('./parsers/asahikawa');
const { parseObihiro }       = require('./parsers/obihiro');
const { parseHakodate }      = require('./parsers/hakodate');
// 譚ｱ蛹怜慍譛ｬ
const { parseMiyagi }        = require('./parsers/miyagi');
const { parseAomori }        = require('./parsers/aomori');
const { parseIwate }         = require('./parsers/iwate');
const { parseYamagata }      = require('./parsers/yamagata');
const { parseFukushima }     = require('./parsers/fukushima');
const { parseAkita }         = require('./parsers/akita');
// 荳ｭ驛ｨ蝨ｰ譛ｬ
const { parseNiigata }       = require('./parsers/niigata');
const { parseIshikawa }      = require('./parsers/ishikawa');
const { parseFukui }         = require('./parsers/fukui');
const { parseYamanashi }     = require('./parsers/yamanashi');
const { parseGifu }          = require('./parsers/gifu');
const { parseAichi, parseAichiDetail } = require('./parsers/aichi');
const { parseShizuoka }      = require('./parsers/shizuoka');
const { parseToyamaImages }  = require('./parsers/toyama');
const { parseNagano }        = require('./parsers/nagano');
// 霑醍柄蝨ｰ譛ｬ
const { parseKyoto }                          = require('./parsers/kyoto');
const { parseOsaka }                          = require('./parsers/osaka');
const { parseHyogoImages }                    = require('./parsers/hyogo');
const { parseMiePost,      parseMiePostUrls }      = require('./parsers/mie');
const { parseShigaPost,    parseShigaPostUrls }    = require('./parsers/shiga');
const { parseNaraPost,     parseNaraPostUrls }     = require('./parsers/nara');
const { parseWakayamaPost, parseWakayamaPostUrls } = require('./parsers/wakayama');
// 蝗帛嵜蝨ｰ譛ｬ
const { parseEhime }     = require('./parsers/ehime');
const { parseKagawa }    = require('./parsers/kagawa');
const { parseKochi }     = require('./parsers/kochi');
const { parseTokushima } = require('./parsers/tokushima');
// 荳ｭ蝗ｽ蝨ｰ譛ｬ
const { parseTottori }   = require('./parsers/tottori');
const { parseShimane }   = require('./parsers/shimane');
const { parseOkayama }   = require('./parsers/okayama');
const { parseHiroshima } = require('./parsers/hiroshima');
const { parseYamaguchi } = require('./parsers/yamaguchi');
// 荵晏ｷ槭・豐也ｸ・慍譛ｬ
const { parseFukuoka }   = require('./parsers/fukuoka');
const { parseSaga }      = require('./parsers/saga');
const { parseNagasaki }  = require('./parsers/nagasaki');
const { parseKumamoto }  = require('./parsers/kumamoto');
const { parseOita }      = require('./parsers/oita');
const { parseMiyazaki }  = require('./parsers/miyazaki');
const { parseKagoshima } = require('./parsers/kagoshima');
const { parseOkinawa }   = require('./parsers/okinawa');
const { toHalfWidth, reiwaToAD, padTwo, isPast, guessCategory, guessTag, calcWeekday, titleHash } = require('./parsers/utils');

// 笏笏 險ｭ螳・笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
const OUTPUT_PATH = path.join(__dirname, '../public/data/events.json');

const URLS = {
  // 蛹玲ｵｷ驕灘慍譛ｬ・域惆蟷後・隍・焚繧ｵ繝悶・繝ｼ繧ｸ・・  sapporo_station:  'https://www.mod.go.jp/pco/sapporo/event_station.html',
  sapporo_naval:    'https://www.mod.go.jp/pco/sapporo/event_naval.html',
  sapporo_concert:  'https://www.mod.go.jp/pco/sapporo/event_concert.html',
  sapporo_other:    'https://www.mod.go.jp/pco/sapporo/event_other.html',
  asahikawa:        'https://www.mod.go.jp/pco/asahikawa/event.html',
  obihiro:          'https://www.mod.go.jp/pco/obihiro/topics_event.html',
  hakodate:         'https://www.mod.go.jp/pco/hakodate/publicity/',
  // 譚ｱ蛹怜慍譛ｬ
  miyagi:           'https://www.mod.go.jp/pco/miyagi/',
  aomori:           'https://www.mod.go.jp/pco/aomori/',
  iwate:            'https://www.mod.go.jp/pco/iwate/event/index.html',
  yamagata:         'https://www.mod.go.jp/pco/yamagata/event/event.html',
  fukushima:        'https://www.mod.go.jp/pco/fukushima/pr/event.html',
  akita_ical1:      'https://calendar.google.com/calendar/ical/3n2esbei0vm8qte2chsohavldc%40group.calendar.google.com/public/basic.ics',
  akita_ical2:      'https://calendar.google.com/calendar/ical/fnqjg3qoglr6iorbinvgjban7k%40group.calendar.google.com/public/basic.ics',
  // 髢｢譚ｱ蝨ｰ譛ｬ
  kanagawa:  'https://www.mod.go.jp/pco/kanagawa/kouho/event/event.html',
  tokyo:     'https://www.mod.go.jp/pco/tokyo/event2/index.html',
  saitama:   'https://www.mod.go.jp/pco/saitama/event/',
  gunma:     'https://www.mod.go.jp/pco/gunma/event.html',
  tochigi:   'https://www.mod.go.jp/pco/tochigi/',
  ibaraki:   'https://www.mod.go.jp/pco/ibaraki/event.html',
  chiba:     'https://www.mod.go.jp/pco/chiba/event.html',
  // 荳ｭ驛ｨ蝨ｰ譛ｬ
  niigata:   'https://www.mod.go.jp/pco/niigata/HP/event-schedule.html',
  toyama:    'https://www.mod.go.jp/pco/toyama/content/04-event/04-event.html',
  ishikawa:  'https://www.mod.go.jp/pco/ishikawa/event29/index.html',
  fukui:     'https://www.mod.go.jp/pco/fukui/contents/9-event/9-event.html',
  yamanashi: 'https://www.mod.go.jp/pco/yamanashi/event.html',
  nagano:    'https://calendar.google.com/calendar/ical/naganopcohp%40gmail.com/public/basic.ics',
  gifu:      'https://www.mod.go.jp/pco/gifu/event/event.html',
  shizuoka:  'https://www.mod.go.jp/pco/sizuoka/event/index.html',
  aichi:     'https://www.mod.go.jp/pco/aichi/calendar.html',
  // 霑醍柄蝨ｰ譛ｬ
  mie:       'https://www.mod.go.jp/pco/mie/events-page/',
  shiga:     'https://www.mod.go.jp/pco/shiga/event-briefing/',
  kyoto:     'https://www.mod.go.jp/pco/kyoto/kouhoushitsu/index.html',
  osaka:     'https://www.mod.go.jp/pco/osaka/experience/event.html',
  hyogo:     'https://www.mod.go.jp/pco/hyogo/',
  nara:      'https://www.mod.go.jp/pco/nara/events/',
  wakayama:  'https://www.mod.go.jp/pco/wakayama/category/event/',
  // 蝗帛嵜蝨ｰ譛ｬ
  ehime:     'https://www.mod.go.jp/pco/ehime/event.html',
  kagawa:    'https://www.mod.go.jp/pco/kagawa/event.html',
  kochi:     'https://www.mod.go.jp/pco/kochi/event_info.html',
  tokushima: 'https://www.mod.go.jp/pco/tokushima/event.html',
  // 荳ｭ蝗ｽ蝨ｰ譛ｬ
  tottori:   'https://www.mod.go.jp/pco/tottori/content/02-event/event.html',
  shimane:   'https://www.mod.go.jp/pco/shimane/event/event.html',
  okayama:   'https://www.mod.go.jp/pco/okayama/iku/kohogyoumu.html',
  hiroshima: 'https://www.mod.go.jp/pco/hiroshima/events/',
  yamaguchi: 'https://www.mod.go.jp/pco/yamaguchi/event.html',
  // 荵晏ｷ槭・豐也ｸ・慍譛ｬ
  fukuoka:   'https://www.mod.go.jp/pco/fukuoka/event/index.html',
  saga:      'https://www.mod.go.jp/pco/saga/event/index.html',
  nagasaki:  'https://www.mod.go.jp/pco/nagasaki/event/index.html',
  kumamoto:  'https://www.mod.go.jp/pco/kumamoto/event/index.html',
  oita:      'https://www.mod.go.jp/pco/oita/03_event.html',
  miyazaki:  'https://www.mod.go.jp/pco/miyazaki/event.html',
  kagoshima: 'https://www.mod.go.jp/pco/kagoshima/event/index.html',
  okinawa:   'https://www.mod.go.jp/pco/okinawa/event.html',
};

// 繝壹・繧ｸ髢薙・蠕・ｩ滓凾髢難ｼ・loudflare/繝ｬ繝ｼ繝医Μ繝溘ャ繝亥ｯｾ遲厄ｼ・const BETWEEN_PAGES_MS = 10_000;

// 笏笏 繝｢繝・け繝・・繧ｿ・・-mock 譎ゅ↓菴ｿ逕ｨ・・笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
const MOCK_DATA = {
  kanagawa: [
    { id: 'k-20260425-1', date: '2026-04-25', weekday: '蝨・, title: '閾ｪ陦帛ｮ伜呵｣懃函 蜍滄寔隱ｬ譏惹ｼ・, place: '讓ｪ豬懷慍蝓滉ｺ句漁謇', address: '讓ｪ豬懷ｸゆｸｭ蛹ｺ螻ｱ荳狗伴1-2', time: '13:30・・5:30', category: '隱ｬ譏惹ｼ・, tag: '隕∽ｺ育ｴ・, url: '', notes: '蜿ょ刈縺ｫ縺ｯ莠句燕莠育ｴ・′蠢・ｦ√〒縺吶・ },
    { id: 'k-20260429-1', date: '2026-04-29', weekday: '豌ｴ繝ｻ逾・, title: '讓ｪ鬆郁ｳ蝨ｰ譁ｹ邱冗屮驛ｨ 荳闊ｬ蜈ｬ髢・, place: '豬ｷ荳願・陦幃嚏 讓ｪ鬆郁ｳ蝓ｺ蝨ｰ', address: '讓ｪ鬆郁ｳ蟶り･ｿ騾ｸ隕狗伴1荳∫岼', time: '09:00・・6:00', category: '荳闊ｬ蜈ｬ髢・, tag: '蜈･蝣ｴ辟｡譁・, url: '', notes: null },
    { id: 'k-20260505-1', date: '2026-05-05', weekday: '轣ｫ繝ｻ逾・, title: '蟄舌←繧り・陦幃嚏菴馴ｨ薙ョ繝ｼ', place: '髯ｸ荳願・陦幃嚏 豁ｦ螻ｱ鬧仙ｱｯ蝨ｰ', address: '讓ｪ鬆郁ｳ蟶ょｾ｡蟷ｸ豬・-1', time: '10:00・・5:00', category: '菴馴ｨ・, tag: '螳ｶ譌丞髄縺・, url: '', notes: null },
  ],
  tokyo: [
    { id: 't-20260426-1', date: '2026-04-26', weekday: '譌･', title: '閾ｪ陦帛ｮ伜呵｣懃函 謗｡逕ｨ隧ｦ鬨楢ｪｬ譏惹ｼ・, place: '蟶ゅΩ隹ｷ鬧仙ｱｯ蝨ｰ 蜴夂函繧ｻ繝ｳ繧ｿ繝ｼ', address: '譁ｰ螳ｿ蛹ｺ蟶りｰｷ譛ｬ譚醍伴5-1', time: '10:00・・2:00', category: '隱ｬ譏惹ｼ・, tag: '隕∽ｺ育ｴ・, url: '', notes: null },
    { id: 't-20260502-1', date: '2026-05-02', weekday: '蝨・, title: '邱ｴ鬥ｬ鬧仙ｱｯ蝨ｰ 蜑ｵ遶玖ｨ伜ｿｵ陦御ｺ・, place: '髯ｸ荳願・陦幃嚏 邱ｴ鬥ｬ鬧仙ｱｯ蝨ｰ', address: '邱ｴ鬥ｬ蛹ｺ蛹礼伴4-1-1', time: '09:00・・5:00', category: '險伜ｿｵ陦御ｺ・, tag: '蜈･蝣ｴ辟｡譁・, url: '', notes: null },
  ],
  saitama: [
    { id: 's-20260519-1', pref: 'saitama', date: '2026-05-19', weekday: '轣ｫ', title: '髯ｸ荳願・陦幃嚏 譛晞悚鬧仙ｱｯ蝨ｰ 隕句ｭｦ莨・, place: '髯ｸ荳願・陦幃嚏 譛晞悚鬧仙ｱｯ蝨ｰ', address: '', time: '10:00・・2:00', category: '隕句ｭｦ', tag: '隕∽ｺ育ｴ・, url: '', notes: null },
  ],
  gunma: [
    { id: 'gu-20260601-1', pref: 'gunma', date: '2026-06-01', weekday: '譛・, title: '髯ｸ荳願・陦幃嚏 逶ｸ鬥ｬ蜴滄ｧ仙ｱｯ蝨ｰ 隕句ｭｦ莨・, place: '逶ｸ鬥ｬ蜴滄ｧ仙ｱｯ蝨ｰ', address: '', time: '10:00・・2:00', category: '隕句ｭｦ', tag: '隕∽ｺ育ｴ・, url: '', notes: null },
  ],
  tochigi:   [],
  ibaraki: [
    { id: 'ib-20260601-1', pref: 'ibaraki', date: '2026-06-01', weekday: '譛・, title: '蝨滓ｵｦ鬧仙ｱｯ蝨ｰ 隕句ｭｦ莨・, place: '髯ｸ荳願・陦幃嚏 蝨滓ｵｦ鬧仙ｱｯ蝨ｰ', address: '', time: '10:00・・2:00', category: '隕句ｭｦ', tag: '隕∽ｺ育ｴ・, url: '', notes: null },
  ],
  chiba: [
    { id: 'cb-20260601-1', pref: 'chiba', date: '2026-06-01', weekday: '譛・, title: '鄙貞ｿ鈴㍽鬧仙ｱｯ蝨ｰ 隕句ｭｦ莨・, place: '髯ｸ荳願・陦幃嚏 鄙貞ｿ鈴㍽鬧仙ｱｯ蝨ｰ', address: '', time: '10:00・・2:00', category: '隕句ｭｦ', tag: '隕∽ｺ育ｴ・, url: '', notes: null },
  ],
  sapporo:   [],
  asahikawa: [],
  obihiro:   [],
  hakodate:  [],
  miyagi:    [],
  aomori:    [],
  iwate:     [],
  yamagata:  [],
  fukushima: [],
  akita:     [],
  niigata:   [],
  toyama:    [],
  ishikawa:  [],
  fukui:     [],
  yamanashi: [],
  nagano:    [],
  gifu:      [],
  shizuoka:  [],
  aichi:     [],
  // 霑醍柄蝨ｰ譛ｬ
  mie:       [],
  shiga:     [],
  kyoto:     [],
  osaka:     [],
  hyogo:     [],
  nara:      [],
  wakayama:  [],
  // 蝗帛嵜蝨ｰ譛ｬ
  ehime:     [],
  kagawa:    [],
  kochi:     [],
  tokushima: [],
  // 荳ｭ蝗ｽ蝨ｰ譛ｬ
  tottori:   [],
  shimane:   [],
  okayama:   [],
  hiroshima: [],
  yamaguchi: [],
  // 荵晏ｷ槭・豐也ｸ・慍譛ｬ
  fukuoka:   [],
  saga:      [],
  nagasaki:  [],
  kumamoto:  [],
  oita:      [],
  miyazaki:  [],
  kagoshima: [],
  okinawa:   [],
};

// 笏笏 OCR・・laude Haiku 縺ｫ繧医ｋ逕ｻ蜒剰ｧ｣譫撰ｼ・笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏

const OCR_PROMPT = `縺薙・閾ｪ陦幃嚏繧､繝吶Φ繝医・繝昴せ繧ｿ繝ｼ逕ｻ蜒上°繧画ュ蝣ｱ繧呈歓蜃ｺ縺励※縺上□縺輔＞縲・莉･荳九・JSON縺ｮ縺ｿ繧定ｿ斐＠縺ｦ縺上□縺輔＞・郁ｪｬ譏取枚荳崎ｦ・ｼ峨りｩｲ蠖捺ュ蝣ｱ縺後↑縺・・岼縺ｯnull縺ｫ縺励※縺上□縺輔＞縲・{
  "title": "繝昴せ繧ｿ繝ｼ縺ｫ譖ｸ縺九ｌ縺滓ｭ｣遒ｺ縺ｪ繧､繝吶Φ繝亥錐",
  "time": "髢句ぎ譎る俣・井ｾ・ 10:00・・6:00・・,
  "ageRequirement": "蜿ょ刈雉・ｼ繝ｻ蟇ｾ雎｡閠・ｒ邁｡貎斐↓・井ｾ・ 荳ｭ蟄ｦ逕滉ｻ･荳・3豁ｳ譛ｪ貅縲∵律譛ｬ蝗ｽ邀阪ｒ譛峨☆繧区婿・・,
  "deadline": "蠢懷供邱蛻・律・井ｾ・ 4譛・4譌･・磯≡・会ｼ・,
  "notes": "螳壼藤繝ｻ謚ｽ驕ｸ譛臥┌繝ｻ豕ｨ諢丈ｺ矩・↑縺ｩ驥崎ｦ∽ｺ矩・・縺ｿ50譁・ｭ嶺ｻ･蜀・〒邁｡貎斐↓",
  "url": "逕ｻ蜒丞・縺ｮQR繧ｳ繝ｼ繝峨′謖・☆URL・・R繧ｳ繝ｼ繝峨′縺ｪ縺代ｌ縺ｰnull・・
}`;

/**
 * 繝昴せ繧ｿ繝ｼ逕ｻ蜒酋RL繧貞女縺大叙繧翫；emini Flash 縺ｧOCR縺励※JSON 繧定ｿ斐☆縲・ * GEMINI_API_KEY 縺梧悴險ｭ螳壹・蝣ｴ蜷医・ null 繧定ｿ斐☆・・CR繧ｹ繧ｭ繝・・・峨・ */
async function ocrImage(imageUrl) {
  if (!process.env.GEMINI_API_KEY || !imageUrl) return null;

  try {
    const imgRes = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer':    'https://www.mod.go.jp/',
      },
    });
    if (!imgRes.ok) {
      console.warn(`[OCR] 逕ｻ蜒丞叙蠕怜､ｱ謨・(${imgRes.status}): ${imageUrl}`);
      return null;
    }

    const buf      = await imgRes.arrayBuffer();
    const base64   = Buffer.from(buf).toString('base64');
    const mimeType = (imgRes.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();

    const apiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method:  'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [
            { inline_data: { mime_type: mimeType, data: base64 } },
            { text: OCR_PROMPT },
          ] }],
          generationConfig: { maxOutputTokens: 512, temperature: 0 },
        }),
      }
    );

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      console.warn(`[OCR] API 繧ｨ繝ｩ繝ｼ (${apiRes.status}): ${errText.slice(0, 100)}`);
      return null;
    }

    const apiJson   = await apiRes.json();
    const text      = apiJson.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]);

  } catch (err) {
    console.warn(`[OCR] ${imageUrl} 竊・${err.message}`);
    return null;
  }
}

/**
 * OCR 縺ｧ逕溘§繧・☆縺・ｪ､隱崎ｭ倥ｒ菫ｮ豁｣縺吶ｋ縲・ * 驢・竊・隨ｬ・育判謨ｰ縺瑚ｿ代￥豺ｷ蜷後＆繧後ｄ縺吶＞・・ */
function fixOcrTitle(title) {
  if (!title) return title;
  return title.replace(/驢・g, '隨ｬ');
}

// 笏笏 PDF OCR・・DF 邉ｻ蝨ｰ譛ｬ縺ｮ讓呎ｺ悶ヱ繧ｿ繝ｼ繝ｳ・・笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
// PDF 驕句霧蝨ｰ譛ｬ・亥ｲｩ謇九・髱呈｣ｮ縺ｪ縺ｩ・峨↓菴ｿ逕ｨ縲Ｆv.url 縺・.pdf 縺ｮ繧､繝吶Φ繝医ｒ蟇ｾ雎｡縺ｫ縺吶ｋ縲・
const PDF_OCR_PROMPT = `縺薙・閾ｪ陦幃嚏繧､繝吶Φ繝医・PDF縺九ｉ諠・ｱ繧呈歓蜃ｺ縺励※縺上□縺輔＞縲・莉･荳九・JSON縺ｮ縺ｿ繧定ｿ斐＠縺ｦ縺上□縺輔＞・郁ｪｬ譏取枚荳崎ｦ・ｼ峨りｩｲ蠖捺ュ蝣ｱ縺後↑縺・・岼縺ｯnull縺ｫ縺励※縺上□縺輔＞縲・{
  "title": "PDF縺ｫ譖ｸ縺九ｌ縺滓ｭ｣遒ｺ縺ｪ繧､繝吶Φ繝亥錐",
  "place": "髢句ぎ蝣ｴ謇繝ｻ莨壼ｴ蜷搾ｼ域命險ｭ蜷阪・菴乗園縺ｪ縺ｩ・・,
  "time": "髢句ぎ譎る俣・井ｾ・ 10:00・・6:00・・,
  "ageRequirement": "蜿ょ刈雉・ｼ繝ｻ蟇ｾ雎｡閠・ｒ邁｡貎斐↓・井ｾ・ 18豁ｳ縲・2豁ｳ譛ｪ貅縲∵律譛ｬ蝗ｽ邀阪ｒ譛峨☆繧区婿・・,
  "deadline": "蠢懷供邱蛻・律・井ｾ・ 4譛・4譌･・磯≡・会ｼ・,
  "notes": "螳壼藤繝ｻ謚ｽ驕ｸ譛臥┌繝ｻ豕ｨ諢丈ｺ矩・↑縺ｩ驥崎ｦ∽ｺ矩・・縺ｿ50譁・ｭ嶺ｻ･蜀・〒邁｡貎斐↓"
}`;

/**
 * PDF URL 繧貞女縺大叙繧翫；emini Flash 縺ｧ OCR 縺励※ JSON 繧定ｿ斐☆縲・ * GEMINI_API_KEY 縺梧悴險ｭ螳壹・蝣ｴ蜷医・ null 繧定ｿ斐☆・・CR 繧ｹ繧ｭ繝・・・峨・ */
async function ocrPdf(pdfUrl) {
  if (!process.env.GEMINI_API_KEY || !pdfUrl) return null;

  try {
    const pdfRes = await fetch(pdfUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer':    'https://www.mod.go.jp/',
      },
    });
    if (!pdfRes.ok) {
      console.warn(`[PDF-OCR] PDF蜿門ｾ怜､ｱ謨・(${pdfRes.status}): ${pdfUrl}`);
      return null;
    }

    const buf    = await pdfRes.arrayBuffer();
    const base64 = Buffer.from(buf).toString('base64');

    const apiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method:  'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [
            { inline_data: { mime_type: 'application/pdf', data: base64 } },
            { text: PDF_OCR_PROMPT },
          ] }],
          generationConfig: { maxOutputTokens: 512, temperature: 0 },
        }),
      }
    );

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      console.warn(`[PDF-OCR] API 繧ｨ繝ｩ繝ｼ (${apiRes.status}): ${errText.slice(0, 100)}`);
      return null;
    }

    const apiJson   = await apiRes.json();
    const text      = apiJson.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]);

  } catch (err) {
    console.warn(`[PDF-OCR] ${pdfUrl} 竊・${err.message}`);
    return null;
  }
}

/**
 * ev.url 縺・.pdf 縺ｧ邨ゅｏ繧九う繝吶Φ繝医↓蟇ｾ縺励※ PDF OCR 繧貞ｮ溯｡後＠
 * 繧ｿ繧､繝医Ν繝ｻ蝣ｴ謇繝ｻ譎る俣遲峨ｒ陬懷ｮ後＠縺ｦ霑斐☆縲・ *
 * PDF 驕句霧蝨ｰ譛ｬ・亥ｲｩ謇九・髱呈｣ｮ縺ｪ縺ｩ・峨・讓呎ｺ・OCR 繝代ち繝ｼ繝ｳ縲・ * 譁ｰ縺溘↓ PDF 邉ｻ蝨ｰ譛ｬ繧定ｿｽ蜉縺吶ｋ髫帙・縺薙・髢｢謨ｰ繧・main() 縺九ｉ蜻ｼ縺ｶ縺薙→縲・ */
async function enrichWithPdfOcr(events) {
  if (!process.env.GEMINI_API_KEY) {
    console.log('[PDF-OCR] GEMINI_API_KEY 譛ｪ險ｭ螳壹・縺溘ａ繧ｹ繧ｭ繝・・');
    return events;
  }

  const targets = events.filter(e => e.url && e.url.endsWith('.pdf'));
  console.log(`[PDF-OCR] ${targets.length} 莉ｶ縺ｮ PDF 繧貞・逅・＠縺ｾ縺兪);
  const results = [];

  for (const ev of events) {
    if (!ev.url || !ev.url.endsWith('.pdf')) {
      results.push(ev);
      continue;
    }

    console.log(`[PDF-OCR] ${ev.title} (${ev.date})`);
    const ocr = await ocrPdf(ev.url);
    if (ocr) console.log(`  竊・title: ${ocr.title ?? '(螟画峩縺ｪ縺・'}, place: ${ocr.place ?? '(螟画峩縺ｪ縺・'}`);

    results.push(ocr ? {
      ...ev,
      title:          (ocr.title          && fixOcrTitle(ocr.title.trim()))  || ev.title,
      place:          (ocr.place          && ocr.place.trim())               || ev.place || '',
      time:           (ocr.time           && ocr.time.trim())                || ev.time  || '',
      ageRequirement: (ocr.ageRequirement && ocr.ageRequirement.trim())      || ev.ageRequirement || null,
      deadline:       (ocr.deadline       && ocr.deadline.trim())            || ev.deadline       || null,
      notes:          [ev.notes, ocr.notes].filter(Boolean).join('\n')       || null,
    } : ev);

    await sleep(4500);
  }

  return results;
}

// 譬・惠蟆ら畑: 蜈ｨ繧､繝吶Φ繝域ュ蝣ｱ・域律莉倥・蝣ｴ謇蜷ｫ繧・峨ｒ逕ｻ蜒上°繧画歓蜃ｺ縺吶ｋ繝励Ο繝ｳ繝励ヨ
const OCR_PROMPT_FULL = `縺薙・閾ｪ陦幃嚏繧､繝吶Φ繝医・繝昴せ繧ｿ繝ｼ逕ｻ蜒上°繧画ュ蝣ｱ繧呈歓蜃ｺ縺励※縺上□縺輔＞縲・莉･荳九・JSON縺ｮ縺ｿ繧定ｿ斐＠縺ｦ縺上□縺輔＞・郁ｪｬ譏取枚荳崎ｦ・ｼ峨りｩｲ蠖捺ュ蝣ｱ縺後↑縺・・岼縺ｯnull縺ｫ縺励※縺上□縺輔＞縲・{
  "title": "繝昴せ繧ｿ繝ｼ縺ｫ譖ｸ縺九ｌ縺滓ｭ｣遒ｺ縺ｪ繧､繝吶Φ繝亥錐",
  "date": "髢句ぎ譌･・医御ｻ､蜥傾蟷ｴY譛・譌･・域屆譌･・峨阪・蠖｢蠑上〒縲ゆｾ・ 莉､蜥・蟷ｴ5譛・9譌･・育↓・会ｼ・,
  "place": "髢句ぎ蝣ｴ謇繝ｻ隕句ｭｦ蜈医・蜷咲ｧｰ",
  "time": "髢句ぎ譎る俣・井ｾ・ 10:00・・6:00・・,
  "ageRequirement": "蜿ょ刈雉・ｼ繝ｻ蟇ｾ雎｡閠・ｒ邁｡貎斐↓・井ｾ・ 荳ｭ蟄ｦ逕滉ｻ･荳・3豁ｳ譛ｪ貅縲∵律譛ｬ蝗ｽ邀阪ｒ譛峨☆繧区婿・・,
  "deadline": "蠢懷供邱蛻・律・井ｾ・ 4譛・4譌･・磯≡・会ｼ・,
  "notes": "螳壼藤繝ｻ謚ｽ驕ｸ譛臥┌繝ｻ豕ｨ諢丈ｺ矩・↑縺ｩ驥崎ｦ∽ｺ矩・・縺ｿ50譁・ｭ嶺ｻ･蜀・〒邁｡貎斐↓"
}`;

/**
 * 逕ｻ蜒・1 譫壹°繧牙・繧､繝吶Φ繝域ュ蝣ｱ・域律莉倥・蝣ｴ謇蜷ｫ繧・峨ｒ OCR 縺吶ｋ・域・惠蟆ら畑・峨・ */
async function ocrImageFull(imageUrl) {
  if (!process.env.GEMINI_API_KEY || !imageUrl) return null;
  try {
    const imgRes = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer':    'https://www.mod.go.jp/',
      },
    });
    if (!imgRes.ok) { console.warn(`[OCR-FULL] 逕ｻ蜒丞叙蠕怜､ｱ謨・(${imgRes.status}): ${imageUrl}`); return null; }
    const buf      = await imgRes.arrayBuffer();
    const base64   = Buffer.from(buf).toString('base64');
    const mimeType = (imgRes.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
    const apiRes   = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method:  'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [
            { inline_data: { mime_type: mimeType, data: base64 } },
            { text: OCR_PROMPT_FULL },
          ] }],
          generationConfig: { maxOutputTokens: 512, temperature: 0 },
        }),
      }
    );
    if (!apiRes.ok) { console.warn(`[OCR-FULL] API 繧ｨ繝ｩ繝ｼ (${apiRes.status})`); return null; }
    const apiJson   = await apiRes.json();
    const text      = apiJson.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.warn(`[OCR-FULL] ${imageUrl} 竊・${err.message}`);
    return null;
  }
}

/**
 * OCR邨先棡繧偵う繝吶Φ繝医が繝悶ず繧ｧ繧ｯ繝医↓繝槭・繧ｸ縺吶ｋ縲・ * - title: OCR 縺悟叙蠕励〒縺阪◆蝣ｴ蜷医・縺ｿ荳頑嶌縺・ * - ageRequirement / deadline: OCR 蜆ｪ蜈医∝・繝・・繧ｿ縺梧里縺ｫ縺ゅｌ縺ｰ菫晄戟
 * - notes: OCR 縺ｨ蜈・ョ繝ｼ繧ｿ繧堤ｵ仙粋
 */
function mergeOcr(ev, ocr) {
  if (!ocr) return ev;
  // QR繧ｳ繝ｼ繝蔚RL縺ｯ譌｢蟄篭RL縺檎ｩｺ縺ｮ蝣ｴ蜷医・縺ｿ謗｡逕ｨ
  const ocrUrl = (!ev.url && ocr.url && ocr.url.startsWith('http')) ? ocr.url.trim() : ev.url;
  return {
    ...ev,
    title:          (ocr.title          && fixOcrTitle(ocr.title.trim())) || ev.title,
    time:           (ocr.time           && ocr.time.trim())           || ev.time  || '',
    ageRequirement: (ocr.ageRequirement && ocr.ageRequirement.trim()) || ev.ageRequirement || null,
    deadline:       (ocr.deadline       && ocr.deadline.trim())       || ev.deadline       || null,
    notes: [ev.notes, ocr.notes].filter(Boolean).join('\n') || null,
    url:            ocrUrl,
  };
}

/** URL 縺檎判蜒上ヵ繧｡繧､繝ｫ・・pg/jpeg/png/gif/webp・峨ｒ謖・＠縺ｦ縺・ｋ縺句愛螳・*/
function isImageUrl(url) {
  if (!url) return false;
  return /\.(jpe?g|png|gif|webp)\s*$/i.test(url.split('?')[0].trimEnd());
}

/**
 * 繧､繝吶Φ繝磯・蛻励↓蟇ｾ縺励※鬆・分縺ｫ OCR 繧貞ｮ溯｡後＠縲∫ｵ先棡繧偵・繝ｼ繧ｸ縺励※霑斐☆縲・ * - ev.imageUrl 縺瑚ｨｭ螳壹＆繧後※縺・ｋ蝣ｴ蜷・ imageUrl 繧剃ｽｿ逕ｨ・・rl 縺ｯ縺昴・縺ｾ縺ｾ菫晄戟・・ * - ev.imageUrl 縺梧悴險ｭ螳壹〒 ev.url 縺檎判蜒上ヵ繧｡繧､繝ｫ縺ｮ蝣ｴ蜷・ url 繧堤判蜒上→縺励※菴ｿ逕ｨ縺励「rl 縺ｯ null 縺ｫ
 * 螟ｱ謨励＠縺溘う繝吶Φ繝医・蜈・ョ繝ｼ繧ｿ縺ｮ縺ｾ縺ｾ菫晄戟縺吶ｋ縲・ */
async function enrichWithOcr(events) {
  if (!process.env.GEMINI_API_KEY) {
    console.log('[OCR] GEMINI_API_KEY 譛ｪ險ｭ螳壹・縺溘ａ繧ｹ繧ｭ繝・・');
    return events;
  }

  const targets = events.filter(e => e.imageUrl || isImageUrl(e.url));
  if (targets.length === 0) return events;
  console.log(`[OCR] ${targets.length} 莉ｶ縺ｮ逕ｻ蜒上ｒ蜃ｦ逅・＠縺ｾ縺兪);
  const results = [];

  for (const ev of events) {
    // imageUrl 蜆ｪ蜈医ゅ↑縺代ｌ縺ｰ url 縺檎判蜒上ヵ繧｡繧､繝ｫ縺ｮ蝣ｴ蜷医↓菴ｿ逕ｨ
    const imgUrl = ev.imageUrl || (isImageUrl(ev.url) ? ev.url : null);
    if (!imgUrl) {
      results.push(ev);
      continue;
    }

    console.log(`[OCR] ${ev.title} (${ev.date})`);
    const ocr = await ocrImage(imgUrl);
    if (ocr) console.log(`  竊・deadline: ${ocr.deadline ?? '縺ｪ縺・}, age: ${ocr.ageRequirement ?? '縺ｪ縺・}`);

    // url 縺檎判蜒上ヵ繧｡繧､繝ｫ逶ｴ繝ｪ繝ｳ繧ｯ縺縺｣縺溷ｴ蜷医・ null 縺ｫ縺励※蜈ｬ蠑上・繝ｼ繧ｸ縺ｨ縺励※髢九°繧後↑縺・ｈ縺・↓縺吶ｋ
    const cleanUrl = ev.imageUrl ? ev.url : null;
    results.push({ ...mergeOcr(ev, ocr), url: cleanUrl });

    await sleep(4500);
  }

  return results;
}

// 笏笏 繝ｦ繝ｼ繝・ぅ繝ｪ繝・ぅ 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏

/** 迴ｾ蝨ｨ縺ｮ譌･譛ｬ譎る俣繧・"YYYY/MM/DD HH:mm" 蠖｢蠑上〒霑斐☆ */
function nowJST() {
  return new Date().toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).replace(/\//g, '/').replace(',', '');
}

/** 謖・ｮ壹Α繝ｪ遘貞ｾ・ｩ・*/
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/** Cloudflare 繝√Ε繝ｬ繝ｳ繧ｸ繝壹・繧ｸ縺九←縺・°繧貞愛螳・*/
function isChallengeTitle(title) {
  return title.includes('縺励・繧峨￥縺雁ｾ・■縺上□縺輔＞')
    || title.includes('Just a moment')
    || title.includes('Attention Required');
}

// 笏笏 Playwright 繝悶Λ繧ｦ繧ｶ險ｭ螳・笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏

/**
 * Cloudflare 繝懊ャ繝域､懃衍繧貞屓驕ｿ縺吶ｋ縺溘ａ縺ｮ繧ｹ繝・Ν繧ｹ險ｭ螳壹ｒ譁ｽ縺励◆
 * Playwright 繝悶Λ繧ｦ繧ｶ繧ｳ繝ｳ繝・く繧ｹ繝医ｒ霑斐☆縲・ */
async function createStealthContext(browser) {
  const context = await browser.newContext({
    userAgent:  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport:   { width: 1280, height: 800 },
    locale:     'ja-JP',
    timezoneId: 'Asia/Tokyo',
    extraHTTPHeaders: {
      'Accept-Language':           'ja,en-US;q=0.9,en;q=0.8',
      'Accept':                    'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Upgrade-Insecure-Requests': '1',
      'sec-ch-ua':                 '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
      'sec-ch-ua-mobile':          '?0',
      'sec-ch-ua-platform':        '"Windows"',
    },
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver',  { get: () => undefined });
    Object.defineProperty(navigator, 'plugins',    { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages',  { get: () => ['ja-JP', 'ja', 'en-US'] });
    window.chrome = { runtime: {} };
  });

  return context;
}

// 笏笏 繧ｹ繧ｯ繝ｬ繧､繝斐Φ繧ｰ譛ｬ菴・笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏

/**
 * 逾槫･亥ｷ晏慍譛ｬ繝壹・繧ｸ繧貞叙蠕励・繝代・繧ｹ
 * Shift_JIS 繝壹・繧ｸ縺ｮ縺溘ａ縲√Ξ繧ｹ繝昴Φ繧ｹ繝舌う繝亥・繧・iconv-lite 縺ｧ繝・さ繝ｼ繝峨☆繧九・ */
async function fetchKanagawa(context) {
  console.log(`[逾槫･亥ｷ拆 繧｢繧ｯ繧ｻ繧ｹ: ${URLS.kanagawa}`);

  // 笏笏 Playwright 縺ｧ隧ｦ縺ｿ繧具ｼ・loudflare 繝√Ε繝ｬ繝ｳ繧ｸ繧帝夐℃縺輔○繧具ｼ俄楳笏
  const page = await context.newPage();
  try {
    await page.goto(URLS.kanagawa, {
      waitUntil: 'networkidle',   // Cloudflare JS 繝√Ε繝ｬ繝ｳ繧ｸ螳御ｺ・∪縺ｧ蠕・▽
      timeout:   60_000,
    });

    // 繝√Ε繝ｬ繝ｳ繧ｸ蠕後・霑ｽ蜉蠕・ｩ・    await page.waitForTimeout(3000);

    const html  = await page.content();
    const title = (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || '';
    console.log(`[逾槫･亥ｷ拆 page title: ${title.trim().substring(0, 70)}`);

    if (isChallengeTitle(title)) throw new Error(`Cloudflare challenge: ${title.trim()}`);

    const $ = cheerio.load(html, { decodeEntities: false });
    const events = parseKanagawa($);
    console.log(`[逾槫･亥ｷ拆 ${events.length} 莉ｶ蜿門ｾ・(Playwright)`);
    return events;
  } catch (err) {
    console.warn(`[逾槫･亥ｷ拆 Playwright 螟ｱ謨・ ${err.message} 竊・fetch 縺ｫ繝輔か繝ｼ繝ｫ繝舌ャ繧ｯ`);
  } finally {
    await page.close();
  }

  // 笏笏 native fetch + iconv 繝輔か繝ｼ繝ｫ繝舌ャ繧ｯ 笏笏
  const res = await fetch(URLS.kanagawa, {
    headers: {
      'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
      'Referer':         'https://www.mod.go.jp/',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buffer = await res.arrayBuffer();
  const html   = iconv.decode(Buffer.from(buffer), 'Shift_JIS');
  const $ = cheerio.load(html, { decodeEntities: false });
  const events = parseKanagawa($);
  console.log(`[逾槫･亥ｷ拆 ${events.length} 莉ｶ蜿門ｾ・(fetch fallback)`);
  return events;
}

/**
 * 譚ｱ莠ｬ蝨ｰ譛ｬ繝壹・繧ｸ繧貞叙蠕励・繝代・繧ｹ
 */
async function fetchTokyo(context) {
  return fetchHtmlPref(context, '譚ｱ莠ｬ', URLS.tokyo, parseTokyo);
}

/**
 * 蝓ｼ邇牙慍譛ｬ繝壹・繧ｸ繧貞叙蠕励・繝代・繧ｹ
 */
async function fetchSaitama(context) {
  return fetchHtmlPref(context, '蝓ｼ邇・, URLS.saitama, parseSaitama);
}

/** 蜈ｱ騾・ HTML 繝壹・繧ｸ繧・Playwright 竊・fetch 縺ｮ鬆・〒蜿門ｾ励＠縺ｦ繝代・繧ｵ繝ｼ縺ｫ貂｡縺・*/
async function fetchHtmlPref(context, prefLabel, url, parserFn) {
  console.log(`[${prefLabel}] 繧｢繧ｯ繧ｻ繧ｹ: ${url}`);
  const page = await context.newPage();
  try {
    // domcontentloaded: HTML 蜿門ｾ怜ｾ後☆縺舌↓ waitForFunction 縺ｧ繝√Ε繝ｬ繝ｳ繧ｸ隗｣豎ｺ繧貞ｾ・▽
    // 竊・隗｣豎ｺ縺ｧ縺阪↑縺代ｌ縺ｰ 30 遘偵〒繧ｿ繧､繝繧｢繧ｦ繝医＠縺ｦ繝輔か繝ｼ繝ｫ繝舌ャ繧ｯ縺ｫ遘ｻ陦鯉ｼ育ｴ譌ｩ縺・､ｱ謨暦ｼ・    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    // Cloudflare 繝√Ε繝ｬ繝ｳ繧ｸ繝壹・繧ｸ・郁恭隱槭・譌･譛ｬ隱橸ｼ峨・繧ｿ繧､繝医Ν縺梧ｶ医∴繧九∪縺ｧ譛螟ｧ 90 遘貞ｾ・▽
    // 逾槫･亥ｷ昴・ cf_clearance 繧ｯ繝・く繝ｼ縺悟酔荳繧ｳ繝ｳ繝・く繧ｹ繝医〒蠑輔″邯吶′繧後ｋ縺溘ａ
    // 蠕檎ｶ壹・繝ｼ繧ｸ縺ｮ繝√Ε繝ｬ繝ｳ繧ｸ繧・90 遘剃ｻ･蜀・↓遯∫ｴ縺ｧ縺阪ｋ
    try {
      await page.waitForFunction(
        () => {
          const t = document.title;
          return t.length > 0
            && !t.includes('Just a moment')
            && !t.includes('Attention Required')
            && !t.includes('縺励・繧峨￥縺雁ｾ・■縺上□縺輔＞');
        },
        { timeout: 90_000 }
      );
    } catch { /* 繝√Ε繝ｬ繝ｳ繧ｸ縺ｪ縺・or 繧ｿ繧､繝繧｢繧ｦ繝・竊・縺昴・縺ｾ縺ｾ邯夊｡・*/ }

    await page.waitForTimeout(2000);

    const html  = await page.content();
    const title = (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || '(no title)';
    console.log(`[${prefLabel}] page title: ${title.trim().substring(0, 70)}`);

    // 繝√Ε繝ｬ繝ｳ繧ｸ繝壹・繧ｸ縺ｮ縺ｾ縺ｾ縺ｪ繧牙燕蝗槭ョ繝ｼ繧ｿ菫晄戟縺ｮ縺溘ａ繧ｨ繝ｩ繝ｼ繧呈兜縺偵ｋ
    if (isChallengeTitle(title)) throw new Error(`Cloudflare challenge: ${title.trim()}`);

    const $      = cheerio.load(html, { decodeEntities: false });
    const subSec = $('section.subSec').length;
    const postH3 = $('div.post h3').length;
    console.log(`[${prefLabel}] selectors: section.subSec=${subSec} div.post-h3=${postH3}`);
    const events = parserFn($);
    console.log(`[${prefLabel}] ${events.length} 莉ｶ蜿門ｾ・(Playwright)`);
    return events;
  } catch (err) {
    console.warn(`[${prefLabel}] Playwright 螟ｱ謨・ ${err.message} 竊・fetch 縺ｫ繝輔か繝ｼ繝ｫ繝舌ャ繧ｯ`);
  } finally {
    await page.close();
  }

  const res = await fetch(url, {
    headers: {
      'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
      'Referer':         'https://www.mod.go.jp/',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html   = await res.text();
  const $      = cheerio.load(html, { decodeEntities: false });
  const events = parserFn($);
  console.log(`[${prefLabel}] ${events.length} 莉ｶ蜿門ｾ・(fetch fallback)`);
  return events;
}

const fetchGunma     = (ctx) => fetchHtmlPref(ctx, '鄒､鬥ｬ', URLS.gunma,     parseGunma);
const fetchIbaraki   = (ctx) => fetchHtmlPref(ctx, '闌ｨ蝓・, URLS.ibaraki,   parseIbaraki);
const fetchChiba     = (ctx) => fetchHtmlPref(ctx, '蜊・痩', URLS.chiba,     parseChiba);
// 霑醍柄蝨ｰ譛ｬ・・TML 繧ｹ繧ｯ繝ｬ繧､繝斐Φ繧ｰ・・const fetchKyoto     = (ctx) => fetchHtmlPref(ctx, '莠ｬ驛ｽ', URLS.kyoto,     parseKyoto);
const fetchOsaka     = (ctx) => fetchHtmlPref(ctx, '螟ｧ髦ｪ', URLS.osaka,     parseOsaka);
// 譚ｱ蛹怜慍譛ｬ・・TML 繧ｹ繧ｯ繝ｬ繧､繝斐Φ繧ｰ・・const fetchMiyagi    = (ctx) => fetchHtmlPref(ctx, '螳ｮ蝓・, URLS.miyagi,    parseMiyagi);
const fetchAomori    = (ctx) => fetchHtmlPref(ctx, '髱呈｣ｮ', URLS.aomori,    parseAomori);
const fetchIwate     = (ctx) => fetchHtmlPref(ctx, '蟯ｩ謇・, URLS.iwate,     parseIwate);
const fetchYamagata  = (ctx) => fetchHtmlPref(ctx, '螻ｱ蠖｢', URLS.yamagata,  parseYamagata);
const fetchFukushima = (ctx) => fetchHtmlPref(ctx, '遖丞ｳｶ', URLS.fukushima, parseFukushima);
// 荳ｭ驛ｨ蝨ｰ譛ｬ・・TML 繧ｹ繧ｯ繝ｬ繧､繝斐Φ繧ｰ・・const fetchNiigata   = (ctx) => fetchHtmlPref(ctx, '譁ｰ貎・, URLS.niigata,   parseNiigata);
const fetchIshikawa  = (ctx) => fetchHtmlPref(ctx, '遏ｳ蟾・, URLS.ishikawa,  parseIshikawa);
const fetchFukui     = (ctx) => fetchHtmlPref(ctx, '遖丈ｺ・, URLS.fukui,     parseFukui);
const fetchYamanashi = (ctx) => fetchHtmlPref(ctx, '螻ｱ譴ｨ', URLS.yamanashi, parseYamanashi);
const fetchGifu      = (ctx) => fetchHtmlPref(ctx, '蟯宣・', URLS.gifu,      parseGifu);
async function fetchAichi(ctx) {
  // 繧ｫ繝ｬ繝ｳ繝繝ｼ繝壹・繧ｸ縺九ｉ蝓ｺ譛ｬ諠・ｱ繧貞叙蠕・  const events = await fetchHtmlPref(ctx, '諢帷衍', URLS.aichi, parseAichi);

  // URL 繧呈戟縺､繧､繝吶Φ繝医・隧ｳ邏ｰ繝壹・繧ｸ縺九ｉ place/time 繧定｣懷ｮ・  let enriched = 0;
  for (const ev of events) {
    if (!ev.url || ev.place) continue;
    try {
      const page = await ctx.newPage();
      try {
        await page.goto(ev.url, { waitUntil: 'domcontentloaded', timeout: 20_000 });
        await page.waitForTimeout(1500);
        const html = await page.content();
        const $ = cheerio.load(html, { decodeEntities: false });
        const detail = parseAichiDetail($);
        if (detail.place) { ev.place = detail.place; enriched++; }
        if (detail.time)  { ev.time  = detail.time; }
      } finally {
        await page.close();
      }
    } catch {
      // 隧ｳ邏ｰ蜿門ｾ怜､ｱ謨励・辟｡隕厄ｼ・lace 縺ｯ遨ｺ譁・ｭ励・縺ｾ縺ｾ・・    }
  }
  if (enriched > 0) console.log(`[諢帷衍] 隧ｳ邏ｰ繝壹・繧ｸ縺九ｉ place 陬懷ｮ・ ${enriched}莉ｶ`);
  return events;
}
const fetchShizuoka  = (ctx) => fetchHtmlPref(ctx, '髱吝ｲ｡', URLS.shizuoka,  parseShizuoka);

/**
 * 譛ｭ蟷悟慍譛ｬ: 4 縺､縺ｮ繧ｵ繝悶・繝ｼ繧ｸ繧帝・分縺ｫ蜿門ｾ励＠縲√う繝吶Φ繝医ｒ邨ｱ蜷医＠縺ｦ霑斐☆縲・ */
async function fetchSapporo(context) {
  console.log('[譛ｭ蟷珪 4 繧ｵ繝悶・繝ｼ繧ｸ繧貞叙蠕嶺ｸｭ...');
  const subPages = [
    { url: URLS.sapporo_station, cat: '荳闊ｬ蜈ｬ髢・, id: 'st' },
    { url: URLS.sapporo_naval,   cat: '荳闊ｬ蜈ｬ髢・, id: 'nv' },
    { url: URLS.sapporo_concert, cat: '貍泌･丈ｼ・,   id: 'co' },
    { url: URLS.sapporo_other,   cat: '繧､繝吶Φ繝・, id: 'ot' },
  ];
  const state  = { counter: 0 };
  const allEvs = [];

  for (const sp of subPages) {
    const page = await context.newPage();
    try {
      await page.goto(sp.url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      try {
        await page.waitForFunction(
          () => { const t = document.title; return t.length > 0 && !t.includes('Just a moment') && !t.includes('縺励・繧峨￥縺雁ｾ・■縺上□縺輔＞'); },
          { timeout: 60_000 }
        );
      } catch { /* ok */ }
      await page.waitForTimeout(2000);
      const html  = await page.content();
      const $     = cheerio.load(html, { decodeEntities: false });
      const evs   = parseSapporoPage($, sp.cat, sp.id, state, sp.url);
      console.log(`[譛ｭ蟷珪 ${sp.url.split('/').pop()} 竊・${evs.length} 莉ｶ`);
      allEvs.push(...evs);
    } catch (err) {
      console.warn(`[譛ｭ蟷珪 ${sp.url} 螟ｱ謨・ ${err.message.substring(0, 60)}`);
    } finally {
      await page.close();
    }
    await sleep(3000);
  }

  const seen = new Set();
  const result = allEvs
    .filter(e => { const k = `${e.date}-${e.title}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => a.date.localeCompare(b.date));
  console.log(`[譛ｭ蟷珪 蜷郁ｨ・${result.length} 莉ｶ`);
  return result;
}

/**
 * 遘狗伐蝨ｰ譛ｬ: Google 繧ｫ繝ｬ繝ｳ繝繝ｼ iCal 2 譛ｬ繧・fetch 縺励※邨ｱ蜷医☆繧九・ */
async function fetchAkita() {
  console.log('[遘狗伐] Google Calendar iCal 蜿門ｾ・..');
  const fetchIcal = async (url) => {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/calendar, */*' },
    });
    if (!res.ok) { console.warn(`[遘狗伐] iCal ${res.status}: ${url}`); return ''; }
    return res.text();
  };
  const [ics1, ics2] = await Promise.all([
    fetchIcal(URLS.akita_ical1),
    fetchIcal(URLS.akita_ical2),
  ]);
  const events = parseAkita(ics1, ics2);
  console.log(`[遘狗伐] ${events.length} 莉ｶ蜿門ｾ・(iCal)`);
  return events;
}

/**
 * 髟ｷ驥主慍譛ｬ: Google 繧ｫ繝ｬ繝ｳ繝繝ｼ iCal 繝輔ぅ繝ｼ繝峨ｒ逶ｴ謗･ fetch 縺励※隗｣譫舌☆繧九・ * Playwright 荳崎ｦ・ｼ・oogle 繧ｫ繝ｬ繝ｳ繝繝ｼ URL 縺ｯ Cloudflare 蟇ｾ雎｡螟厄ｼ峨・ */
async function fetchNagano() {
  console.log(`[髟ｷ驥讃 iCal 繝輔ぅ繝ｼ繝牙叙蠕・ ${URLS.nagano}`);
  const res = await fetch(URLS.nagano, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept':     'text/calendar, */*',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const icsText = await res.text();
  const events  = parseNagano(icsText);
  console.log(`[髟ｷ驥讃 ${events.length} 莉ｶ蜿門ｾ・(iCal)`);
  return events;
}

/**
 * WordPress 邉ｻ蝨ｰ譛ｬ: 荳隕ｧ繝壹・繧ｸ縺九ｉ謚慕ｨｿ URL 繧貞叙蠕励＠縲∝推謚慕ｨｿ繝壹・繧ｸ繧帝・ｬ｡繝輔ぉ繝・メ縺励※
 * parserFn 縺ｧ繧､繝吶Φ繝医ｒ謚ｽ蜃ｺ縺吶ｋ蜈ｱ騾夐未謨ｰ縲・ *
 * @param {BrowserContext} ctx
 * @param {string}         pref     - 繝ｭ繧ｰ逕ｨ繝ｩ繝吶Ν
 * @param {string}         listUrl  - 荳隕ｧ繝壹・繧ｸ URL
 * @param {Function}       urlsFn   - 荳隕ｧ繝壹・繧ｸ HTML 縺九ｉ繝昴せ繝・URL 驟榊・繧定ｿ斐☆髢｢謨ｰ
 * @param {Function}       postFn   - 蛟句挨謚慕ｨｿ HTML 縺九ｉ events 驟榊・繧定ｿ斐☆髢｢謨ｰ(($, url, counter) => [])
 * @param {number}         maxPosts - 譛螟ｧ蜿門ｾ玲兜遞ｿ謨ｰ
 */
async function fetchWpPosts(ctx, pref, listUrl, urlsFn, postFn, maxPosts = 5) {
  console.log(`[${pref}] 荳隕ｧ繝壹・繧ｸ蜿門ｾ・ ${listUrl}`);
  let postUrls = [];

  // 笏笏 荳隕ｧ繝壹・繧ｸ 笏笏
  const listPage = await ctx.newPage();
  try {
    await listPage.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    try {
      await listPage.waitForFunction(
        () => { const t = document.title; return t.length > 0 && !t.includes('Just a moment') && !t.includes('縺励・繧峨￥縺雁ｾ・■縺上□縺輔＞'); },
        { timeout: 60_000 }
      );
    } catch {}
    await listPage.waitForTimeout(2000);
    const html = await listPage.content();
    const $    = cheerio.load(html, { decodeEntities: false });
    postUrls   = [...new Set(urlsFn($))].slice(0, maxPosts);
    console.log(`[${pref}] 謚慕ｨｿ URL ${postUrls.length} 莉ｶ蜿門ｾ輿);
  } catch (err) {
    console.warn(`[${pref}] 荳隕ｧ繝壹・繧ｸ螟ｱ謨・ ${err.message.substring(0, 60)}`);
  } finally {
    await listPage.close();
  }

  if (postUrls.length === 0) return [];

  // 笏笏 蜷・兜遞ｿ繝壹・繧ｸ 笏笏
  const events = [];
  let counter  = 0;
  for (const postUrl of postUrls) {
    const postPage = await ctx.newPage();
    try {
      await postPage.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      try {
        await postPage.waitForFunction(
          () => { const t = document.title; return t.length > 0 && !t.includes('Just a moment') && !t.includes('縺励・繧峨￥縺雁ｾ・■縺上□縺輔＞'); },
          { timeout: 30_000 }
        );
      } catch {}
      await postPage.waitForTimeout(2000);
      const html = await postPage.content();
      const $    = cheerio.load(html, { decodeEntities: false });
      const evs  = postFn($, postUrl, ++counter);
      if (evs.length) console.log(`[${pref}] ${postUrl.split('/').slice(-2,-1)[0]} 竊・${evs[0].date} ${evs[0].title.substring(0,30)}`);
      events.push(...evs);
    } catch (err) {
      console.warn(`[${pref}] 謚慕ｨｿ蜿門ｾ怜､ｱ謨・ ${err.message.substring(0, 60)}`);
    } finally {
      await postPage.close();
    }
    await sleep(1500);
  }

  console.log(`[${pref}] ${events.length} 莉ｶ蜿門ｾ輿);
  return events;
}

const fetchMie      = (ctx) => fetchWpPosts(ctx, '荳蛾㍾',   URLS.mie,      parseMiePostUrls,      parseMiePost,      5);
const fetchShiga    = (ctx) => fetchWpPosts(ctx, '貊玖ｳ',   URLS.shiga,    parseShigaPostUrls,    parseShigaPost,    5);
const fetchNara     = (ctx) => fetchWpPosts(ctx, '螂郁憶',   URLS.nara,     parseNaraPostUrls,     parseNaraPost,     5);
const fetchWakayama = (ctx) => fetchWpPosts(ctx, '蜥梧ｭ悟ｱｱ', URLS.wakayama, parseWakayamaPostUrls, parseWakayamaPost, 5);

/**
 * 蜈ｵ蠎ｫ蝨ｰ譛ｬ: TOP 繝壹・繧ｸ縺九ｉ繧､繝吶Φ繝医ヰ繝翫・逕ｻ蜒上ｒ蜿門ｾ励＠ OCR 縺ｧ繧､繝吶Φ繝医ｒ謚ｽ蜃ｺ縺吶ｋ縲・ * GEMINI_API_KEY 譛ｪ險ｭ螳壹・蝣ｴ蜷医・遨ｺ驟榊・繧定ｿ斐☆縲・ */
async function fetchHyogo(context) {
  console.log(`[蜈ｵ蠎ｫ] 繧｢繧ｯ繧ｻ繧ｹ: ${URLS.hyogo}`);

  const page = await context.newPage();
  let imageUrls = [];
  try {
    await page.goto(URLS.hyogo, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    try {
      await page.waitForFunction(
        () => { const t = document.title; return t.length > 0 && !t.includes('Just a moment') && !t.includes('縺励・繧峨￥縺雁ｾ・■縺上□縺輔＞'); },
        { timeout: 90_000 }
      );
    } catch {}
    await page.waitForTimeout(2000);
    const html = await page.content();
    const $    = cheerio.load(html, { decodeEntities: false });
    imageUrls  = parseHyogoImages($);
    console.log(`[蜈ｵ蠎ｫ] ${imageUrls.length} 莉ｶ縺ｮ逕ｻ蜒上ｒ讀懷・`);
  } catch (err) {
    console.warn(`[蜈ｵ蠎ｫ] Playwright 螟ｱ謨・ ${err.message}`);
  } finally {
    await page.close();
  }

  if (!process.env.GEMINI_API_KEY) {
    console.log('[蜈ｵ蠎ｫ] GEMINI_API_KEY 譛ｪ險ｭ螳壹・縺溘ａ OCR 繧ｹ繧ｭ繝・・');
    return [];
  }
  if (imageUrls.length === 0) return [];

  const events = [];
  let idx = 0;
  for (const imgUrl of imageUrls) {
    console.log(`[蜈ｵ蠎ｫ OCR] ${imgUrl}`);
    const ocr = await ocrImageFull(imgUrl);
    if (!ocr) continue;

    const rawDate = toHalfWidth((ocr.date || '').replace(/\s+/g, ' ').trim());
    const dtMatch = rawDate.match(/莉､蜥・\d+)蟷ｴ(\d+)譛・\d+)譌･[・・]([譛育↓豌ｴ譛ｨ驥大悄譌･逾昴・]+)[・・]/)
      || rawDate.match(/(\d{4})蟷ｴ(\d+)譛・\d+)譌･[・・]([譛育↓豌ｴ譛ｨ驥大悄譌･逾昴・]+)[・・]/);

    let dateStr = '', weekday = '';
    if (dtMatch && dtMatch[0].startsWith('莉､蜥・)) {
      const year = reiwaToAD(parseInt(dtMatch[1], 10));
      dateStr  = `${year}-${padTwo(parseInt(dtMatch[2], 10))}-${padTwo(parseInt(dtMatch[3], 10))}`;
      weekday  = dtMatch[4];
    } else if (dtMatch) {
      dateStr  = `${dtMatch[1]}-${padTwo(parseInt(dtMatch[2], 10))}-${padTwo(parseInt(dtMatch[3], 10))}`;
      weekday  = dtMatch[4];
    } else {
      // 繝輔ぃ繧､繝ｫ蜷阪°繧画律莉倥ｒ謗ｨ螳夲ｼ井ｾ・ 0530aono_banner.png 竊・5譛・0譌･・・      const fnMatch = imgUrl.match(/(\d{2})(\d{2})[a-z]/i);
      if (fnMatch) {
        const now = new Date();
        const m = parseInt(fnMatch[1], 10), d = parseInt(fnMatch[2], 10);
        const inFut = m > now.getMonth() + 1 || (m === now.getMonth() + 1 && d >= now.getDate());
        dateStr = `${inFut ? now.getFullYear() : now.getFullYear() + 1}-${padTwo(m)}-${padTwo(d)}`;
      }
    }

    if (!dateStr || isPast(dateStr)) continue;

    const title = ocr.title ? fixOcrTitle(ocr.title.trim()) : '';
    if (!title) continue;

    events.push({
      id:             `hy-${dateStr.replace(/-/g, '')}-${titleHash(dateStr, title)}`,
      pref:           'hyogo',
      date:           dateStr,
      weekday,
      title,
      place:          (ocr.place          || '').trim(),
      address:        '',
      time:           (ocr.time           || '').trim(),
      category:       guessCategory(toHalfWidth(title)),
      tag:            guessTag(title),
      url:            URLS.hyogo,
      notes:          ocr.notes          || null,
      ageRequirement: ocr.ageRequirement || null,
      deadline:       ocr.deadline       || null,
      imageUrl:       '',
    });

    await sleep(4500);
  }

  console.log(`[蜈ｵ蠎ｫ] ${events.length} 莉ｶ蜿門ｾ・(OCR)`);
  return events.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * 譬・惠蝨ｰ譛ｬ繝壹・繧ｸ繧貞叙蠕励＠縲゛PG 繝昴せ繧ｿ繝ｼ繧・OCR 縺励※繧､繝吶Φ繝井ｸ隕ｧ繧定ｿ斐☆縲・ * GEMINI_API_KEY 譛ｪ險ｭ螳壹・蝣ｴ蜷医・遨ｺ驟榊・繧定ｿ斐☆・・CR 繧ｹ繧ｭ繝・・・峨・ */
async function fetchTochigi(context) {
  console.log(`[譬・惠] 繧｢繧ｯ繧ｻ繧ｹ: ${URLS.tochigi}`);

  const page = await context.newPage();
  let imageUrls = [];
  try {
    await page.goto(URLS.tochigi, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    try {
      await page.waitForFunction(
        () => {
          const t = document.title;
          return t.length > 0
            && !t.includes('Just a moment')
            && !t.includes('Attention Required')
            && !t.includes('縺励・繧峨￥縺雁ｾ・■縺上□縺輔＞');
        },
        { timeout: 90_000 }
      );
    } catch { /* 繝√Ε繝ｬ繝ｳ繧ｸ縺ｪ縺・or 繧ｿ繧､繝繧｢繧ｦ繝・*/ }
    await page.waitForTimeout(2000);
    const html  = await page.content();
    const title = (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || '';
    console.log(`[譬・惠] page title: ${title.trim().substring(0, 70)}`);
    if (isChallengeTitle(title)) throw new Error(`Cloudflare challenge: ${title.trim()}`);
    const $    = cheerio.load(html, { decodeEntities: false });
    imageUrls  = parseTochigiImages($);
    console.log(`[譬・惠] ${imageUrls.length} 莉ｶ縺ｮ逕ｻ蜒上ｒ讀懷・`);
  } catch (err) {
    console.warn(`[譬・惠] Playwright 螟ｱ謨・ ${err.message}`);
  } finally {
    await page.close();
  }

  if (!process.env.GEMINI_API_KEY) {
    console.log('[譬・惠] GEMINI_API_KEY 譛ｪ險ｭ螳壹・縺溘ａ OCR 繧ｹ繧ｭ繝・・');
    return [];
  }
  if (imageUrls.length === 0) return [];

  const events = [];
  let idx = 0;
  for (const imgUrl of imageUrls) {
    console.log(`[譬・惠 OCR] ${imgUrl}`);
    const ocr = await ocrImageFull(imgUrl);
    if (!ocr) continue;

    const rawDate = toHalfWidth((ocr.date || '').replace(/\s+/g, ' ').trim());
    const dtMatch = rawDate.match(/莉､蜥・\d+)蟷ｴ(\d+)譛・\d+)譌･[・・]([譛育↓豌ｴ譛ｨ驥大悄譌･逾昴・]+)[・・]/);
    if (!dtMatch) { console.warn(`[譬・惠 OCR] 譌･莉倥ヱ繝ｼ繧ｹ螟ｱ謨・ "${ocr.date}"`); continue; }

    const year    = reiwaToAD(parseInt(dtMatch[1], 10));
    const month   = parseInt(dtMatch[2], 10);
    const day     = parseInt(dtMatch[3], 10);
    const weekday = dtMatch[4];
    const dateStr = `${year}-${padTwo(month)}-${padTwo(day)}`;
    if (isPast(dateStr)) continue;

    const title = ocr.title ? fixOcrTitle(ocr.title.trim()) : '';
    if (!title) continue;

    events.push({
      id:             `tc-${dateStr.replace(/-/g, '')}-${titleHash(dateStr, title)}`,
      pref:           'tochigi',
      date:           dateStr,
      weekday,
      title,
      place:          (ocr.place          || '').trim(),
      address:        '',
      time:           (ocr.time           || '').trim(),
      category:       guessCategory(toHalfWidth(title)),
      tag:            guessTag(title),
      url:            '',
      notes:          ocr.notes          || null,
      ageRequirement: ocr.ageRequirement || null,
      deadline:       ocr.deadline       || null,
      imageUrl:       '',  // OCR 貂医∩縺ｮ縺溘ａ蜀榊・逅・ｸ崎ｦ・    });

    await sleep(4500);
  }

  console.log(`[譬・惠] ${events.length} 莉ｶ蜿門ｾ・(OCR)`);
  return events.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * 蟇悟ｱｱ蝨ｰ譛ｬ繝壹・繧ｸ繧貞叙蠕励＠縲゛PG 繝昴せ繧ｿ繝ｼ繧・OCR 縺励※繧､繝吶Φ繝井ｸ隕ｧ繧定ｿ斐☆縲・ * GEMINI_API_KEY 譛ｪ險ｭ螳壹・蝣ｴ蜷医・遨ｺ驟榊・繧定ｿ斐☆・・CR 繧ｹ繧ｭ繝・・・峨・ */
async function fetchToyama(context) {
  console.log(`[蟇悟ｱｱ] 繧｢繧ｯ繧ｻ繧ｹ: ${URLS.toyama}`);

  const page = await context.newPage();
  let imageUrls = [];
  try {
    await page.goto(URLS.toyama, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    try {
      await page.waitForFunction(
        () => {
          const t = document.title;
          return t.length > 0
            && !t.includes('Just a moment')
            && !t.includes('Attention Required')
            && !t.includes('縺励・繧峨￥縺雁ｾ・■縺上□縺輔＞');
        },
        { timeout: 90_000 }
      );
    } catch { /* 繝√Ε繝ｬ繝ｳ繧ｸ縺ｪ縺・or 繧ｿ繧､繝繧｢繧ｦ繝・*/ }
    await page.waitForTimeout(2000);
    const html  = await page.content();
    const title = (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || '';
    console.log(`[蟇悟ｱｱ] page title: ${title.trim().substring(0, 70)}`);
    if (isChallengeTitle(title)) throw new Error(`Cloudflare challenge: ${title.trim()}`);
    const $   = cheerio.load(html, { decodeEntities: false });
    imageUrls = parseToyamaImages($);
    console.log(`[蟇悟ｱｱ] ${imageUrls.length} 莉ｶ縺ｮ逕ｻ蜒上ｒ讀懷・`);
  } catch (err) {
    console.warn(`[蟇悟ｱｱ] Playwright 螟ｱ謨・ ${err.message}`);
  } finally {
    await page.close();
  }

  if (!process.env.GEMINI_API_KEY) {
    console.log('[蟇悟ｱｱ] GEMINI_API_KEY 譛ｪ險ｭ螳壹・縺溘ａ OCR 繧ｹ繧ｭ繝・・');
    return [];
  }
  if (imageUrls.length === 0) return [];

  const events = [];
  let idx = 0;
  for (const imgUrl of imageUrls) {
    console.log(`[蟇悟ｱｱ OCR] ${imgUrl}`);
    const ocr = await ocrImageFull(imgUrl);
    if (!ocr) continue;

    const rawDate = toHalfWidth((ocr.date || '').replace(/\s+/g, ' ').trim());
    const dtMatch = rawDate.match(/莉､蜥・\d+)蟷ｴ(\d+)譛・\d+)譌･[・・]([譛育↓豌ｴ譛ｨ驥大悄譌･逾昴・]+)[・・]/);
    if (!dtMatch) { console.warn(`[蟇悟ｱｱ OCR] 譌･莉倥ヱ繝ｼ繧ｹ螟ｱ謨・ "${ocr.date}"`); continue; }

    const year    = reiwaToAD(parseInt(dtMatch[1], 10));
    const dateStr = `${year}-${padTwo(parseInt(dtMatch[2], 10))}-${padTwo(parseInt(dtMatch[3], 10))}`;
    if (isPast(dateStr)) continue;

    const title = ocr.title ? fixOcrTitle(ocr.title.trim()) : '';
    if (!title) continue;

    events.push({
      id:             `to-${dateStr.replace(/-/g, '')}-${titleHash(dateStr, title)}`,
      pref:           'toyama',
      date:           dateStr,
      weekday:        dtMatch[4],
      title,
      place:          (ocr.place          || '').trim(),
      address:        '',
      time:           (ocr.time           || '').trim(),
      category:       guessCategory(toHalfWidth(title)),
      tag:            guessTag(title),
      url:            '',
      notes:          ocr.notes          || null,
      ageRequirement: ocr.ageRequirement || null,
      deadline:       ocr.deadline       || null,
      imageUrl:       '',
    });

    await sleep(4500);
  }

  console.log(`[蟇悟ｱｱ] ${events.length} 莉ｶ蜿門ｾ・(OCR)`);
  return events.sort((a, b) => a.date.localeCompare(b.date));
}

// 笏笏 繝｡繧､繝ｳ蜃ｦ逅・笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏

async function main() {
  const isMock = process.argv.includes('--mock');

  // 笏笏 繝｢繝・け繝｢繝ｼ繝・笏笏
  if (isMock) {
    console.log('[mock] HTTP 繧｢繧ｯ繧ｻ繧ｹ縺ｪ縺励〒繧ｵ繝ｳ繝励Ν繝・・繧ｿ繧貞・蜉帙＠縺ｾ縺・);
    const output = { ...MOCK_DATA, updatedAt: nowJST() };
    writeOutput(output);
    console.log('[mock] 螳御ｺ・);
    return;
  }

  // 笏笏 螳溘せ繧ｯ繝ｬ繧､繝斐Φ繧ｰ繝｢繝ｼ繝・笏笏
  let sapporoEvents   = [];
  let asahikawaEvents = [];
  let obihiroEvents   = [];
  let hakodateEvents  = [];
  let miyagiEvents    = [];
  let aomoriEvents    = [];
  let iwateEvents     = [];
  let yamagataEvents  = [];
  let fukushimaEvents = [];
  let akitaEvents     = [];
  let kanagawaEvents  = [];
  let tokyoEvents     = [];
  let saitamaEvents   = [];
  let gunmaEvents     = [];
  let tochigiEvents   = [];
  let ibarakiEvents   = [];
  let chibaEvents     = [];
  let niigataEvents   = [];
  let toyamaEvents    = [];
  let ishikawaEvents  = [];
  let fukuiEvents     = [];
  let yamanashiEvents = [];
  let naganoEvents    = [];
  let gifuEvents      = [];
  let shizuokaEvents  = [];
  let aichiEvents     = [];
  // 霑醍柄蝨ｰ譛ｬ
  let mieEvents       = [];
  let shigaEvents     = [];
  let kyotoEvents     = [];
  let osakaEvents     = [];
  let hyogoEvents     = [];
  let naraEvents      = [];
  let wakayamaEvents  = [];
  // 蝗帛嵜蝨ｰ譛ｬ
  let ehimeEvents     = [];
  let kagawaEvents    = [];
  let kochiEvents     = [];
  let tokushimaEvents = [];
  // 荳ｭ蝗ｽ蝨ｰ譛ｬ
  let tottoriEvents   = [];
  let shimaneEvents   = [];
  let okayamaEvents   = [];
  let hiroshimaEvents = [];
  let yamaguchiEvents = [];
  // 荵晏ｷ槭・豐也ｸ・慍譛ｬ
  let fukuokaEvents   = [];
  let sagaEvents      = [];
  let nagasakiEvents  = [];
  let kumamotoEvents  = [];
  let oitaEvents      = [];
  let miyazakiEvents  = [];
  let kagoshimaEvents = [];
  let okinawaEvents   = [];
  let sapporoError   = false;
  let asahikawaError = false;
  let obihiroError   = false;
  let hakodateError  = false;
  let miyagiError    = false;
  let aomoriError    = false;
  let iwateError     = false;
  let yamagataError  = false;
  let fukushimaError = false;
  let akitaError     = false;
  let kanagawaError   = false;
  let tokyoError      = false;
  let saitamaError    = false;
  let gunmaError      = false;
  let tochigiError    = false;
  let ibarakiError    = false;
  let chibaError      = false;
  let niigataError    = false;
  let toyamaError     = false;
  let ishikawaError   = false;
  let fukuiError      = false;
  let yamanashiError  = false;
  let naganoError     = false;
  let gifuError       = false;
  let shizuokaError   = false;
  let aichiError      = false;
  // 霑醍柄蝨ｰ譛ｬ
  let mieError        = false;
  let shigaError      = false;
  let kyotoError      = false;
  let osakaError      = false;
  let hyogoError      = false;
  let naraError       = false;
  let wakayamaError   = false;
  // 蝗帛嵜蝨ｰ譛ｬ
  let ehimeError      = false;
  let kagawaError     = false;
  let kochiError      = false;
  let tokushimaError  = false;
  // 荳ｭ蝗ｽ蝨ｰ譛ｬ
  let tottoriError    = false;
  let shimaneError    = false;
  let okayamaError    = false;
  let hiroshimaError  = false;
  let yamaguchiError  = false;
  // 荵晏ｷ槭・豐也ｸ・慍譛ｬ
  let fukuokaError    = false;
  let sagaError       = false;
  let nagasakiError   = false;
  let kumamotoError   = false;
  let oitaError       = false;
  let miyazakiError   = false;
  let kagoshimaError  = false;
  let okinawaError    = false;

  const isLinux = process.platform === 'linux';
  const browser = await chromium.launch({
    headless: true,
    args: [
      ...(isLinux ? ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] : []),
      '--disable-infobars',
      '--disable-blink-features=AutomationControlled',
      '--lang=ja-JP',
    ],
  });

  // 蝨ｰ譛ｬ縺斐→縺ｫ譁ｰ隕上さ繝ｳ繝・く繧ｹ繝医ｒ逕滓・縺吶ｋ・亥・譛峨そ繝・す繝ｧ繝ｳ縺縺ｨ Cloudflare 縺ｫ讀懃衍縺輔ｌ繧具ｼ・  async function withFreshContext(fn) {
    const ctx = await createStealthContext(browser);
    try { return await fn(ctx); }
    finally { await ctx.close(); }
  }

  try {
    // 笏笏 蛹玲ｵｷ驕灘慍譛ｬ 笏笏
    try {
      sapporoEvents = await withFreshContext(ctx => fetchSapporo(ctx));
    } catch (err) {
      console.error(`[譛ｭ蟷珪 蜿門ｾ怜､ｱ謨・ ${err.message}`);
      sapporoError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 遘貞ｾ・ｩ・..`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      asahikawaEvents = await withFreshContext(ctx => fetchHtmlPref(ctx, '譌ｭ蟾・, URLS.asahikawa, parseAsahikawa));
    } catch (err) {
      console.error(`[譌ｭ蟾拆 蜿門ｾ怜､ｱ謨・ ${err.message}`);
      asahikawaError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 遘貞ｾ・ｩ・..`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      obihiroEvents = await withFreshContext(ctx => fetchHtmlPref(ctx, '蟶ｯ蠎・, URLS.obihiro, parseObihiro));
    } catch (err) {
      console.error(`[蟶ｯ蠎ゾ 蜿門ｾ怜､ｱ謨・ ${err.message}`);
      obihiroError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 遘貞ｾ・ｩ・..`);
    await sleep(BETWEEN_PAGES_MS);

    // 蜃ｽ鬢ｨ縺ｯInstagram遘ｻ陦後・縺溘ａ遨ｺ驟榊・・医ヱ繝ｼ繧ｵ繝ｼ縺・[] 繧定ｿ斐☆・・    try {
      hakodateEvents = await withFreshContext(ctx => fetchHtmlPref(ctx, '蜃ｽ鬢ｨ', URLS.hakodate, parseHakodate));
    } catch (err) {
      console.error(`[蜃ｽ鬢ｨ] 蜿門ｾ怜､ｱ謨・ ${err.message}`);
      hakodateError = true;
    }

    // 笏笏 譚ｱ蛹怜慍譛ｬ 笏笏
    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 遘貞ｾ・ｩ・..`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      miyagiEvents = await withFreshContext(ctx => fetchMiyagi(ctx));
    } catch (err) {
      console.error(`[螳ｮ蝓讃 蜿門ｾ怜､ｱ謨・ ${err.message}`);
      miyagiError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 遘貞ｾ・ｩ・..`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      aomoriEvents = await withFreshContext(ctx => fetchAomori(ctx));
    } catch (err) {
      console.error(`[髱呈｣ｮ] 蜿門ｾ怜､ｱ謨・ ${err.message}`);
      aomoriError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 遘貞ｾ・ｩ・..`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      iwateEvents = await withFreshContext(ctx => fetchIwate(ctx));
    } catch (err) {
      console.error(`[蟯ｩ謇犠 蜿門ｾ怜､ｱ謨・ ${err.message}`);
      iwateError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 遘貞ｾ・ｩ・..`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      yamagataEvents = await withFreshContext(ctx => fetchYamagata(ctx));
    } catch (err) {
      console.error(`[螻ｱ蠖｢] 蜿門ｾ怜､ｱ謨・ ${err.message}`);
      yamagataError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 遘貞ｾ・ｩ・..`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      fukushimaEvents = await withFreshContext(ctx => fetchFukushima(ctx));
    } catch (err) {
      console.error(`[遖丞ｳｶ] 蜿門ｾ怜､ｱ謨・ ${err.message}`);
      fukushimaError = true;
    }

    // 遘狗伐縺ｯ iCal fetch・・laywright 荳崎ｦ・ｼ・    try {
      akitaEvents = await fetchAkita();
    } catch (err) {
      console.error(`[遘狗伐] 蜿門ｾ怜､ｱ謨・ ${err.message}`);
      akitaError = true;
    }

    // 笏笏 髢｢譚ｱ蝨ｰ譛ｬ 笏笏
    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 遘貞ｾ・ｩ・..`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      kanagawaEvents = await withFreshContext(ctx => fetchKanagawa(ctx));
    } catch (err) {
      console.error(`[逾槫･亥ｷ拆 蜿門ｾ怜､ｱ謨・ ${err.message}`);
      kanagawaError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 遘貞ｾ・ｩ・..`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      tokyoEvents = await withFreshContext(ctx => fetchTokyo(ctx));
    } catch (err) {
      console.error(`[譚ｱ莠ｬ] 蜿門ｾ怜､ｱ謨・ ${err.message}`);
      tokyoError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 遘貞ｾ・ｩ・..`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      saitamaEvents = await withFreshContext(ctx => fetchSaitama(ctx));
    } catch (err) {
      console.error(`[蝓ｼ邇云 蜿門ｾ怜､ｱ謨・ ${err.message}`);
      saitamaError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 遘貞ｾ・ｩ・..`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      gunmaEvents = await withFreshContext(ctx => fetchGunma(ctx));
    } catch (err) {
      console.error(`[鄒､鬥ｬ] 蜿門ｾ怜､ｱ謨・ ${err.message}`);
      gunmaError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 遘貞ｾ・ｩ・..`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      ibarakiEvents = await withFreshContext(ctx => fetchIbaraki(ctx));
    } catch (err) {
      console.error(`[闌ｨ蝓讃 蜿門ｾ怜､ｱ謨・ ${err.message}`);
      ibarakiError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 遘貞ｾ・ｩ・..`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      chibaEvents = await withFreshContext(ctx => fetchChiba(ctx));
    } catch (err) {
      console.error(`[蜊・痩] 蜿門ｾ怜､ｱ謨・ ${err.message}`);
      chibaError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 遘貞ｾ・ｩ・..`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      tochigiEvents = await withFreshContext(ctx => fetchTochigi(ctx));
    } catch (err) {
      console.error(`[譬・惠] 蜿門ｾ怜､ｱ謨・ ${err.message}`);
      tochigiError = true;
    }

    // 笏笏 荳ｭ驛ｨ蝨ｰ譛ｬ 笏笏
    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 遘貞ｾ・ｩ・..`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      niigataEvents = await withFreshContext(ctx => fetchNiigata(ctx));
    } catch (err) {
      console.error(`[譁ｰ貎歉 蜿門ｾ怜､ｱ謨・ ${err.message}`);
      niigataError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 遘貞ｾ・ｩ・..`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      toyamaEvents = await withFreshContext(ctx => fetchToyama(ctx));
    } catch (err) {
      console.error(`[蟇悟ｱｱ] 蜿門ｾ怜､ｱ謨・ ${err.message}`);
      toyamaError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 遘貞ｾ・ｩ・..`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      ishikawaEvents = await withFreshContext(ctx => fetchIshikawa(ctx));
    } catch (err) {
      console.error(`[遏ｳ蟾拆 蜿門ｾ怜､ｱ謨・ ${err.message}`);
      ishikawaError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 遘貞ｾ・ｩ・..`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      fukuiEvents = await withFreshContext(ctx => fetchFukui(ctx));
    } catch (err) {
      console.error(`[遖丈ｺ評 蜿門ｾ怜､ｱ謨・ ${err.message}`);
      fukuiError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 遘貞ｾ・ｩ・..`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      yamanashiEvents = await withFreshContext(ctx => fetchYamanashi(ctx));
    } catch (err) {
      console.error(`[螻ｱ譴ｨ] 蜿門ｾ怜､ｱ謨・ ${err.message}`);
      yamanashiError = true;
    }

    // 髟ｷ驥弱・ iCal fetch・・laywright 荳崎ｦ・ｼ・    try {
      naganoEvents = await fetchNagano();
    } catch (err) {
      console.error(`[髟ｷ驥讃 蜿門ｾ怜､ｱ謨・ ${err.message}`);
      naganoError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 遘貞ｾ・ｩ・..`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      gifuEvents = await withFreshContext(ctx => fetchGifu(ctx));
    } catch (err) {
      console.error(`[蟯宣・] 蜿門ｾ怜､ｱ謨・ ${err.message}`);
      gifuError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 遘貞ｾ・ｩ・..`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      shizuokaEvents = await withFreshContext(ctx => fetchShizuoka(ctx));
    } catch (err) {
      console.error(`[髱吝ｲ｡] 蜿門ｾ怜､ｱ謨・ ${err.message}`);
      shizuokaError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 遘貞ｾ・ｩ・..`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      aichiEvents = await withFreshContext(ctx => fetchAichi(ctx));
    } catch (err) {
      console.error(`[諢帷衍] 蜿門ｾ怜､ｱ謨・ ${err.message}`);
      aichiError = true;
    }

    // 笏笏 霑醍柄蝨ｰ譛ｬ 笏笏
    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 遘貞ｾ・ｩ・..`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      mieEvents = await withFreshContext(ctx => fetchMie(ctx));
    } catch (err) {
      console.error(`[荳蛾㍾] 蜿門ｾ怜､ｱ謨・ ${err.message}`);
      mieError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 遘貞ｾ・ｩ・..`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      shigaEvents = await withFreshContext(ctx => fetchShiga(ctx));
    } catch (err) {
      console.error(`[貊玖ｳ] 蜿門ｾ怜､ｱ謨・ ${err.message}`);
      shigaError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 遘貞ｾ・ｩ・..`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      kyotoEvents = await withFreshContext(ctx => fetchKyoto(ctx));
    } catch (err) {
      console.error(`[莠ｬ驛ｽ] 蜿門ｾ怜､ｱ謨・ ${err.message}`);
      kyotoError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 遘貞ｾ・ｩ・..`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      osakaEvents = await withFreshContext(ctx => fetchOsaka(ctx));
    } catch (err) {
      console.error(`[螟ｧ髦ｪ] 蜿門ｾ怜､ｱ謨・ ${err.message}`);
      osakaError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 遘貞ｾ・ｩ・..`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      hyogoEvents = await withFreshContext(ctx => fetchHyogo(ctx));
    } catch (err) {
      console.error(`[蜈ｵ蠎ｫ] 蜿門ｾ怜､ｱ謨・ ${err.message}`);
      hyogoError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 遘貞ｾ・ｩ・..`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      naraEvents = await withFreshContext(ctx => fetchNara(ctx));
    } catch (err) {
      console.error(`[螂郁憶] 蜿門ｾ怜､ｱ謨・ ${err.message}`);
      naraError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 遘貞ｾ・ｩ・..`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      wakayamaEvents = await withFreshContext(ctx => fetchWakayama(ctx));
    } catch (err) {
      console.error(`[蜥梧ｭ悟ｱｱ] 蜿門ｾ怜､ｱ謨・ ${err.message}`);
      wakayamaError = true;
    }

    // 笏笏 蝗帛嵜蝨ｰ譛ｬ 笏笏
    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 遘貞ｾ・ｩ・..`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      ehimeEvents = await withFreshContext(ctx => fetchHtmlPref(ctx, '諢帛ｪ・, URLS.ehime, parseEhime));
    } catch (err) {
      console.error(`[諢帛ｪ嫋 蜿門ｾ怜､ｱ謨・ ${err.message}`);
      ehimeError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 遘貞ｾ・ｩ・..`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      kagawaEvents = await withFreshContext(ctx => fetchHtmlPref(ctx, '鬥吝ｷ・, URLS.kagawa, parseKagawa));
    } catch (err) {
      console.error(`[鬥吝ｷ拆 蜿門ｾ怜､ｱ謨・ ${err.message}`);
      kagawaError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 遘貞ｾ・ｩ・..`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      kochiEvents = await withFreshContext(ctx => fetchHtmlPref(ctx, '鬮倡衍', URLS.kochi, parseKochi));
    } catch (err) {
      console.error(`[鬮倡衍] 蜿門ｾ怜､ｱ謨・ ${err.message}`);
      kochiError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 遘貞ｾ・ｩ・..`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      tokushimaEvents = await withFreshContext(ctx => fetchHtmlPref(ctx, '蠕ｳ蟲ｶ', URLS.tokushima, parseTokushima));
    } catch (err) {
      console.error(`[蠕ｳ蟲ｶ] 蜿門ｾ怜､ｱ謨・ ${err.message}`);
      tokushimaError = true;
    }

    // 笏笏 荳ｭ蝗ｽ蝨ｰ譛ｬ 笏笏
    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 遘貞ｾ・ｩ・..`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      tottoriEvents = await withFreshContext(ctx => fetchHtmlPref(ctx, '魑･蜿・, URLS.tottori, parseTottori));
    } catch (err) {
      console.error(`[魑･蜿望 蜿門ｾ怜､ｱ謨・ ${err.message}`);
      tottoriError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 遘貞ｾ・ｩ・..`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      shimaneEvents = await withFreshContext(ctx => fetchHtmlPref(ctx, '蟲ｶ譬ｹ', URLS.shimane, parseShimane));
    } catch (err) {
      console.error(`[蟲ｶ譬ｹ] 蜿門ｾ怜､ｱ謨・ ${err.message}`);
      shimaneError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 遘貞ｾ・ｩ・..`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      okayamaEvents = await withFreshContext(ctx => fetchHtmlPref(ctx, '蟯｡螻ｱ', URLS.okayama, parseOkayama));
    } catch (err) {
      console.error(`[蟯｡螻ｱ] 蜿門ｾ怜､ｱ謨・ ${err.message}`);
      okayamaError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 遘貞ｾ・ｩ・..`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      hiroshimaEvents = await withFreshContext(ctx => fetchHtmlPref(ctx, '蠎・ｳｶ', URLS.hiroshima, parseHiroshima));
    } catch (err) {
      console.error(`[蠎・ｳｶ] 蜿門ｾ怜､ｱ謨・ ${err.message}`);
      hiroshimaError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 遘貞ｾ・ｩ・..`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      yamaguchiEvents = await withFreshContext(ctx => fetchHtmlPref(ctx, '螻ｱ蜿｣', URLS.yamaguchi, parseYamaguchi));
    } catch (err) {
      console.error(`[螻ｱ蜿｣] 蜿門ｾ怜､ｱ謨・ ${err.message}`);
      yamaguchiError = true;
    }

    // 笏笏 荵晏ｷ槭・豐也ｸ・慍譛ｬ 笏笏
    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 遘貞ｾ・ｩ・..`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      fukuokaEvents = await withFreshContext(ctx => fetchHtmlPref(ctx, '遖丞ｲ｡', URLS.fukuoka, parseFukuoka));
    } catch (err) {
      console.error(`[遖丞ｲ｡] 蜿門ｾ怜､ｱ謨・ ${err.message}`);
      fukuokaError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 遘貞ｾ・ｩ・..`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      sagaEvents = await withFreshContext(ctx => fetchHtmlPref(ctx, '菴占ｳ', URLS.saga, parseSaga));
    } catch (err) {
      console.error(`[菴占ｳ] 蜿門ｾ怜､ｱ謨・ ${err.message}`);
      sagaError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 遘貞ｾ・ｩ・..`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      nagasakiEvents = await withFreshContext(ctx => fetchHtmlPref(ctx, '髟ｷ蟠・, URLS.nagasaki, parseNagasaki));
    } catch (err) {
      console.error(`[髟ｷ蟠讃 蜿門ｾ怜､ｱ謨・ ${err.message}`);
      nagasakiError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 遘貞ｾ・ｩ・..`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      kumamotoEvents = await withFreshContext(ctx => fetchHtmlPref(ctx, '辭頑悽', URLS.kumamoto, parseKumamoto));
    } catch (err) {
      console.error(`[辭頑悽] 蜿門ｾ怜､ｱ謨・ ${err.message}`);
      kumamotoError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 遘貞ｾ・ｩ・..`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      oitaEvents = await withFreshContext(ctx => fetchHtmlPref(ctx, '螟ｧ蛻・, URLS.oita, parseOita));
    } catch (err) {
      console.error(`[螟ｧ蛻・ 蜿門ｾ怜､ｱ謨・ ${err.message}`);
      oitaError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 遘貞ｾ・ｩ・..`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      miyazakiEvents = await withFreshContext(ctx => fetchHtmlPref(ctx, '螳ｮ蟠・, URLS.miyazaki, parseMiyazaki));
    } catch (err) {
      console.error(`[螳ｮ蟠讃 蜿門ｾ怜､ｱ謨・ ${err.message}`);
      miyazakiError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 遘貞ｾ・ｩ・..`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      kagoshimaEvents = await withFreshContext(ctx => fetchHtmlPref(ctx, '鮖ｿ蜈仙ｳｶ', URLS.kagoshima, parseKagoshima));
    } catch (err) {
      console.error(`[鮖ｿ蜈仙ｳｶ] 蜿門ｾ怜､ｱ謨・ ${err.message}`);
      kagoshimaError = true;
    }

    console.log(`[wait] ${BETWEEN_PAGES_MS / 1000} 遘貞ｾ・ｩ・..`);
    await sleep(BETWEEN_PAGES_MS);

    try {
      okinawaEvents = await withFreshContext(ctx => fetchHtmlPref(ctx, '豐也ｸ・, URLS.okinawa, parseOkinawa));
    } catch (err) {
      console.error(`[豐也ｸЬ 蜿門ｾ怜､ｱ謨・ ${err.message}`);
      okinawaError = true;
    }
  } finally {
    await browser.close();
  }

  // 蜈ｨ蝨ｰ譛ｬ繧ｨ繝ｩ繝ｼ縺ｮ蝣ｴ蜷医・縺ｿ邨ゆｺ・  const allErrors = [
    sapporoError, asahikawaError, obihiroError, hakodateError,
    miyagiError, aomoriError, iwateError, yamagataError, fukushimaError, akitaError,
    kanagawaError, tokyoError, saitamaError, gunmaError, ibarakiError, chibaError, tochigiError,
    niigataError, toyamaError, ishikawaError, fukuiError, yamanashiError, naganoError,
    gifuError, shizuokaError, aichiError,
    mieError, shigaError, kyotoError, osakaError, hyogoError, naraError, wakayamaError,
    ehimeError, kagawaError, kochiError, tokushimaError,
    tottoriError, shimaneError, okayamaError, hiroshimaError, yamaguchiError,
    fukuokaError, sagaError, nagasakiError, kumamotoError, oitaError,
    miyazakiError, kagoshimaError, okinawaError,
  ];
  if (allErrors.every(Boolean)) {
    console.warn('[隴ｦ蜻馨 蜈ｨ蝨ｰ譛ｬ縺ｨ繧ゅ↓蜿門ｾ励お繝ｩ繝ｼ縺檎匱逕溘＠縺ｾ縺励◆縲ゅヵ繧｡繧､繝ｫ繧呈峩譁ｰ縺励∪縺帙ｓ縲・);
    process.exit(1);
  }

  // 繧ｨ繝ｩ繝ｼ縺ｫ縺ｪ縺｣縺溷慍譛ｬ縺ｯ譌｢蟄・events.json 縺ｮ繝・・繧ｿ繧貞ｼ輔″邯吶＄・育ｩｺ驟榊・縺ｧ荳頑嶌縺阪＠縺ｪ縺・ｼ・  let prev = {};
  try { prev = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8')); } catch { /* 繝輔ぃ繧､繝ｫ譛ｪ蟄伜惠縺ｯ辟｡隕・*/ }

  const fallback = (flag, label, events, key) => {
    if (!flag) return events;
    console.warn(`[${label}] 繧ｨ繝ｩ繝ｼ縺ｮ縺溘ａ蜑榊屓繝・・繧ｿ繧堤ｶｭ謖√＠縺ｾ縺兪);
    return prev[key] ?? [];
  };

  sapporoEvents   = fallback(sapporoError,   '譛ｭ蟷・,   sapporoEvents,   'sapporo');
  asahikawaEvents = fallback(asahikawaError, '譌ｭ蟾・,   asahikawaEvents, 'asahikawa');
  obihiroEvents   = fallback(obihiroError,   '蟶ｯ蠎・,   obihiroEvents,   'obihiro');
  hakodateEvents  = fallback(hakodateError,  '蜃ｽ鬢ｨ',   hakodateEvents,  'hakodate');
  miyagiEvents    = fallback(miyagiError,    '螳ｮ蝓・,   miyagiEvents,    'miyagi');
  aomoriEvents    = fallback(aomoriError,    '髱呈｣ｮ',   aomoriEvents,    'aomori');
  iwateEvents     = fallback(iwateError,     '蟯ｩ謇・,   iwateEvents,     'iwate');
  yamagataEvents  = fallback(yamagataError,  '螻ｱ蠖｢',   yamagataEvents,  'yamagata');
  fukushimaEvents = fallback(fukushimaError, '遖丞ｳｶ',   fukushimaEvents, 'fukushima');
  akitaEvents     = fallback(akitaError,     '遘狗伐',   akitaEvents,     'akita');
  kanagawaEvents  = fallback(kanagawaError,  '逾槫･亥ｷ・, kanagawaEvents,  'kanagawa');
  tokyoEvents     = fallback(tokyoError,     '譚ｱ莠ｬ',   tokyoEvents,     'tokyo');
  saitamaEvents   = fallback(saitamaError,   '蝓ｼ邇・,   saitamaEvents,   'saitama');
  gunmaEvents     = fallback(gunmaError,     '鄒､鬥ｬ',   gunmaEvents,     'gunma');
  ibarakiEvents   = fallback(ibarakiError,   '闌ｨ蝓・,   ibarakiEvents,   'ibaraki');
  chibaEvents     = fallback(chibaError,     '蜊・痩',   chibaEvents,     'chiba');
  tochigiEvents   = fallback(tochigiError,   '譬・惠',   tochigiEvents,   'tochigi');
  niigataEvents   = fallback(niigataError,   '譁ｰ貎・,   niigataEvents,   'niigata');
  toyamaEvents    = fallback(toyamaError,    '蟇悟ｱｱ',   toyamaEvents,    'toyama');
  ishikawaEvents  = fallback(ishikawaError,  '遏ｳ蟾・,   ishikawaEvents,  'ishikawa');
  fukuiEvents     = fallback(fukuiError,     '遖丈ｺ・,   fukuiEvents,     'fukui');
  yamanashiEvents = fallback(yamanashiError, '螻ｱ譴ｨ',   yamanashiEvents, 'yamanashi');
  naganoEvents    = fallback(naganoError,    '髟ｷ驥・,   naganoEvents,    'nagano');
  gifuEvents      = fallback(gifuError,      '蟯宣・',   gifuEvents,      'gifu');
  shizuokaEvents  = fallback(shizuokaError,  '髱吝ｲ｡',   shizuokaEvents,  'shizuoka');
  aichiEvents     = fallback(aichiError,     '諢帷衍',   aichiEvents,     'aichi');
  mieEvents       = fallback(mieError,       '荳蛾㍾',   mieEvents,       'mie');
  shigaEvents     = fallback(shigaError,     '貊玖ｳ',   shigaEvents,     'shiga');
  kyotoEvents     = fallback(kyotoError,     '莠ｬ驛ｽ',   kyotoEvents,     'kyoto');
  osakaEvents     = fallback(osakaError,     '螟ｧ髦ｪ',   osakaEvents,     'osaka');
  hyogoEvents     = fallback(hyogoError,     '蜈ｵ蠎ｫ',   hyogoEvents,     'hyogo');
  naraEvents      = fallback(naraError,      '螂郁憶',   naraEvents,      'nara');
  wakayamaEvents  = fallback(wakayamaError,  '蜥梧ｭ悟ｱｱ', wakayamaEvents,  'wakayama');
  ehimeEvents     = fallback(ehimeError,     '諢帛ｪ・,   ehimeEvents,     'ehime');
  kagawaEvents    = fallback(kagawaError,    '鬥吝ｷ・,   kagawaEvents,    'kagawa');
  kochiEvents     = fallback(kochiError,     '鬮倡衍',   kochiEvents,     'kochi');
  tokushimaEvents = fallback(tokushimaError, '蠕ｳ蟲ｶ',   tokushimaEvents, 'tokushima');
  tottoriEvents   = fallback(tottoriError,   '魑･蜿・,   tottoriEvents,   'tottori');
  shimaneEvents   = fallback(shimaneError,   '蟲ｶ譬ｹ',   shimaneEvents,   'shimane');
  okayamaEvents   = fallback(okayamaError,   '蟯｡螻ｱ',   okayamaEvents,   'okayama');
  hiroshimaEvents = fallback(hiroshimaError, '蠎・ｳｶ',   hiroshimaEvents, 'hiroshima');
  yamaguchiEvents = fallback(yamaguchiError, '螻ｱ蜿｣',   yamaguchiEvents, 'yamaguchi');
  fukuokaEvents   = fallback(fukuokaError,   '遖丞ｲ｡',   fukuokaEvents,   'fukuoka');
  sagaEvents      = fallback(sagaError,      '菴占ｳ',   sagaEvents,      'saga');
  nagasakiEvents  = fallback(nagasakiError,  '髟ｷ蟠・,   nagasakiEvents,  'nagasaki');
  kumamotoEvents  = fallback(kumamotoError,  '辭頑悽',   kumamotoEvents,  'kumamoto');
  oitaEvents      = fallback(oitaError,      '螟ｧ蛻・,   oitaEvents,      'oita');
  miyazakiEvents  = fallback(miyazakiError,  '螳ｮ蟠・,   miyazakiEvents,  'miyazaki');
  kagoshimaEvents = fallback(kagoshimaError, '鮖ｿ蜈仙ｳｶ', kagoshimaEvents, 'kagoshima');
  okinawaEvents   = fallback(okinawaError,   '豐也ｸ・,   okinawaEvents,   'okinawa');

  // 笏笏 PDF OCR・・v.url 縺・.pdf 縺ｮ繧､繝吶Φ繝医ｒ蟇ｾ雎｡・・笏笏
  iwateEvents  = await enrichWithPdfOcr(iwateEvents);
  aomoriEvents = await enrichWithPdfOcr(aomoriEvents);

  // 笏笏 逕ｻ蜒・OCR・亥・蝨ｰ譛ｬ蟇ｾ雎｡・俄楳笏
  // imageUrl 縺ｾ縺溘・ url 縺檎判蜒上ヵ繧｡繧､繝ｫ縺ｮ繧､繝吶Φ繝医・縺ｿ螳溯｡後ゅ◎繧御ｻ･螟悶・繝代せ繧ｹ繝ｫ繝ｼ縺ｧ辟｡螳ｳ縲・  sapporoEvents   = await enrichWithOcr(sapporoEvents);
  asahikawaEvents = await enrichWithOcr(asahikawaEvents);
  obihiroEvents   = await enrichWithOcr(obihiroEvents);
  hakodateEvents  = await enrichWithOcr(hakodateEvents);
  miyagiEvents    = await enrichWithOcr(miyagiEvents);
  yamagataEvents  = await enrichWithOcr(yamagataEvents);
  fukushimaEvents = await enrichWithOcr(fukushimaEvents);
  akitaEvents     = await enrichWithOcr(akitaEvents);
  kanagawaEvents  = await enrichWithOcr(kanagawaEvents);
  tokyoEvents     = await enrichWithOcr(tokyoEvents);
  saitamaEvents   = await enrichWithOcr(saitamaEvents);
  gunmaEvents     = await enrichWithOcr(gunmaEvents);
  tochigiEvents   = await enrichWithOcr(tochigiEvents);
  ibarakiEvents   = await enrichWithOcr(ibarakiEvents);
  chibaEvents     = await enrichWithOcr(chibaEvents);
  niigataEvents   = await enrichWithOcr(niigataEvents);
  toyamaEvents    = await enrichWithOcr(toyamaEvents);
  ishikawaEvents  = await enrichWithOcr(ishikawaEvents);
  fukuiEvents     = await enrichWithOcr(fukuiEvents);
  yamanashiEvents = await enrichWithOcr(yamanashiEvents);
  naganoEvents    = await enrichWithOcr(naganoEvents);
  gifuEvents      = await enrichWithOcr(gifuEvents);
  shizuokaEvents  = await enrichWithOcr(shizuokaEvents);
  aichiEvents     = await enrichWithOcr(aichiEvents);
  mieEvents       = await enrichWithOcr(mieEvents);
  shigaEvents     = await enrichWithOcr(shigaEvents);
  kyotoEvents     = await enrichWithOcr(kyotoEvents);
  osakaEvents     = await enrichWithOcr(osakaEvents);
  hyogoEvents     = await enrichWithOcr(hyogoEvents);
  naraEvents      = await enrichWithOcr(naraEvents);
  wakayamaEvents  = await enrichWithOcr(wakayamaEvents);
  ehimeEvents     = await enrichWithOcr(ehimeEvents);
  kagawaEvents    = await enrichWithOcr(kagawaEvents);
  kochiEvents     = await enrichWithOcr(kochiEvents);
  tokushimaEvents = await enrichWithOcr(tokushimaEvents);
  tottoriEvents   = await enrichWithOcr(tottoriEvents);
  shimaneEvents   = await enrichWithOcr(shimaneEvents);
  okayamaEvents   = await enrichWithOcr(okayamaEvents);
  hiroshimaEvents = await enrichWithOcr(hiroshimaEvents);
  yamaguchiEvents = await enrichWithOcr(yamaguchiEvents);
  fukuokaEvents   = await enrichWithOcr(fukuokaEvents);
  sagaEvents      = await enrichWithOcr(sagaEvents);
  nagasakiEvents  = await enrichWithOcr(nagasakiEvents);
  kumamotoEvents  = await enrichWithOcr(kumamotoEvents);
  oitaEvents      = await enrichWithOcr(oitaEvents);
  miyazakiEvents  = await enrichWithOcr(miyazakiEvents);
  kagoshimaEvents = await enrichWithOcr(kagoshimaEvents);
  okinawaEvents   = await enrichWithOcr(okinawaEvents);

  // imageUrl 縺ｯ譛邨ょ・蜉帙↓蜷ｫ繧√↑縺・ｼ亥・驛ｨ逕ｨ繝輔ぅ繝ｼ繝ｫ繝会ｼ・  const strip = ev => { const { imageUrl: _, ...rest } = ev; return rest; };

  const output = {
    sapporo:   sapporoEvents.map(strip),
    asahikawa: asahikawaEvents.map(strip),
    obihiro:   obihiroEvents.map(strip),
    hakodate:  hakodateEvents.map(strip),
    miyagi:    miyagiEvents.map(strip),
    aomori:    aomoriEvents.map(strip),
    iwate:     iwateEvents.map(strip),
    yamagata:  yamagataEvents.map(strip),
    fukushima: fukushimaEvents.map(strip),
    akita:     akitaEvents.map(strip),
    kanagawa:  kanagawaEvents.map(strip),
    tokyo:     tokyoEvents.map(strip),
    saitama:   saitamaEvents.map(strip),
    gunma:     gunmaEvents.map(strip),
    tochigi:   tochigiEvents.map(strip),
    ibaraki:   ibarakiEvents.map(strip),
    chiba:     chibaEvents.map(strip),
    niigata:   niigataEvents.map(strip),
    toyama:    toyamaEvents.map(strip),
    ishikawa:  ishikawaEvents.map(strip),
    fukui:     fukuiEvents.map(strip),
    yamanashi: yamanashiEvents.map(strip),
    nagano:    naganoEvents.map(strip),
    gifu:      gifuEvents.map(strip),
    shizuoka:  shizuokaEvents.map(strip),
    aichi:     aichiEvents.map(strip),
    mie:       mieEvents.map(strip),
    shiga:     shigaEvents.map(strip),
    kyoto:     kyotoEvents.map(strip),
    osaka:     osakaEvents.map(strip),
    hyogo:     hyogoEvents.map(strip),
    nara:      naraEvents.map(strip),
    wakayama:  wakayamaEvents.map(strip),
    ehime:     ehimeEvents.map(strip),
    kagawa:    kagawaEvents.map(strip),
    kochi:     kochiEvents.map(strip),
    tokushima: tokushimaEvents.map(strip),
    tottori:   tottoriEvents.map(strip),
    shimane:   shimaneEvents.map(strip),
    okayama:   okayamaEvents.map(strip),
    hiroshima: hiroshimaEvents.map(strip),
    yamaguchi: yamaguchiEvents.map(strip),
    fukuoka:   fukuokaEvents.map(strip),
    saga:      sagaEvents.map(strip),
    nagasaki:  nagasakiEvents.map(strip),
    kumamoto:  kumamotoEvents.map(strip),
    oita:      oitaEvents.map(strip),
    miyazaki:  miyazakiEvents.map(strip),
    kagoshima: kagoshimaEvents.map(strip),
    okinawa:   okinawaEvents.map(strip),
    updatedAt: nowJST(),
  };
  writeOutput(output);
  // 譁ｰ隕上う繝吶Φ繝医ｒ讀懷・縺励※繝励ャ繧ｷ繝･騾夂衍・磯撼蜷梧悄繝ｻ螟ｱ謨励＠縺ｦ繧らｶ夊｡鯉ｼ・  await notifyNewEvents(prev, output).catch(err =>
    console.warn('[Push] notifyNewEvents 繧ｨ繝ｩ繝ｼ:', err.message)
  );
}

/** public/data/events.json 縺ｫ譖ｸ縺榊・縺・*/
function writeOutput(data) {
  // 繝・ぅ繝ｬ繧ｯ繝医Μ縺檎┌縺代ｌ縺ｰ菴懈・
  const dir = path.dirname(OUTPUT_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  // 莉頑律・・ST・峨ｈ繧雁燕縺ｮ譌･莉倥・繧､繝吶Φ繝医ｒ蜑企勁
  const jstNow = new Date(Date.now() + 9 * 3600 * 1000);
  const today = jstNow.toISOString().slice(0, 10); // "YYYY-MM-DD"
  let removedCount = 0;
  for (const key of Object.keys(data)) {
    if (!Array.isArray(data[key])) continue;
    const before = data[key].length;
    data[key] = data[key].filter(ev => {
      if (!ev.date) return false;
      if ((ev.endDate || ev.date) < today) return false;
      // 繧ｿ繧､繝医Ν縺後後♀遏･繧峨○縲阪・縺ｿ遲峨∝・螳ｹ縺ｮ縺ｪ縺・ざ繝溘ョ繝ｼ繧ｿ繧帝勁螟・      if (!ev.title || /^縺顔衍繧峨○$/.test(ev.title.trim())) return false;
      return true;
    });
    removedCount += before - data[key].length;
    // 譖懈律繧偵き繝ｬ繝ｳ繝繝ｼ繝・・繧ｿ縺ｧ荳頑嶌縺・    data[key].forEach(ev => {
      if (ev.date)    ev.weekday    = calcWeekday(ev.date);
      if (ev.endDate) ev.endWeekday = calcWeekday(ev.endDate);
    });
  }
  if (removedCount > 0) console.log(`[繝輔ぅ繝ｫ繧ｿ] 驕主悉繧､繝吶Φ繝・${removedCount} 莉ｶ繧貞炎髯､`);

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(data, null, 2), 'utf8');
  console.log(`[蜃ｺ蜉嫋 ${OUTPUT_PATH}`);
  console.log(`  譛ｭ蟷・   ${(data.sapporo   ?? []).length} 莉ｶ`);
  console.log(`  譌ｭ蟾・   ${(data.asahikawa ?? []).length} 莉ｶ`);
  console.log(`  蟶ｯ蠎・   ${(data.obihiro   ?? []).length} 莉ｶ`);
  console.log(`  蜃ｽ鬢ｨ:   ${(data.hakodate  ?? []).length} 莉ｶ`);
  console.log(`  螳ｮ蝓・   ${(data.miyagi    ?? []).length} 莉ｶ`);
  console.log(`  髱呈｣ｮ:   ${(data.aomori   ?? []).length} 莉ｶ`);
  console.log(`  蟯ｩ謇・   ${(data.iwate    ?? []).length} 莉ｶ`);
  console.log(`  螻ｱ蠖｢:   ${(data.yamagata  ?? []).length} 莉ｶ`);
  console.log(`  遖丞ｳｶ:   ${(data.fukushima ?? []).length} 莉ｶ`);
  console.log(`  遘狗伐:   ${(data.akita     ?? []).length} 莉ｶ`);
  console.log(`  逾槫･亥ｷ・ ${(data.kanagawa  ?? []).length} 莉ｶ`);
  console.log(`  譚ｱ莠ｬ:   ${(data.tokyo     ?? []).length} 莉ｶ`);
  console.log(`  蝓ｼ邇・   ${(data.saitama   ?? []).length} 莉ｶ`);
  console.log(`  鄒､鬥ｬ:   ${(data.gunma     ?? []).length} 莉ｶ`);
  console.log(`  譬・惠:   ${(data.tochigi   ?? []).length} 莉ｶ`);
  console.log(`  闌ｨ蝓・   ${(data.ibaraki   ?? []).length} 莉ｶ`);
  console.log(`  蜊・痩:   ${(data.chiba     ?? []).length} 莉ｶ`);
  console.log(`  譁ｰ貎・   ${(data.niigata   ?? []).length} 莉ｶ`);
  console.log(`  蟇悟ｱｱ:   ${(data.toyama    ?? []).length} 莉ｶ`);
  console.log(`  遏ｳ蟾・   ${(data.ishikawa  ?? []).length} 莉ｶ`);
  console.log(`  遖丈ｺ・   ${(data.fukui     ?? []).length} 莉ｶ`);
  console.log(`  螻ｱ譴ｨ:   ${(data.yamanashi ?? []).length} 莉ｶ`);
  console.log(`  髟ｷ驥・   ${(data.nagano    ?? []).length} 莉ｶ`);
  console.log(`  蟯宣・:   ${(data.gifu      ?? []).length} 莉ｶ`);
  console.log(`  髱吝ｲ｡:   ${(data.shizuoka  ?? []).length} 莉ｶ`);
  console.log(`  諢帷衍:   ${(data.aichi     ?? []).length} 莉ｶ`);
  console.log(`  荳蛾㍾:   ${(data.mie       ?? []).length} 莉ｶ`);
  console.log(`  貊玖ｳ:   ${(data.shiga     ?? []).length} 莉ｶ`);
  console.log(`  莠ｬ驛ｽ:   ${(data.kyoto     ?? []).length} 莉ｶ`);
  console.log(`  螟ｧ髦ｪ:   ${(data.osaka     ?? []).length} 莉ｶ`);
  console.log(`  蜈ｵ蠎ｫ:   ${(data.hyogo     ?? []).length} 莉ｶ`);
  console.log(`  螂郁憶:   ${(data.nara      ?? []).length} 莉ｶ`);
  console.log(`  蜥梧ｭ悟ｱｱ: ${(data.wakayama  ?? []).length} 莉ｶ`);
  console.log(`  諢帛ｪ・   ${(data.ehime     ?? []).length} 莉ｶ`);
  console.log(`  鬥吝ｷ・   ${(data.kagawa    ?? []).length} 莉ｶ`);
  console.log(`  鬮倡衍:   ${(data.kochi     ?? []).length} 莉ｶ`);
  console.log(`  蠕ｳ蟲ｶ:   ${(data.tokushima ?? []).length} 莉ｶ`);
  console.log(`  魑･蜿・   ${(data.tottori   ?? []).length} 莉ｶ`);
  console.log(`  蟲ｶ譬ｹ:   ${(data.shimane   ?? []).length} 莉ｶ`);
  console.log(`  蟯｡螻ｱ:   ${(data.okayama   ?? []).length} 莉ｶ`);
  console.log(`  蠎・ｳｶ:   ${(data.hiroshima ?? []).length} 莉ｶ`);
  console.log(`  螻ｱ蜿｣:   ${(data.yamaguchi ?? []).length} 莉ｶ`);
  console.log(`  遖丞ｲ｡:   ${(data.fukuoka   ?? []).length} 莉ｶ`);
  console.log(`  菴占ｳ:   ${(data.saga      ?? []).length} 莉ｶ`);
  console.log(`  髟ｷ蟠・   ${(data.nagasaki  ?? []).length} 莉ｶ`);
  console.log(`  辭頑悽:   ${(data.kumamoto  ?? []).length} 莉ｶ`);
  console.log(`  螟ｧ蛻・   ${(data.oita      ?? []).length} 莉ｶ`);
  console.log(`  螳ｮ蟠・   ${(data.miyazaki  ?? []).length} 莉ｶ`);
  console.log(`  鮖ｿ蜈仙ｳｶ: ${(data.kagoshima ?? []).length} 莉ｶ`);
  console.log(`  豐也ｸ・   ${(data.okinawa   ?? []).length} 莉ｶ`);
  console.log(`  譖ｴ譁ｰ譎ょ綾: ${data.updatedAt}`);

  // AI繧ｯ繝ｭ繝ｼ繝ｩ繝ｼ蜷代￠髱咏噪 HTML 繧貞・逕滓・
  try {
    const { execSync } = require('child_process');
    execSync('node ../scripts/generate-events-html.mjs', { cwd: __dirname, stdio: 'inherit' });
  } catch (e) {
    console.warn('[隴ｦ蜻馨 events.html 逕滓・縺ｫ螟ｱ謨励＠縺ｾ縺励◆:', e.message);
  }
}

// 笏笏 譁ｰ隕上う繝吶Φ繝域､懷・ 竊・Web Push 騾夂衍 笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
/**
 * 蜑榊屓繝・・繧ｿ縺ｨ譁ｰ繝・・繧ｿ繧呈ｯ碑ｼ・＠縲∵眠縺励￥霑ｽ蜉縺輔ｌ縺溘う繝吶Φ繝医′縺ゅｌ縺ｰ
 * /api/notify 縺ｫ POST 縺励※繝励ャ繧ｷ繝･騾夂衍繧帝∽ｿ｡縺吶ｋ縲・ *
 * 蠢・ｦ√↑迺ｰ蠅・､画焚:
 *   SITE_URL       窶・繝・・繝ｭ繧､蜈・URL (萓・ https://jsdf-events.vercel.app)
 *   NOTIFY_SECRET  窶・API 隱崎ｨｼ繧ｷ繝ｼ繧ｯ繝ｬ繝・ヨ
 *
 * 縺・★繧後°縺梧悴險ｭ螳壹・蝣ｴ蜷医・菴輔ｂ縺励↑縺・ｼ医Ο繝ｼ繧ｫ繝ｫ髢狗匱譎ゅ↑縺ｩ・峨・ */
async function notifyNewEvents(prevData, newData) {
  const siteUrl     = process.env.SITE_URL;
  const notifSecret = process.env.NOTIFY_SECRET;
  if (!siteUrl || !notifSecret) {
    console.log('[Push] SITE_URL / NOTIFY_SECRET 譛ｪ險ｭ螳壹・縺溘ａ騾夂衍繧偵せ繧ｭ繝・・縺励∪縺・);
    return;
  }

  // 蜑榊屓縺ｮ蜈ｨ繧､繝吶Φ繝・ID 繧ｻ繝・ヨ繧呈ｧ狗ｯ・  const prevIds = new Set();
  for (const key of Object.keys(prevData)) {
    if (!Array.isArray(prevData[key])) continue;
    for (const ev of prevData[key]) {
      if (ev.id) prevIds.add(ev.id);
    }
  }

  // 譁ｰ隕上う繝吶Φ繝医ｒ蜿朱寔
  const newEvents = [];
  for (const key of Object.keys(newData)) {
    if (!Array.isArray(newData[key])) continue;
    for (const ev of newData[key]) {
      if (ev.id && !prevIds.has(ev.id)) newEvents.push(ev);
    }
  }

  if (newEvents.length === 0) {
    console.log('[Push] 譁ｰ隕上う繝吶Φ繝医↑縺励る夂衍繧偵せ繧ｭ繝・・縺励∪縺・);
    return;
  }

  console.log(`[Push] 譁ｰ隕上う繝吶Φ繝・${newEvents.length} 莉ｶ繧呈､懷・縲る夂衍繧帝∽ｿ｡縺励∪縺兪);

  // 莉｣陦ｨ繧､繝吶Φ繝医〒騾夂衍繝・く繧ｹ繝医ｒ菴懈・・域怙螟ｧ3莉ｶ・・  const sample  = newEvents.slice(0, 3);
  const title   = `閾ｪ陦幃嚏繧､繝吶Φ繝域ュ蝣ｱ +${newEvents.length}莉ｶ`;
  const body    = sample.map(e => `繝ｻ${e.title} (${e.date})`).join('\n')
                + (newEvents.length > 3 ? `\n莉・${newEvents.length - 3} 莉ｶ窶ｦ` : '');
  const url     = '/';

  const payload = JSON.stringify({ title, body, url });
  const apiUrl  = new URL('/api/notify', siteUrl);

  const https = require('https');
  const http  = require('http');
  const lib   = apiUrl.protocol === 'https:' ? https : http;

  await new Promise((resolve) => {
    const req = lib.request(
      {
        hostname: apiUrl.hostname,
        port:     apiUrl.port || (apiUrl.protocol === 'https:' ? 443 : 80),
        path:     apiUrl.pathname,
        method:   'POST',
        headers: {
          'Content-Type':     'application/json',
          'Content-Length':   Buffer.byteLength(payload),
          'x-notify-secret':  notifSecret,
        },
      },
      res => {
        let body = '';
        res.on('data', c => { body += c; });
        res.on('end', () => {
          console.log(`[Push] API 蠢懃ｭ・${res.statusCode}: ${body}`);
          resolve();
        });
      }
    );
    req.on('error', err => {
      console.warn('[Push] API 蜻ｼ縺ｳ蜃ｺ縺励↓螟ｱ謨励＠縺ｾ縺励◆:', err.message);
      resolve();
    });
    req.write(payload);
    req.end();
  });
}

// 笏笏 繧ｨ繝ｳ繝医Μ繝ｼ繝昴う繝ｳ繝・笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏笏
main().catch(err => {
  console.error('[閾ｴ蜻ｽ逧・お繝ｩ繝ｼ]', err);
  process.exit(1);
});

