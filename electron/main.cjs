const { app, BrowserWindow, Menu, Tray, dialog, ipcMain, nativeImage, screen, shell } = require("electron");
const fs = require("fs");
const path = require("path");
const { fetchWordMeta, pickRecentBing, applyWallpaper, fetchCaption, downloadTo, findCleanBing } = require("./wallpaper.cjs");
const { paintStrip } = require("./compose.cjs");

const DEV_URL = process.env.VITE_DEV_SERVER_URL || "http://127.0.0.1:5173";

let tray = null;
let win = null;
let homeBounds = null;
let quitting = false;
const DEFAULT_WORD_BOX = {
  position: "bottom",
  background: "#1f2a36",
  size: "medium",
  caption: true,
};

function normalizeWordBox(value) {
  const box = value && typeof value === "object" ? value : {};
  const positions = ["top", "center", "bottom", "left", "right"];
  const sizes = ["small", "medium", "large"];
  let position = box.position;
  if (position === "top-left" || position === "top-right") position = "top";
  if (position === "bottom-left" || position === "bottom-right") position = "bottom";
  const background = /^#[0-9a-fA-F]{6}$/.test(box.background) ? box.background : DEFAULT_WORD_BOX.background;
  return {
    position: positions.includes(position) ? position : DEFAULT_WORD_BOX.position,
    background,
    size: sizes.includes(box.size) ? box.size : DEFAULT_WORD_BOX.size,
    caption: box.caption !== false,
  };
}

let state = {
  word: null,
  dictionaryUrl: null,
  copyright: null,
  copyrightUrl: null,
  imageId: null,
  imagePath: null,
  imageDataUrl: null,
  captionLines: null,
  source: "bing",
  favoriteId: null,
  wordBox: DEFAULT_WORD_BOX,
  error: null,
};

function userDir() {
  return app.getPath("userData");
}

function stateFile() {
  return path.join(userDir(), "state.json");
}

function loadState() {
  try {
    const saved = JSON.parse(fs.readFileSync(stateFile(), "utf8"));
    state = { ...state, ...saved, imageDataUrl: null, wordBox: normalizeWordBox(saved.wordBox) };
    const composed = path.join(userDir(), "wallpaper-composed.jpg");
    const preview = fs.existsSync(composed) ? composed : state.imagePath;
    if (preview && fs.existsSync(preview)) {
      const bytes = fs.readFileSync(preview);
      state.imageDataUrl = `data:image/jpeg;base64,${bytes.toString("base64")}`;
    }
  } catch {
    // First launch has no saved state.
  }
}

function saveState() {
  const { imageDataUrl, ...rest } = state;
  fs.mkdirSync(userDir(), { recursive: true });
  fs.writeFileSync(stateFile(), JSON.stringify(rest, null, 2));
}

function favoritesFile() {
  return path.join(userDir(), "favorites.json");
}

function favoritesDir() {
  return path.join(userDir(), "favorites");
}

function loadFavorites() {
  try {
    const saved = JSON.parse(fs.readFileSync(favoritesFile(), "utf8"));
    return Array.isArray(saved) ? saved.filter((item) => item && item.id) : [];
  } catch {
    return [];
  }
}

function saveFavorites(items) {
  fs.mkdirSync(userDir(), { recursive: true });
  fs.writeFileSync(favoritesFile(), JSON.stringify(items, null, 2));
}

function currentFavorite() {
  const items = loadFavorites();
  if (state.favoriteId) {
    const hit = items.find((item) => item.id === state.favoriteId);
    if (hit) return hit;
  }
  if (state.source !== "custom" && state.imageId) {
    return items.find((item) => item.source !== "custom" && item.imageId === state.imageId) || null;
  }
  return null;
}

function viewState() {
  return { ...state, favorited: Boolean(currentFavorite()) };
}

function broadcast() {
  if (win && !win.isDestroyed()) {
    win.webContents.send("state:changed", viewState());
  }
}

function showWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function switchFromTray(random) {
  switchWallpaper(random).catch((error) => {
    dialog.showErrorBox("切换壁纸", error.message || String(error));
  });
}

function chooseFromTray() {
  previewCustomWallpaper()
    .then((preview) => {
      if (preview && win && !win.isDestroyed()) win.webContents.send("custom:open", preview);
    })
    .catch((error) => {
      dialog.showErrorBox("自定义壁纸", error.message || String(error));
    });
}

function wordClipUrl(word) {
  return (
    "https://www.playphrase.me/#/reels/en?source=custom-search" +
    `&q=${encodeURIComponent(word)}` +
    "&translate-direction=zh-cn&ct=phrases"
  );
}

function showClipLayout(word) {
  if (!win) return;
  showWindow();
  if (!homeBounds) homeBounds = win.getBounds();
  const area = screen.getDisplayMatching(homeBounds).workArea;
  const width = Math.min(1080, area.width);
  const height = Math.min(760, area.height);
  let x = homeBounds.x;
  let y = homeBounds.y;
  if (x + width > area.x + area.width) x = Math.max(area.x, area.x + area.width - width);
  if (y + height > area.y + area.height) y = Math.max(area.y, area.y + area.height - height);
  win.setBounds({ x, y, width, height });
  win.setTitle(`看单词 ${word}`);
}

function restoreHomeLayout() {
  if (!win) return;
  if (homeBounds) win.setBounds(homeBounds);
  homeBounds = null;
  win.setTitle("Wallish");
}

function watchWord() {
  if (!state.word || !win) return false;
  const word = state.word;
  showClipLayout(word);
  win.webContents.send("clip:open", { word, url: wordClipUrl(word) });
  return true;
}

function closeClip() {
  restoreHomeLayout();
  return true;
}

function openSettings() {
  closeClip();
  showWindow();
  if (win) win.webContents.send("settings:open");
}

function openFavorites() {
  closeClip();
  showWindow();
  if (win) win.webContents.send("favorites:open");
}

let publishChain = Promise.resolve();

function previewBytes(filePath) {
  const bytes = fs.readFileSync(filePath);
  return `data:image/jpeg;base64,${bytes.toString("base64")}`;
}

async function ensureCaption() {
  if (Array.isArray(state.captionLines) && state.captionLines.length) return state.captionLines;
  const lines = await fetchCaption(state.imageId);
  state.captionLines = lines.length ? lines : state.word ? [state.word] : [];
  return state.captionLines;
}

async function ensureClean() {
  const dir = userDir();
  const clean = path.join(dir, "wallpaper-clean.jpg");
  const markerPath = path.join(dir, "wallpaper-clean.txt");
  if (state.source === "custom") {
    const custom = path.join(dir, "wallpaper-custom.jpg");
    if (!fs.existsSync(custom)) throw new Error("自定义图片不见了，请重新选择");
    return { path: custom, pristine: true };
  }
  const id = state.imageId || "";
  if (!id) throw new Error("这张壁纸没有原图");
  const marker = fs.existsSync(markerPath) ? fs.readFileSync(markerPath, "utf8") : "";
  if (marker === `bing:${id}` && fs.existsSync(clean)) {
    return { path: clean, pristine: true };
  }
  let url = null;
  try {
    url = await findCleanBing(state.copyright, !state.random);
  } catch {
    url = null;
  }
  if (!url) throw new Error("这张壁纸不在最近 8 天里");
  await downloadTo(url, clean);
  fs.writeFileSync(markerPath, `bing:${id}`);
  return { path: clean, pristine: true };
}

