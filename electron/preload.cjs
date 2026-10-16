const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("wallish", {
  getState: () => ipcRenderer.invoke("state:get"),
  switchWallpaper: (random) => ipcRenderer.invoke("wallpaper:switch", { random: Boolean(random) }),
  previewWallpaper: () => ipcRenderer.invoke("wallpaper:preview"),
  confirmWallpaper: (crop) => ipcRenderer.invoke("wallpaper:confirm", crop),
  listFavorites: () => ipcRenderer.invoke("favorite:list"),
  saveFavorite: () => ipcRenderer.invoke("favorite:save"),
  removeFavorite: (id) => ipcRenderer.invoke("favorite:remove", id),
  removeCurrentFavorite: () => ipcRenderer.invoke("favorite:remove-current"),
  useFavorite: (id) => ipcRenderer.invoke("favorite:use", id),
  onFavorites: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("favorites:open", listener);
    return () => ipcRenderer.removeListener("favorites:open", listener);
  },
  onCustom: (callback) => {
    const listener = (_event, preview) => callback(preview);
    ipcRenderer.on("custom:open", listener);
    return () => ipcRenderer.removeListener("custom:open", listener);
  },
  watchWord: () => ipcRenderer.invoke("word:watch"),
  closeClip: () => ipcRenderer.invoke("clip:close"),
  setWordBox: (patch) => ipcRenderer.invoke("word-box:set", patch),
  openExternal: (url) => ipcRenderer.invoke("shell:open", url),
  onSettings: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("settings:open", listener);
    return () => ipcRenderer.removeListener("settings:open", listener);
  },
  onClip: (callback) => {
    const listener = (_event, clip) => callback(clip);
    ipcRenderer.on("clip:open", listener);
    return () => ipcRenderer.removeListener("clip:open", listener);
  },
  onState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("state:changed", listener);
    return () => ipcRenderer.removeListener("state:changed", listener);
  },
});
