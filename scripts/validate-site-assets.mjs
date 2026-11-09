import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const siteRoot = resolve(fileURLToPath(new URL("../", import.meta.url)));
const rootPage = resolve(siteRoot, "index.html");
const rootPages = (await readdir(siteRoot, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && entry.name.endsWith(".html"))
  .map((entry) => entry.name)
  .sort();
const failures = [];
const checked = new Set();
const cssQueue = new Set();
const moduleQueue = new Set();
const mediaQueue = new Set();

const fileReference = (value, baseFile, source) => {
  if (!value || value.includes("${") || value.startsWith("#") || value.startsWith("//")) return null;
  try {
    const url = new URL(value, pathToFileURL(baseFile));
    if (url.protocol !== "file:") return null;
    const path = resolve(fileURLToPath(url));
    if (path !== siteRoot && !path.startsWith(`${siteRoot}${sep}`)) {
      failures.push(`Non-portable local path ${value} referenced by ${source}`);
      return null;
    }
    return { path, key: path.toLowerCase() };
  } catch {
    return null;
  }
};

const checkFile = async (value, baseFile, source) => {
  const ref = fileReference(value, baseFile, source);
  if (!ref || checked.has(ref.key)) return ref;
  checked.add(ref.key);
  try {
    await stat(ref.path);
  } catch {
    failures.push(`Missing ${relative(siteRoot, ref.path)} referenced by ${source}`);
  }
  return ref;
};

const collectMediaPaths = async (directory) => {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      await collectMediaPaths(path);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    try {
      const json = JSON.parse(await readFile(path, "utf8"));
      const visit = (value, key = "") => {
        if (typeof value === "string" && /(?:image|photo|video|thumbnail|poster|logo|media|src|url)$/i.test(key) && /\.(?:png|jpe?g|webp|gif|svg|mp4|m4v|mov|webm|mp3|wav)(?:[?#].*)?$/i.test(value)) {
          mediaQueue.add(`${value}\n${path}`);
        } else if (Array.isArray(value)) value.forEach((item) => visit(item, key));
        else if (value && typeof value === "object") Object.entries(value).forEach(([childKey, child]) => visit(child, childKey));
      };
      visit(json);
    } catch (error) {
      failures.push(`Invalid JSON ${relative(siteRoot, path)}: ${error.message}`);
    }
  }
};

for (const page of rootPages) {
  const pagePath = resolve(siteRoot, page);
  const html = await readFile(pagePath, "utf8");
  for (const match of html.matchAll(/\b(?:href|src|poster|action)\s*=\s*(["'])(.*?)\1/gs)) {
    const value = match[2].trim();
    const ref = await checkFile(value, pagePath, page);
    if (!ref) continue;
    if (ref.path.endsWith(".css")) cssQueue.add(ref.path);
    if (ref.path.endsWith(".js") || ref.path.endsWith(".mjs")) moduleQueue.add(ref.path);
  }
}

while (cssQueue.size) {
  const path = cssQueue.values().next().value;
  cssQueue.delete(path);
  const css = await readFile(path, "utf8");
  for (const match of css.matchAll(/url\(\s*(["']?)(.*?)\1\s*\)/g)) {
    await checkFile(match[2].trim(), path, relative(siteRoot, path));
  }
}

const modulePattern = /\b(?:import|export)\s+[^;]*?\bfrom\s*["']([^"']+)["']|\bimport\s*["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;
const assetStringPattern = /["'`]((?:\.\/|\.\.\/|\/)(?:data|Logos|media)\/[^"'`\s]+\.(?:json|png|jpe?g|webp|gif|svg|mp4|m4v|mov|webm|mp3|wav)(?:\?[^"'`]*)?)["'`]/g;
while (moduleQueue.size) {
  const path = moduleQueue.values().next().value;
  moduleQueue.delete(path);
  if (checked.has(`module:${path}`)) continue;
  checked.add(`module:${path}`);
  const source = await readFile(path, "utf8");
  for (const match of source.matchAll(modulePattern)) {
    const specifier = match[1] || match[2] || match[3];
    const ref = await checkFile(specifier, path, relative(siteRoot, path));
    if (ref && (ref.path.endsWith(".js") || ref.path.endsWith(".mjs"))) moduleQueue.add(ref.path);
    if (ref?.path.endsWith(".css")) cssQueue.add(ref.path);
  }
  for (const match of source.matchAll(assetStringPattern)) {
    await checkFile(match[1], rootPage, relative(siteRoot, path));
  }
}

await collectMediaPaths(resolve(siteRoot, "data"));
for (const entry of mediaQueue) {
  const [value, source] = entry.split("\n");
  await checkFile(value, rootPage, relative(siteRoot, source));
}

const serviceWorker = await readFile(resolve(siteRoot, "service-worker.js"), "utf8");
const appShell = serviceWorker.match(/const APP_SHELL = \[([\s\S]*?)\];/)?.[1] || "";
for (const match of appShell.matchAll(/["'](\.\/[^"']+)["']/g)) {
  await checkFile(match[1], rootPage, "service-worker app shell");
}

assert.deepEqual(failures, [], failures.slice(0, 50).join("\n"));
console.log(`Local asset checks passed: ${rootPages.length} root pages, ${checked.size} file references, ${mediaQueue.size} media references, and service-worker app shell.`);
