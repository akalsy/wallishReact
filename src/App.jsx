import { useEffect, useRef, useState } from "react";
import SettingsPage from "./SettingsPage.jsx";

const DEFAULT_WORD_BOX = {
  position: "bottom",
  background: "#1f2a36",
  size: "medium",
  caption: true,
};

function ClipFrame({ url }) {
  const hostRef = useRef(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const frame = document.createElement("webview");
    frame.className = "wallish-clip__frame";
    frame.setAttribute("src", url);
    const onFail = (event) => {
      if (event.isMainFrame && event.errorCode !== -3) setFailed(true);
    };
    frame.addEventListener("did-fail-load", onFail);
    host.appendChild(frame);
    return () => {
      frame.removeEventListener("did-fail-load", onFail);
      frame.remove();
    };
  }, [url]);

  return (
    <div className="wallish-clip__host" ref={hostRef}>
      {failed ? <p className="wallish-clip__error">短片页面没有打开，请返回后再试。</p> : null}
    </div>
  );
}

function CustomPreview({ preview, busy, error, onConfirm, onPick, onBack }) {
  const frameRef = useRef(null);
  const dragRef = useRef(null);
  const [frame, setFrame] = useState({ width: 0, height: 0 });
  const [seen, setSeen] = useState(preview.imageDataUrl);
  const [focus, setFocus] = useState({ x: 0.5, y: 0.5 });
  if (seen !== preview.imageDataUrl) {
    setSeen(preview.imageDataUrl);
    setFocus({ x: 0.5, y: 0.5 });
  }

  useEffect(() => {
    const node = frameRef.current;
    if (!node) return undefined;
    function measure() {
      setFrame({ width: node.clientWidth, height: node.clientHeight });
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const scale = frame.width
    ? Math.max(frame.width / preview.sourceWidth, frame.height / preview.sourceHeight)
    : 1;
  const imageWidth = preview.sourceWidth * scale;
  const imageHeight = preview.sourceHeight * scale;
  const extraX = Math.max(0, imageWidth - frame.width);
  const extraY = Math.max(0, imageHeight - frame.height);
  const canDrag = extraX > 1 || extraY > 1;

  function onPointerDown(event) {
    if (!canDrag || busy) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, focusX: focus.x, focusY: focus.y };
  }

  function onPointerMove(event) {
    const drag = dragRef.current;
    if (!drag) return;
    const nextX = extraX ? drag.focusX - (event.clientX - drag.x) / extraX : 0.5;
    const nextY = extraY ? drag.focusY - (event.clientY - drag.y) / extraY : 0.5;
    setFocus({
      x: Math.min(1, Math.max(0, nextX)),
      y: Math.min(1, Math.max(0, nextY)),
    });
  }

  function onPointerUp() {
    dragRef.current = null;
  }

  return (
    <main className="wallish-custom">
      <header className="wallish-custom__bar">
        <button className="wallish-custom__back" type="button" onClick={onBack}>
          ‹ 返回
        </button>
        <h1 className="wallish-custom__title">自定义壁纸</h1>
      </header>
      <div
        className={canDrag ? "wallish-custom__frame wallish-custom__frame--drag" : "wallish-custom__frame"}
        ref={frameRef}
        style={{ aspectRatio: `${preview.targetWidth} / ${preview.targetHeight}` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {frame.width ? (
          <img
            className="wallish-custom__shot"
            src={preview.imageDataUrl}
            alt=""
            draggable={false}
            style={{
              width: imageWidth,
              height: imageHeight,
              transform: `translate(${-extraX * focus.x}px, ${-extraY * focus.y}px)`,
            }}
          />
        ) : null}
      </div>
      <p className="wallish-custom__name">{preview.name}</p>
      <p className="wallish-custom__hint">
        {`裁成 ${preview.targetWidth} × ${preview.targetHeight}，和每日壁纸一样。拖动画面选择留下的部分。`}
      </p>
      {error ? <p className="wallish-home__error">{error}</p> : null}
      <div className="wallish-custom__actions">
        <button className="wallish-custom__button" type="button" disabled={busy} onClick={onPick}>
          重新选择
        </button>
        <button
          className="wallish-custom__button wallish-custom__button--accent"
          type="button"
          disabled={busy}
          onClick={() => onConfirm(focus)}
        >
          确定
        </button>
      </div>
      {busy ? <p className="wallish-custom__status">正在设置桌面壁纸…</p> : null}
    </main>
  );
}

function FavoritesPage({ items, busy, error, onUse, onRemove, onBack }) {
  return (
    <main className="wallish-favorites">
      <header className="wallish-favorites__bar">
        <button className="wallish-favorites__back" type="button" onClick={onBack}>
          ‹ 返回
        </button>
        <h1 className="wallish-favorites__title">收藏</h1>
      </header>
      {items.length ? (
        <div className="wallish-favorites__list">
          {items.map((item) => (
            <article className="wallish-favorites__card" key={item.id}>
              <button className="wallish-favorites__pick" type="button" disabled={busy} onClick={() => onUse(item.id)}>
                {item.thumbUrl ? (
                  <img className="wallish-favorites__thumb" src={item.thumbUrl} alt="" />
                ) : (
                  <span className="wallish-favorites__thumb wallish-favorites__thumb--empty">无预览</span>
                )}
                <p className="wallish-favorites__word">{item.word || "自定义壁纸"}</p>
              </button>
              <button
                className="wallish-favorites__remove"
                type="button"
                disabled={busy}
                onClick={() => onRemove(item.id)}
              >
                取消收藏
              </button>
            </article>
          ))}
        </div>
      ) : (
        <p className="wallish-favorites__empty">还没有收藏。先在主页收藏当前壁纸。</p>
      )}
      {error ? <p className="wallish-home__error">{error}</p> : null}
    </main>
  );
}

function ClipPage({ word, url, onBack }) {
  return (
    <main className="wallish-clip">
      <header className="wallish-clip__bar">
        <button className="wallish-clip__back" type="button" onClick={onBack}>
          ‹ 返回
        </button>
        <h1 className="wallish-clip__title">{`看单词 ${word}`}</h1>
      </header>
      <ClipFrame key={url} url={url} />
    </main>
  );
}

export default function App() {
  const [snapshot, setSnapshot] = useState(null);
  const [clip, setClip] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [customPreview, setCustomPreview] = useState(null);
  const [favoritesOpen, setFavoritesOpen] = useState(false);
  const [favorites, setFavorites] = useState([]);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const api = window.wallish;
    if (!api) return undefined;
    let alive = true;
    api.getState().then((next) => {
      if (alive) setSnapshot(next);
    });
    const unsubscribe = api.onState((next) => {
      setSnapshot(next);
      setError(next && next.error ? next.error : "");
    });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const api = window.wallish;
    if (!api) return undefined;
    return api.onClip((next) => {
      setClip(next);
      setSettingsOpen(false);
    });
  }, []);

  useEffect(() => {
    const api = window.wallish;
    if (!api || !api.onSettings) return undefined;
    return api.onSettings(() => {
      setClip(null);
      setCustomPreview(null);
      setSettingsOpen(true);
    });
  }, []);

  useEffect(() => {
    const api = window.wallish;
    if (!api || !api.onCustom) return undefined;
    return api.onCustom((preview) => {
      setClip(null);
      setSettingsOpen(false);
      setFavoritesOpen(false);
      setCustomPreview(preview);
    });
  }, []);

  useEffect(() => {
    const api = window.wallish;
    if (!api || !api.onFavorites) return undefined;
    return api.onFavorites(() => {
      setClip(null);
      setSettingsOpen(false);
      setCustomPreview(null);
      setFavoritesOpen(true);
      api.listFavorites().then(setFavorites).catch((err) => {
        setError(err && err.message ? err.message : "收藏列表没有打开");
      });
    });
  }, []);

  async function chooseWallpaper() {
    setBusy(true);
    setError("");
    try {
      const preview = await window.wallish.previewWallpaper();
      if (preview) setCustomPreview(preview);
    } catch (err) {
      setError(err && err.message ? err.message : "这张图片没有打开");
    } finally {
      setBusy(false);
    }
  }

  async function confirmWallpaper(focus) {
    setBusy(true);
    setError("");
    try {
      const next = await window.wallish.confirmWallpaper(focus);
      setSnapshot(next);
      setCustomPreview(null);
    } catch (err) {
      setError(err && err.message ? err.message : "没有换成这张图片");
    } finally {
      setBusy(false);
    }
  }

  async function openFavoriteList() {
    setError("");
    setFavoritesOpen(true);
    try {
      setFavorites(await window.wallish.listFavorites());
    } catch (err) {
      setError(err && err.message ? err.message : "收藏列表没有打开");
    }
  }

  async function toggleFavorite() {
    setBusy(true);
    setError("");
    try {
      const next = snapshot && snapshot.favorited
        ? await window.wallish.removeCurrentFavorite()
        : await window.wallish.saveFavorite();
      setSnapshot(next);
    } catch (err) {
      setError(err && err.message ? err.message : "收藏没有保存");
    } finally {
      setBusy(false);
    }
  }

  async function useFavorite(id) {
    setBusy(true);
    setError("");
    try {
      const next = await window.wallish.useFavorite(id);
      setSnapshot(next);
      setFavoritesOpen(false);
    } catch (err) {
      setError(err && err.message ? err.message : "没有换成这张收藏");
    } finally {
      setBusy(false);
    }
  }

  async function removeFavorite(id) {
    setBusy(true);
    setError("");
    try {
      const next = await window.wallish.removeFavorite(id);
      setSnapshot(next);
      setFavorites(await window.wallish.listFavorites());
    } catch (err) {
      setError(err && err.message ? err.message : "没有取消收藏");
    } finally {
      setBusy(false);
    }
  }

  async function changeWallpaper(random) {
    setBusy(true);
    setError("");
    try {
      const next = await window.wallish.switchWallpaper(random);
      setSnapshot(next);
    } catch (err) {
      setError(err && err.message ? err.message : "切换失败");
    } finally {
      setBusy(false);
    }
  }

  function saveWordBox(nextBox) {
    setSaving(true);
    setError("");
    window.wallish
      .setWordBox(nextBox)
      .then((next) => {
        setSnapshot(next);
      })
      .catch((err) => {
        setError(err && err.message ? err.message : "设置没有保存");
      })
      .finally(() => {
        setSaving(false);
      });
  }

  function backHome() {
    setClip(null);
    window.wallish.closeClip().catch((err) => {
      setError(err && err.message ? err.message : "返回失败");
    });
  }

  if (clip) {
    return <ClipPage word={clip.word} url={clip.url} onBack={backHome} />;
  }

  if (favoritesOpen) {
    return (
      <FavoritesPage
        items={favorites}
        busy={busy}
        error={error}
        onUse={useFavorite}
        onRemove={removeFavorite}
        onBack={() => setFavoritesOpen(false)}
      />
    );
  }

  if (customPreview) {
    return (
      <CustomPreview
        preview={customPreview}
        busy={busy}
        error={error}
        onConfirm={confirmWallpaper}
        onPick={chooseWallpaper}
        onBack={() => setCustomPreview(null)}
      />
    );
  }

  const wordBox = (snapshot && snapshot.wordBox) || DEFAULT_WORD_BOX;

  if (settingsOpen) {
    return (
      <SettingsPage
        imageUrl={snapshot && snapshot.imageDataUrl}
        box={wordBox}
        saving={saving}
        error={error}
        onSave={saveWordBox}
        onBack={() => setSettingsOpen(false)}
      />
    );
  }

  if (!window.wallish) {
    return (
      <main className="wallish-home">
        <p className="wallish-home__hint">请从 Electron 启动，浏览器里没有托盘和壁纸接口。</p>
      </main>
    );
  }

  const word = snapshot && snapshot.word;
  const copyright = snapshot && snapshot.copyright;

  return (
    <main className="wallish-home">
      <header className="wallish-home__header">
        <div className="wallish-home__heading">
          <p className="wallish-home__kicker">Wallish</p>
          <h1 className="wallish-home__title">{word || "等待壁纸"}</h1>
        </div>
        <button
          className="wallish-home__settings"
          type="button"
          aria-label="设置"
          onClick={() => setSettingsOpen(true)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z"
            />
            <path
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
              d="M19.4 13.5a7.7 7.7 0 0 0 .1-1.5 7.7 7.7 0 0 0-.1-1.5l2-1.6-2-3.4-2.4 1a7.4 7.4 0 0 0-2.6-1.5L14 2h-4l-.4 2.5a7.4 7.4 0 0 0-2.6 1.5l-2.4-1-2 3.4 2 1.6a7.7 7.7 0 0 0-.1 1.5 7.7 7.7 0 0 0 .1 1.5l-2 1.6 2 3.4 2.4-1a7.4 7.4 0 0 0 2.6 1.5L10 22h4l.4-2.5a7.4 7.4 0 0 0 2.6-1.5l2.4 1 2-3.4-2-1.6Z"
            />
          </svg>
        </button>
      </header>

      <div className="wallish-home__stage">
        {snapshot && snapshot.imageDataUrl ? (
          <img className="wallish-home__photo" src={snapshot.imageDataUrl} alt={copyright || "壁纸"} />
        ) : (
          <div className="wallish-home__photo wallish-home__photo--empty">还没有图片</div>
        )}
      </div>

      <p className="wallish-home__copy">{copyright || "点下面的按钮换一张 Bing 每日壁纸。"}</p>
      {error ? <p className="wallish-home__error">{error}</p> : null}

      <div className="wallish-home__actions">
        <button
          className="wallish-home__button wallish-home__button--today"
          type="button"
          disabled={busy}
          onClick={() => changeWallpaper(false)}
        >
          今日壁纸
        </button>
        <button
          className="wallish-home__button wallish-home__button--past"
          type="button"
          disabled={busy}
          onClick={() => changeWallpaper(true)}
        >
          切换往日壁纸
        </button>
        <button className="wallish-home__button wallish-home__button--custom" type="button" disabled={busy} onClick={chooseWallpaper}>
          自定义壁纸
        </button>
      </div>

      <div className="wallish-home__links">
        <button
          className="wallish-home__link"
          type="button"
          disabled={busy || !(snapshot && snapshot.imageDataUrl)}
          onClick={toggleFavorite}
        >
          {snapshot && snapshot.favorited ? "已收藏" : "收藏"}
        </button>
        <button className="wallish-home__link" type="button" disabled={busy} onClick={openFavoriteList}>
          收藏列表
        </button>
        {snapshot && snapshot.dictionaryUrl ? (
          <button
            className="wallish-home__link"
            type="button"
            onClick={() => window.wallish.openExternal(snapshot.dictionaryUrl)}
          >
            查单词
          </button>
        ) : null}
        {word ? (
          <button
            className="wallish-home__link"
            type="button"
            onClick={() => {
              window.wallish.watchWord().catch((err) => {
                setError(err && err.message ? err.message : "打不开看单词");
              });
            }}
          >
            {`看单词 ${word}`}
          </button>
        ) : null}
      </div>

      <p className="wallish-home__hint">关掉窗口后程序还在菜单栏。退出请用托盘菜单。</p>
    </main>
  );
}
