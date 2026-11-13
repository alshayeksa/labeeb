import { useState } from "react";
import { Globe2, Square, TerminalSquare } from "lucide-react";
import { normalizeAddress, safeFrame, utf8Length } from "./bridge";
import { EmptyState } from "./components";
import type { BrowserModel } from "./useBrowser";
export default function AutomationPanel({ model: m }: { model: BrowserModel }) {
  const [url, setUrl] = useState(""),
    [text, setText] = useState(""),
    [key, setKey] = useState("Enter");
  const a = m.snapshot.automation,
    frame = safeFrame(a.frame),
    enabled = a.status === "running" && a.inputVerified && !m.busy;
  const input = (args: Record<string, unknown>) => {
    if (
      args.kind === "text" &&
      utf8Length(JSON.stringify({ kind: "text", text: args.text })) > 4096
    ) {
      m.notify(m.t("inputTooLong"), true);
      return;
    }
    return m.queue("automation_input", args);
  };
  return (
    <div className="content-page automation-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Obscura CDP</p>
          <h1>{m.t("automationTitle")}</h1>
        </div>
        <span
          className={`status-pill ${a.status === "running" ? "online" : ""}`}
        >
          <span className="status-dot" />
          {m.t(
            a.status === "running"
              ? "automationRunning"
              : a.status === "starting"
                ? "automationStarting"
                : a.status === "stopped"
                  ? "automationStopped"
                  : "automationError",
          )}
        </span>
      </div>
      <p className="section-description">{m.t("automationDetail")}</p>
      <div className="automation-controls">
        <button
          className="button primary"
          disabled={m.busy || a.status === "running"}
          onClick={() => void m.run("automation_start")}
        >
          <TerminalSquare size={17} />
          {m.t("startAutomation")}
        </button>
        <button
          className="button"
          disabled={m.busy || a.status === "stopped"}
          onClick={() => void m.run("automation_stop")}
        >
          <Square size={14} />
          {m.t("stopAutomation")}
        </button>
      </div>
      {a.message && (
        <div className="runtime-message" role="status">
          {a.message}
        </div>
      )}
      <form
        className="automation-address"
        onSubmit={(event) => {
          event.preventDefault();
          try {
            void m.queue("automation_navigate", { url: normalizeAddress(url) });
          } catch {
            m.notify(m.t("unavailable"), true);
          }
        }}
      >
        <Globe2 size={17} />
        <input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          aria-label={m.t("automationURL")}
          placeholder="https://example.com"
          dir="ltr"
        />
        <button
          className="button"
          disabled={m.busy || a.status !== "running" || !url.trim()}
        >
          {m.t("navigate")}
        </button>
      </form>
      <div className="screencast">
        {frame ? (
          <img
            src={frame}
            alt={m.t("webContent")}
            onClick={(event) => {
              if (!enabled) return;
              const rect = event.currentTarget.getBoundingClientRect();
              void input({
                kind: "click",
                x: Math.round(
                  ((event.clientX - rect.left) *
                    event.currentTarget.naturalWidth) /
                    rect.width,
                ),
                y: Math.round(
                  ((event.clientY - rect.top) *
                    event.currentTarget.naturalHeight) /
                    rect.height,
                ),
              });
            }}
          />
        ) : (
          <EmptyState
            icon={TerminalSquare}
            title={m.t("noFrame")}
            detail={m.t("noFrameDetail")}
          />
        )}
      </div>
      <div className="input-controls">
        <label>
          {m.t("typeText")}
          <div className="inline-input">
            <input
              value={text}
              maxLength={2048}
              onChange={(event) => setText(event.target.value)}
              disabled={!enabled}
              dir="auto"
            />
            <button
              className="button"
              disabled={!enabled || !text}
              onClick={() => void input({ kind: "text", text })}
            >
              {m.t("enterText")}
            </button>
          </div>
        </label>
        <label>
          {m.t("sendKey")}
          <div className="inline-input">
            <select
              value={key}
              onChange={(event) => setKey(event.target.value)}
              disabled={!enabled}
            >
              {[
                "Enter",
                "Tab",
                "Escape",
                "Backspace",
                "ArrowDown",
                "ArrowUp",
              ].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
            <button
              className="button"
              disabled={!enabled}
              onClick={() => void input({ kind: "key", key })}
            >
              {m.t("send")}
            </button>
          </div>
        </label>
      </div>
      <div className="button-row">
        <button
          className="button"
          disabled={!enabled}
          onClick={() => void input({ kind: "scroll", deltaY: -400 })}
        >
          {m.t("scrollUp")}
        </button>
        <button
          className="button"
          disabled={!enabled}
          onClick={() => void input({ kind: "scroll", deltaY: 400 })}
        >
          {m.t("scrollDown")}
        </button>
      </div>
      <p className="field-hint">
        {m.t(a.inputVerified ? "automationInputHint" : "disabledInput")}
      </p>
    </div>
  );
}
