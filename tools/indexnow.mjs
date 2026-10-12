// Tell Bing, Yandex and other IndexNow engines that sitemap URLs changed.
// Run after a deploy that adds or edits public pages: node tools/indexnow.mjs
import { readFileSync } from 'node:fs';

const HOST = 'www.clutch.best';
const KEY = '516aaf80449f9285d41c855b1f9ccadf'; // served at /<KEY>.txt
const urls = [...readFileSync(new URL('../sitemap.xml', import.meta.url), 'utf8')
  .matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);

const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: HOST, key: KEY, keyLocation: `https://${HOST}/${KEY}.txt`, urlList: urls }),
});
console.log(`IndexNow: ${res.status} for ${urls.length} URLs`);
