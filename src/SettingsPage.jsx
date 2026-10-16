import { useState } from "react";

const POSITIONS = [
  { id: "top", label: "靠上" },
  { id: "center", label: "居中" },
  { id: "bottom", label: "靠下" },
  { id: "left", label: "靠左" },
  { id: "right", label: "靠右" },
];

const SIZES = [
  { id: "small", label: "小" },
  { id: "medium", label: "中" },
  { id: "large", label: "大" },
];

function sameBox(left, right) {
  return (
    left.position === right.position &&
    left.background === right.background &&
    left.size === right.size &&
    (left.caption !== false) === (right.caption !== false)
  );
}

export default function SettingsPage({ imageUrl, box, saving, error, onSave, onBack }) {
  const savedKey = `${box.position}|${box.background}|${box.size}|${box.caption === false ? "0" : "1"}`;
  const [seen, setSeen] = useState(savedKey);
  const [draft, setDraft] = useState(box);
  if (seen !== savedKey) {
    setSeen(savedKey);
    setDraft(box);
  }

  function patch(part) {
    setDraft((current) => ({ ...current, ...part }));
  }

  const dirty = !sameBox(draft, box);
  const hidden = draft.caption === false;

  return (
    <main className="wallish-settings">
      <header className="wallish-settings__bar">
        <button className="wallish-settings__back" type="button" onClick={onBack}>
          ‹ 返回
        </button>
        <h1 className="wallish-settings__title">设置</h1>
      </header>

      <div className="wallish-settings__body">
        <div className="wallish-settings__preview">
          {imageUrl ? (
            <img className="wallish-home__photo" src={imageUrl} alt="" />
          ) : (
            <div className="wallish-home__photo wallish-home__photo--empty">壁纸预览</div>
          )}
        </div>

        <div className="wallish-settings__panel">
          <p className="wallish-settings__hint">改完要点保存，才会换掉桌面壁纸。不显示词条时，桌面只留照片。</p>

          <label className="wallish-settings__toggle">
            <span>不显示词条</span>
            <input
              className="wallish-settings__check"
              type="checkbox"
              checked={hidden}
              onChange={(event) => patch({ caption: !event.target.checked })}
            />
            <span className={hidden ? "wallish-settings__switch wallish-settings__switch--on" : "wallish-settings__switch"} />
          </label>

          {hidden ? null : (
            <>
              <p className="wallish-settings__label">单词条位置</p>
              <div className="wallish-settings__places">
                {POSITIONS.map((item) => (
                  <button
                    key={item.id}
                    className={
                      draft.position === item.id
                        ? "wallish-settings__place wallish-settings__place--on"
                        : "wallish-settings__place"
                    }
                    type="button"
                    onClick={() => patch({ position: item.id })}
                  >
                    <span className={`wallish-settings__mark wallish-settings__mark--${item.id}`} />
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>

              <label className="wallish-settings__color">
                <span className="wallish-settings__label">背景颜色</span>
                <input
                  className="wallish-settings__picker"
                  type="color"
                  value={draft.background}
                  onChange={(event) => patch({ background: event.target.value })}
                />
                <span className="wallish-settings__hex">{String(draft.background || "").toUpperCase()}</span>
              </label>

              <p className="wallish-settings__label">单词条大小</p>
              <div className="wallish-settings__sizes">
                {SIZES.map((item) => (
                  <button
                    key={item.id}
                    className={
                      draft.size === item.id
                        ? "wallish-settings__size wallish-settings__size--on"
                        : "wallish-settings__size"
                    }
                    type="button"
                    onClick={() => patch({ size: item.id })}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="wallish-settings__actions">
        <button className="wallish-settings__save" type="button" disabled={!dirty || saving} onClick={() => onSave(draft)}>
          保存
        </button>
      </div>

      {saving ? <p className="wallish-settings__status">正在更新桌面壁纸…</p> : null}
      {error ? <p className="wallish-home__error">{error}</p> : null}
    </main>
  );
}