async function republishWallpaper() {
  const platePromise = ensureClean();
  const linesPromise = ensureCaption();
  const plate = await platePromise;
  const lines = await linesPromise;
  const composed = path.join(userDir(), "wallpaper-composed.jpg");
  if (plate.pristine && lines.length && state.wordBox.caption !== false) {
    await paintStrip({
      cleanPath: plate.path,
      lines,
      wordBox: state.wordBox,
      outPath: composed,
    });
  } else {
    await fs.promises.copyFile(plate.path, composed);
  }
  const shown = await applyWallpaper(composed, userDir());
  state = {
    ...state,
    shownPath: shown,
    imageDataUrl: previewBytes(composed),
    error: null,
  };
  saveState();
  broadcast();
  refreshTray();
  return viewState();
}

function enqueuePublish() {
  const job = publishChain.then(() => republishWallpaper());
  publishChain = job.catch((error) => {
    state = { ...state, error: error.message || String(error) };
    broadcast();
  });
  return job;
}

function setWordBox(patch) {
  state = { ...state, wordBox: normalizeWordBox({ ...state.wordBox, ...(patch || {}) }) };
  saveState();
  if (!state.imagePath) {
    broadcast();
    return viewState();
  }
  return enqueuePublish();
}

function watchFromTray() {
  Promise.resolve(watchWord()).catch((error) => {
    dialog.showErrorBox("看单词", error.message || String(error));
  });
}

function buildTrayMenu() {
  const wordLabel = state.word ? `当前单词 ${state.word}` : "还没有壁纸";
  return Menu.buildFromTemplate([
    { label: wordLabel, enabled: false },
    { type: "separator" },
    { label: "打开窗口", click: showWindow },
    { label: "今日壁纸", click: () => switchFromTray(false) },
    { label: "切换往日壁纸", click: () => switchFromTray(true) },
    { label: "自定义壁纸", click: () => chooseFromTray() },
    { label: "收藏列表", click: openFavorites },
    ...(state.word ? [{ label: `看单词 ${state.word}`, click: watchFromTray }] : []),
    { label: "设置", click: openSettings },
    { type: "separator" },
    {
      label: "退出",
      click: () => {
        quitting = true;
        app.quit();
      },
    },
  ]);
}

function refreshTray() {
  if (tray) tray.setContextMenu(buildTrayMenu());
}

function createWindow() {
  win = new BrowserWindow({
    width: 680,
    height: 740,
    show: true,
    title: "Wallish",
    backgroundColor: "#1c1c1e",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  });

  win.on("close", (event) => {
    if (quitting) return;
    event.preventDefault();
    win.hide();
  });

  if (app.isPackaged) {
    win.loadFile(path.join(__dirname, "../dist/index.html"));
  } else {
    win.loadURL(DEV_URL);
  }
}

function trayImage() {
  const pngPath = path.join(__dirname, "../assets/tray.png");
  const icoPath = path.join(__dirname, "../../assets/binglish.ico");
  const iconPath = fs.existsSync(pngPath) ? pngPath : icoPath;
  const icon = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();
  if (icon.isEmpty()) return nativeImage.createFromDataURL(FALLBACK_ICON);
  return icon.resize({ width: 18, height: 18 });
}

function createTray() {
  tray = new Tray(trayImage());
  tray.setToolTip("Wallish");
  refreshTray();
  tray.on("click", showWindow);
}

function wallpaperSize() {
  const display = screen.getPrimaryDisplay().size;
  return {
    width: Math.max(display.width || 1920, 1280),
    height: Math.max(display.height || 1080, 720),
  };
}

