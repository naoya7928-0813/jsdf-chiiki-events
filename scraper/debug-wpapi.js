#!/usr/bin/env node
'use strict';
/**
 * WordPress REST API で近畿地本の投稿を取得できるか確認
 */

const PREFS = [
  { name: '三重',   base: 'https://www.mod.go.jp/pco/mie' },
  { name: '滋賀',   base: 'https://www.mod.go.jp/pco/shiga' },
  { name: '奈良',   base: 'https://www.mod.go.jp/pco/nara' },
  { name: '和歌山', base: 'https://www.mod.go.jp/pco/wakayama' },
];

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
  'Referer': 'https://www.mod.go.jp/',
};

async function tryApi(url, label) {
  try {
    const res = await fetch(url, { headers: HEADERS });
    console.log(`  ${label}: HTTP ${res.status}`);
    if (res.ok) {
      const text = await res.text();
      console.log(`  response: ${text.substring(0, 300)}`);
    }
  } catch (e) {
    console.log(`  ${label}: error - ${e.message}`);
  }
}

async function main() {
  for (const { name, base } of PREFS) {
    console.log(`\n[${name}] ${base}`);
    // REST API v2 posts
    await tryApi(`${base}/wp-json/wp/v2/posts?per_page=5&_fields=id,link,title,featured_media,categories`, `wp-json/posts`);
    await new Promise(r => setTimeout(r, 500));
    // REST API v2 media (for featured images)
    await tryApi(`${base}/wp-json/wp/v2/media?per_page=5&_fields=id,source_url,alt_text`, `wp-json/media`);
    await new Promise(r => setTimeout(r, 500));
  }
}

main().catch(console.error);
