const dns = require("dns");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");

dns.setDefaultResultOrder("ipv4first");

const execFileAsync = promisify(execFile);

const IMAGE_URL = "https://ss.blueforge.org/bing?v=2.0.0";

function buildImageUrl(width, height, random) {
  const url = `${IMAGE_URL}&w=${width}&h=${height}`;
  return random ? `${url}&random` : url;
}

function splitCopyright(raw) {
  if (!raw) return { copyright: null, copyrightUrl: null };
  const text = String(raw);
  if (!text.includes("||")) return { copyright: text.trim() || null, copyrightUrl: null };
  const [left, right] = text.split("||");
  return {
    copyright: left.trim() || null,
    copyrightUrl: right.trim() || null,
  };
}

function metaFromTags(tags) {
  const { copyright, copyrightUrl } = splitCopyright(tags && tags.Copyright);
  return {
    word: tags && tags.Artist ? String(tags.Artist) : null,
    dictionaryUrl: tags && tags.ImageDescription ? String(tags.ImageDescription) : null,
    audioUrl: tags && tags.DocumentName ? String(tags.DocumentName) : null,
    copyright,
    copyrightUrl,
    imageId: tags && tags.Software ? String(tags.Software) : null,
  };
}

async function fetchWordMeta(random) {
  const response = await fetch(buildImageUrl(64, 36, random), {
    headers: PAGE_HEADERS,
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok || !response.body) {
    throw new Error(`单词下载失败（HTTP ${response.status || "无响应"}）`);
  }
  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  const exifr = require("exifr");
  try {
    while (received < 256 * 1024) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(Buffer.from(value));
      received += value.byteLength;
      try {
        const tags = await exifr.parse(Buffer.concat(chunks));
        if (tags && (tags.Artist || tags.Software)) return metaFromTags(tags);
      } catch {
        // EXIF 还没传完
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  const tags = await exifr.parse(Buffer.concat(chunks)).catch(() => null);
  const meta = metaFromTags(tags);
  if (!meta.word) throw new Error("没有拿到单词");
  return meta;
}

async function setMacWallpaper(imagePath, dir) {
  const shown = path.join(dir, `wallpaper_show_${Date.now()}.jpg`);
  await fs.promises.copyFile(imagePath, shown);
  const script = `tell application "System Events" to set picture of every desktop to POSIX file ${JSON.stringify(shown)}`;
  try {
    await execFileAsync("osascript", ["-e", script], { timeout: 15000 });
  } catch (error) {
    const detail = error.stderr ? String(error.stderr).trim() : error.message;
    throw new Error(detail || "设置桌面失败");
  }
  const names = await fs.promises.readdir(dir);
  await Promise.all(
    names
      .filter((name) => name.startsWith("wallpaper_show_") && path.join(dir, name) !== shown)
      .map((name) => fs.promises.unlink(path.join(dir, name)).catch(() => {})),
  );
  return shown;
}

async function applyWallpaper(imagePath, dir) {
  if (process.platform === "darwin") {
    return setMacWallpaper(imagePath, dir);
  }
  throw new Error("这版试用只会在 macOS 上更换桌面壁纸");
}

const PAGE_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

function decodeCaption(value) {
  return String(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .split("\n")
    .map((line) => line.replace(/🔊/g, "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

async function fetchCaption(imageId) {
  if (!imageId) return [];
  try {
    const response = await fetch(`https://ss.blueforge.org/bing/s/${encodeURIComponent(imageId)}.htm`, {
      headers: PAGE_HEADERS,
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) return [];
    const html = await response.text();
    const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const h3 = html.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
    const lines = [];
    if (h1) lines.push(...decodeCaption(h1[1]));
    if (h3) lines.push(...decodeCaption(h3[1]));
    return lines.slice(0, 4);
  } catch {
    return [];
  }
}

function samePlace(left, right) {
  const a = String(left || "").replace(/\s+/g, "");
  const b = String(right || "").replace(/\s+/g, "");
  if (a.length < 6 || b.length < 6) return false;
  return a.includes(b.slice(0, 12)) || b.includes(a.slice(0, 12));
}

function absoluteBingUrl(url) {
  return url.startsWith("http") ? url : `https://www.bing.com${url}`;
}

async function listRecentBing() {
  const response = await fetch("https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=8&mkt=zh-CN", {
    headers: PAGE_HEADERS,
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return [];
  const info = await response.json();
  return (info.images || [])
    .filter((image) => image && image.url)
    .map((image) => ({
      copyright: image.copyright || "",
      url: absoluteBingUrl(image.url),
    }));
}

async function pickRecentBing({ copyright, avoidCopyright }) {
  const images = await listRecentBing();
  if (!images.length) return null;
  const matched = images.find(
    (image) => samePlace(image.copyright, copyright) && !samePlace(image.copyright, avoidCopyright),
  );
  if (matched) return matched.url;
  const others = images.filter((image) => !samePlace(image.copyright, avoidCopyright));
  const pool = others.length ? others : images;
  return pool[Math.floor(Math.random() * pool.length)].url;
}

async function findCleanBing(copyright, today) {
  const response = await fetch(
    `https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=${today ? 1 : 8}&mkt=zh-CN`,
    { headers: PAGE_HEADERS, signal: AbortSignal.timeout(8000) },
  );
  if (!response.ok) return null;
  const info = await response.json();
  const images = info.images || [];
  const matched = images.find((image) => image && image.url && samePlace(copyright, image.copyright));
  const chosen = matched || (today ? images[0] : null);
  if (!chosen || !chosen.url) return null;
  return chosen.url.startsWith("http") ? chosen.url : `https://www.bing.com${chosen.url}`;
}

async function downloadTo(url, dest, timeoutMs = 15000) {
  const response = await fetch(url, { headers: PAGE_HEADERS, signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`图片下载失败（HTTP ${response.status}）`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 1000) throw new Error("图片下载失败（内容为空）");
  const part = `${dest}.part`;
  await fs.promises.writeFile(part, bytes);
  await fs.promises.rename(part, dest);
  return dest;
}

module.exports = {
  fetchWordMeta,
  pickRecentBing,
  applyWallpaper,
  fetchCaption,
  findCleanBing,
  downloadTo,
};