function switchWallpaper(random) {
  const job = publishChain.then(async () => {
    const dir = userDir();
    const clean = path.join(dir, "wallpaper-clean.jpg");
    const metaPromise = fetchWordMeta(random);
    const captionPromise = metaPromise.then((meta) => fetchCaption(meta.imageId));
    const photoPromise = (async () => {
      const meta = random ? await metaPromise : null;
      const url = random
        ? await pickRecentBing({ copyright: meta && meta.copyright, avoidCopyright: state.copyright })
        : await findCleanBing(null, true);
      if (!url) throw new Error("没有拿到 Bing 壁纸");
      await downloadTo(url, clean);
    })();
    const meta = await metaPromise;
    const [lines] = await Promise.all([captionPromise, photoPromise]);
    if (!meta.imageId) throw new Error("没有拿到单词");
    fs.writeFileSync(path.join(dir, "wallpaper-clean.txt"), `bing:${meta.imageId}`);
    state = {
      ...meta,
      source: "bing",
      imagePath: clean,
      imageDataUrl: null,
      captionLines: lines.length ? lines : null,
      wordBox: state.wordBox,
      error: null,
      random: Boolean(random),
    };
    saveState();
    return republishWallpaper();
  });
  publishChain = job.catch((error) => {
    state = { ...state, error: error.message || String(error) };
    broadcast();
  });
  return job;
}

function prepareSource(image) {
  const { width, height } = image.getSize();
  if (!width || !height) throw new Error("这张图片打不开");
  const maxEdge = 4096;
  if (width <= maxEdge && height <= maxEdge) return image;
  const scale = maxEdge / Math.max(width, height);
  return image.resize({
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    quality: "best",
  });
}

function clampUnit(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0.5;
  return Math.min(1, Math.max(0, number));
}

function cropCover(filePath, targetWidth, targetHeight, focusX, focusY) {
  const image = nativeImage.createFromPath(filePath);
  const { width, height } = image.getSize();
  if (!width || !height) throw new Error("这张图片打不开");
  const scale = Math.max(targetWidth / width, targetHeight / height);
  const scaledWidth = Math.max(targetWidth, Math.ceil(width * scale));
  const scaledHeight = Math.max(targetHeight, Math.ceil(height * scale));
  const resized =
    scaledWidth === width && scaledHeight === height
      ? image
      : image.resize({ width: scaledWidth, height: scaledHeight, quality: "best" });
  const extraX = scaledWidth - targetWidth;
  const extraY = scaledHeight - targetHeight;
  return resized.crop({
    x: Math.min(extraX, Math.max(0, Math.round(extraX * clampUnit(focusX)))),
    y: Math.min(extraY, Math.max(0, Math.round(extraY * clampUnit(focusY)))),
    width: targetWidth,
    height: targetHeight,
  });
}

let pendingCustom = null;

async function buildCustomPreview() {
  showWindow();
  const picked = await dialog.showOpenDialog(win, {
    title: "选择壁纸",
    properties: ["openFile"],
    filters: [{ name: "图片", extensions: ["jpg", "jpeg", "png", "webp", "gif", "bmp", "heic", "tif", "tiff"] }],
  });
  if (picked.canceled || !picked.filePaths[0]) return null;
  const source = prepareSource(nativeImage.createFromPath(picked.filePaths[0]));
  const { width, height } = source.getSize();
  const target = wallpaperSize();
  const dir = userDir();
  const pending = path.join(dir, "wallpaper-custom-pending.jpg");
  await fs.promises.writeFile(pending, source.toJPEG(92));
  const previewEdge = 1280;
  const previewScale = Math.min(1, previewEdge / Math.max(width, height));
  const previewImage =
    previewScale === 1
      ? source
      : source.resize({
          width: Math.max(1, Math.round(width * previewScale)),
          height: Math.max(1, Math.round(height * previewScale)),
          quality: "good",
        });
  const name = path.basename(picked.filePaths[0]);
  pendingCustom = { path: pending, name, target };
  return {
    name,
    imageDataUrl: `data:image/jpeg;base64,${previewImage.toJPEG(82).toString("base64")}`,
    sourceWidth: width,
    sourceHeight: height,
    targetWidth: target.width,
    targetHeight: target.height,
  };
}

function previewCustomWallpaper() {
  const job = publishChain.then(() => buildCustomPreview());
  publishChain = job.catch((error) => {
    state = { ...state, error: error.message || String(error) };
    broadcast();
  });
  return job;
}

