'use strict';
const { toHalfWidth } = require('../parsers/utils');
function createYearContext($) {
  const context = new WeakMap();
  let current = { strict: true };
  $('*').each((_i, el) => {
    if (/^h[1-6]$|^caption$/i.test(el.tagName || el.name || '')) {
      const text = toHalfWidth($(el).text());
      const western = text.match(/(20\d{2})\s*年(度)?/);
      const era = text.match(/令和\s*(元|\d{1,2})\s*年(度)?/);
      if (western) current = { strict: true, year: Number(western[1]), fiscal: !!western[2] };
      else if (era) current = { strict: true, year: 2018 + (era[1] === '元' ? 1 : Number(era[1])), fiscal: !!era[2] };
    }
    context.set(el, current);
  });
  return el => context.get(el) || { strict: true };
}
function isActivityReport(text) {
  return /ました|活動報告|実施報告|参加報告/.test(text || '');
}
module.exports = { createYearContext, isActivityReport };
