'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const { parseNagano } = require('../scraper/parsers/nagano');

test('長野iCal: 同一VEVENTが重複しても同じIDを二重出力しない', () => {
  const ics = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'DTSTART;VALUE=DATE:20271025',
    'SUMMARY:県統合防災訓練',
    'LOCATION:大町市',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'DTSTART;VALUE=DATE:20271025',
    'SUMMARY:県統合防災訓練',
    'LOCATION:大町市',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  const events = parseNagano(ics);
  assert.equal(events.length, 1);
  assert.equal(new Set(events.map(e => e.id)).size, 1);
  assert.equal(events[0].title, '県統合防災訓練');
  assert.equal(events[0].place, '大町市');
});