function confirmCustomWallpaper(crop) {
  const job = publishChain.then(async () => {
    if (!pendingCustom || !fs.existsSync(pendingCustom.path)) {
      throw new Error("请先选择一张图片");
    }
    const dir = userDir();
    const target = pendingCustom.target || wallpaperSize();
    const cropped = cropCover(pendingCustom.path, target.width, target.height, crop && crop.x, crop && crop.y);
    const dest = path.join(dir, "wallpaper-custom.jpg");
    const composed = path.join(dir, "wallpaper-composed.jpg");
    await fs.promises.writeFile(dest, cropped.toJPEG(92));
    const lines = await ensureCaption();
    if (lines.length && state.wordBox.caption !== false) {
      await paintStrip({
        cleanPath: dest,
        lines,
        wordBox: state.wordBox,
        outPath: composed,
      });
    } else {
      await fs.promises.copyFile(dest, composed);
    }
    const shown = await applyWallpaper(composed, dir);
    state = {
      ...state,
      source: "custom",
      imagePath: dest,
      copyright: pendingCustom.name,
      copyrightUrl: null,
      shownPath: shown,
      imageDataUrl: previewBytes(composed),
      error: null,
    };
    pendingCustom = null;
    state = { ...state, favoriteId: null };
    saveState();
    broadcast();
    refreshTray();
    return viewState();
  });
  publishChain = job.catch((error) => {
    state = { ...state, error: error.message || String(error) };
    broadcast();
  });
  return job;
}

function favoriteThumb(id) {
  const file = path.join(favoritesDir(), `${id}.thumb.jpg`);
  if (!fs.existsSync(file)) return "";
  return previewBytes(file);
}

function listFavorites() {
  return loadFavorites()
    .filter((item) => fs.existsSync(path.join(favoritesDir(), `${item.id}.jpg`)))
    .map((item) => ({
      id: item.id,
      word: item.word || "",
      copyright: item.copyright || "",
      source: item.source === "custom" ? "custom" : "bing",
      thumbUrl: favoriteThumb(item.id),
    }));
}

function saveFavorite() {
  const job = publishChain.then(async () => {
    if (!state.imagePath || !fs.existsSync(state.imagePath)) throw new Error("还没有可以收藏的壁纸");
    if (currentFavorite()) return viewState();
    await ensureCaption();
    const plate = await ensureClean();
    const id = String(Date.now());
    const dir = favoritesDir();
    await fs.promises.mkdir(dir, { recursive: true });
    const file = path.join(dir, `${id}.jpg`);
    await fs.promises.copyFile(plate.path, file);
    const image = nativeImage.createFromPath(file);
    const { width, height } = image.getSize();
    if (width && height) {
      const edge = Math.max(width, height);
      const thumb = edge > 480 ? image.resize({ width: Math.round((width * 480) / edge), height: Math.round((height * 480) / edge), quality: "good" }) : image;
      await fs.promises.writeFile(path.join(dir, `${id}.thumb.jpg`), thumb.toJPEG(75));
    }
    const items = loadFavorites();
    items.unshift({
      id,
      word: state.word,
      dictionaryUrl: state.dictionaryUrl,
      audioUrl: state.audioUrl || null,
      copyright: state.copyright,
      copyrightUrl: state.copyrightUrl,
      imageId: state.imageId,
      captionLines: state.captionLines,
      source: state.source === "custom" ? "custom" : "bing",
      pristine: plate.pristine,
      wordBox: state.wordBox,
      savedAt: Date.now(),
    });
    saveFavorites(items);
    state = { ...state, favoriteId: id };
    saveState();
    broadcast();
    return viewState();
  });
  publishChain = job.catch((error) => {
    state = { ...state, error: error.message || String(error) };
    broadcast();
  });
  return job;
}

