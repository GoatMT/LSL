import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const pages = (await readdir(root)).filter((file) => file.endsWith(".html"));
const theme = await readFile(resolve(root, "css/brand-colors.css"), "utf8");
const worker = await readFile(resolve(root, "service-worker.js"), "utf8");
const main = await readFile(resolve(root, "js/main.js"), "utf8");
const standings = await readFile(resolve(root, "components/standingsTable.js"), "utf8");
let themedPages = 0;
let imstPages = 0;

for (const page of pages) {
  const html = await readFile(resolve(root, page), "utf8");
  const isImst = /class="[^"]*imt-blue-page/.test(html);
  const hasTheme = html.includes("./css/brand-colors.css?v=20261122-palette1");
  const hasGreenChrome = html.includes('name="theme-color" content="#17251c"');

  if (isImst) {
    imstPages += 1;
    assert.equal(hasTheme, false, `${page} must keep its own IMST palette`);
    assert.equal(hasGreenChrome, false, `${page} must keep its own IMST browser chrome color`);
  } else {
    themedPages += 1;
    assert.equal(hasTheme, true, `${page} is missing the shared color system`);
    assert.equal(hasGreenChrome, true, `${page} browser chrome should follow the shared green page color`);
  }
}

assert.ok(themedPages > 0, "Expected non-IMST pages to use the shared color system");
assert.equal(imstPages, 1, "Expected the single standalone IMST page to remain excluded");
assert.match(theme, /body:not\(\.imt-blue-page\)\s*\{/);
assert.match(theme, /--page:\s*#[0-9a-f]{6};/i);
assert.match(theme, /--brand-green:\s*#[0-9a-f]{6};/i);
assert.match(theme, /--gold:\s*#[0-9a-f]{6};/i);
assert.match(theme, /\.site-header/);
assert.match(theme, /\.nav-link\.active/);
assert.match(theme, /\.button\.secondary/);
assert.match(theme, /\.standings-table tbody tr:is\(\.president-trophy, \.bye, \.leeward-highlight\)/);
assert.match(standings, /row\.rank === 1 \? "president-trophy"/);
assert.match(worker, /lsl-cache-v153/);
assert.match(worker, /\.\/css\/brand-colors\.css\?v=20261122-palette1/);
assert.match(worker, /theme-color" content="#17251c"/);
assert.match(worker, /background: #17251c/);
assert.match(main, /service-worker\.js\?v=20261122-palette1/);

console.log(`Brand palette checks passed: ${themedPages} pages themed, ${imstPages} IMST page excluded, shared tokens and cache refresh verified.`);
