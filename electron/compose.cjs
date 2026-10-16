const fs = require("fs");
const path = require("path");
const { BrowserWindow, nativeImage } = require("electron");

function inkOn(background) {
  const value = Number.parseInt(String(background || "").replace("#", ""), 16);
  if (!Number.isFinite(value)) return "#f4f7fb";
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  const lightness = (red * 299 + green * 587 + blue * 114) / 1000;
  return lightness > 160 ? "#1f2a36" : "#f4f7fb";
}

function hexToRgba(background, alpha) {
  const value = Number.parseInt(String(background).replace("#", ""), 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function barStyle(wordBox, width) {
  const scale = width / 1920;
  const title = wordBox.size === "small" ? 34 : wordBox.size === "large" ? 64 : 46;
  const body = wordBox.size === "small" ? 22 : wordBox.size === "large" ? 36 : 28;
  const padY = wordBox.size === "small" ? 16 : wordBox.size === "large" ? 32 : 22;
  const padX = wordBox.size === "small" ? 26 : wordBox.size === "large" ? 44 : 34;
  const side = wordBox.position === "left" || wordBox.position === "right";
  let place = "top: 50%; left: 50%; transform: translate(-50%, -50%);";
  if (wordBox.position === "top") place = "top: 6%; left: 50%; transform: translateX(-50%);";
  if (wordBox.position === "bottom") place = "bottom: 7%; left: 50%; transform: translateX(-50%);";
  if (wordBox.position === "left") place = "top: 50%; left: 4%; transform: translateY(-50%);";
  if (wordBox.position === "right") place = "top: 50%; right: 4%; transform: translateY(-50%);";
  return {
    title: Math.max(18, Math.round(title * scale)),
    body: Math.max(14, Math.round(body * scale)),
    padY: Math.max(12, Math.round(padY * scale)),
    padX: Math.max(16, Math.round(padX * scale)),
    maxWidth: side ? "42%" : "68%",
    place,
  };
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function paintStrip({ cleanPath, lines, wordBox, outPath }) {
  const image = nativeImage.createFromPath(cleanPath);
  const { width, height } = image.getSize();
  if (!width || !height) throw new Error("壁纸图片无法打开");
  const bar = barStyle(wordBox, width);
  const ink = inkOn(wordBox.background);
  const text = (lines && lines.length ? lines : ["word"])
    .map((line, index) => `<p class="${index === 0 ? "line line--title" : "line"}">${escapeHtml(line)}</p>`)
    .join("");
  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  html, body { margin: 0; width: ${width}px; height: ${height}px; overflow: hidden; background: #000; }
  .photo { position: absolute; inset: 0; width: ${width}px; height: ${height}px; }
  .bar {
    position: absolute;
    ${bar.place}
    box-sizing: border-box;
    width: max-content;
    max-width: ${bar.maxWidth};
    padding: ${bar.padY}px ${bar.padX}px;
    border-radius: ${Math.round(18 * (width / 1920))}px;
    background: ${hexToRgba(wordBox.background, 0.58)};
    color: ${ink};
    font-family: "PingFang SC", "Hiragino Sans GB", sans-serif;
  }
  .line { margin: 0; line-height: 1.4; font-size: ${bar.body}px; }
  .line + .line { margin-top: 0.28em; }
  .line--title { font-size: ${bar.title}px; font-weight: 650; }
</style>
</head>
<body>
  <img class="photo" src="${image.toDataURL()}">
  <div class="bar">${text}</div>
</body>
</html>`;
  const htmlPath = path.join(path.dirname(outPath), "compose.html");
  fs.writeFileSync(htmlPath, html);
  const win = new BrowserWindow({
    width,
    height,
    show: false,
    frame: false,
    enableLargerThanScreen: true,
    useContentSize: true,
    webPreferences: {
      offscreen: true,
      backgroundThrottling: false,
    },
  });
  try {
    await win.loadFile(htmlPath);
    await win.webContents.executeJavaScript(
      "Promise.all([document.fonts.ready, ...[...document.images].map((img) => img.decode().catch(() => {}))]).then(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))",
    );
    let shot = await win.webContents.capturePage();
    const size = shot.getSize();
    if (!size.width || !size.height) throw new Error("单词条没有画出来");
    if (size.width !== width || size.height !== height) {
      shot = shot.resize({ width, height, quality: "best" });
    }
    fs.writeFileSync(outPath, shot.toJPEG(90));
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
  return outPath;
}

module.exports = {
  paintStrip,
};