function removeFavorite(id) {
  if (!id) return viewState();
  const items = loadFavorites().filter((item) => item.id !== id);
  saveFavorites(items);
  fs.rmSync(path.join(favoritesDir(), `${id}.jpg`), { force: true });
  fs.rmSync(path.join(favoritesDir(), `${id}.thumb.jpg`), { force: true });
  if (state.favoriteId === id) {
    state = { ...state, favoriteId: null };
    saveState();
  }
  broadcast();
  return viewState();
}

function removeCurrentFavorite() {
  const current = currentFavorite();
  if (!current) return viewState();
  return removeFavorite(current.id);
}

function useFavorite(id) {
  const job = publishChain.then(async () => {
    const entry = loadFavorites().find((item) => item.id === id);
    const file = path.join(favoritesDir(), `${id}.jpg`);
    if (!entry || !fs.existsSync(file)) throw new Error("这张收藏已经不在了");
    const dir = userDir();
    if (entry.source === "custom") {
      const dest = path.join(dir, "wallpaper-custom.jpg");
      await fs.promises.copyFile(file, dest);
      state = {
        ...state,
        source: "custom",
        imagePath: dest,
        imageId: entry.imageId || null,
        favoriteId: entry.id,
      };
    } else {
      fs.rmSync(path.join(dir, "wallpaper-clean.txt"), { force: true });
      state = {
        ...state,
        source: "bing",
        imagePath: file,
        imageId: entry.imageId || null,
        favoriteId: entry.id,
      };
    }
    state = {
      ...state,
      word: entry.word || null,
      dictionaryUrl: entry.dictionaryUrl || null,
      audioUrl: entry.audioUrl || null,
      copyright: entry.copyright || null,
      copyrightUrl: entry.copyrightUrl || null,
      captionLines: Array.isArray(entry.captionLines) ? entry.captionLines : entry.word ? [entry.word] : [],
      wordBox: normalizeWordBox(entry.wordBox),
      error: null,
    };
    saveState();
    return republishWallpaper();
  });
  publishChain = job.catch((error) => {
    state = { ...state, error: error.message || String(error) };
    broadcast();
  });
  return job;
}

function registerIpc() {
  ipcMain.handle("state:get", () => viewState());
  ipcMain.handle("wallpaper:preview", () => previewCustomWallpaper());
  ipcMain.handle("wallpaper:confirm", (_event, crop) => confirmCustomWallpaper(crop));
  ipcMain.handle("favorite:list", () => listFavorites());
  ipcMain.handle("favorite:save", () => saveFavorite());
  ipcMain.handle("favorite:remove", (_event, id) => removeFavorite(String(id || "")));
  ipcMain.handle("favorite:remove-current", () => removeCurrentFavorite());
  ipcMain.handle("favorite:use", (_event, id) => useFavorite(String(id || "")));
  ipcMain.handle("wallpaper:switch", async (_event, payload) => {
    try {
      return await switchWallpaper(Boolean(payload && payload.random));
    } catch (error) {
      state = { ...state, error: error.message || String(error) };
      broadcast();
      throw error;
    }
  });
  ipcMain.handle("word:watch", () => watchWord());
  ipcMain.handle("clip:close", () => closeClip());
  ipcMain.handle("word-box:set", (_event, patch) => setWordBox(patch));
  ipcMain.handle("shell:open", (_event, url) => {
    if (typeof url === "string" && /^https?:\/\//.test(url)) {
      return shell.openExternal(url);
    }
    return false;
  });
}

const FALLBACK_ICON =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMUlEQVQ4T2NkYGD4z0ABYBw1gGE0DBgYGBj+U4BWMjAw/AcxGIwMDAwM/0EMBgMDA8N/AABb3gQb8m0n2QAAAABJRU5ErkJggg==";

app.whenReady().then(() => {
  loadState();
  registerIpc();
  createTray();
  createWindow();
});

app.on("before-quit", () => {
  quitting = true;
});

app.on("window-all-closed", () => {
  // Tray keeps the process alive.
});
