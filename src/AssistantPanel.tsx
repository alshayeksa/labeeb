import { useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  ArrowUp,
  KeyRound,
  LoaderCircle,
  PanelRightClose,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import { command, utf8Length } from "./bridge";
import type { BrowserModel } from "./useBrowser";
import { IconButton } from "./components";
export default function AssistantPanel({
  model: m,
  onClose,
}: {
  model: BrowserModel;
  onClose: () => void;
}) {
  const [prompt, setPrompt] = useState(""),
    [messages, setMessages] = useState<
      { role: "user" | "assistant"; text: string }[]
    >([]),
    [thinking, setThinking] = useState(false);
  const pending = useRef(false);
  const ask = async (event: FormEvent) => {
    event.preventDefault();
    const question = prompt.trim();
    if (!question || pending.current) return;
    if (utf8Length(question) > 16000) {
      m.notify(m.t("promptTooLong"), true);
      return;
    }
    if (!m.isNative) {
      m.notify(m.t("nativeRequired"), true);
      return;
    }
    if (!m.snapshot.settings.aiConfigured) {
      m.notify(m.t("configureFirst"), true);
      return;
    }
    pending.current = true;
    setThinking(true);
    setPrompt("");
    setMessages((prev) => [...prev, { role: "user", text: question }]);
    try {
      const answer = await command<{ text: string }>("ai_ask", {
        prompt: question,
      });
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: answer.text },
      ]);
      await m.refresh(true);
    } catch (error) {
      m.notify(`${m.t("aiError")} ${String(error)}`, true);
    } finally {
      pending.current = false;
      setThinking(false);
    }
  };
  return (
    <aside className="assistant-panel" aria-label={m.t("assistant")}>
      <div className="assistant-header">
        <div>
          <span className="assistant-avatar">
            <Sparkles size={18} />
          </span>
          <strong>{m.t("assistant")}</strong>
        </div>
        <IconButton label={m.t("close")} onClick={onClose}>
          <PanelRightClose size={18} />
        </IconButton>
      </div>
      <div className="assistant-messages" aria-live="polite">
        {messages.length === 0 ? (
          <div className="assistant-intro">
            <span className="assistant-orb">
              <Sparkles size={28} />
            </span>
            <h2>{m.t("aiIntro")}</h2>
            <p>{m.t("aiDescription")}</p>
            <div className="assistant-security">
              <ShieldCheck size={16} />
              <span>{m.t("contextHint")}</span>
            </div>
          </div>
        ) : (
          messages.map((message, index) => (
            <article key={index} className={`chat-message ${message.role}`}>
              <small>
                {m.t(message.role === "assistant" ? "assistant" : "you")}
              </small>
              <p dir="auto">{message.text}</p>
            </article>
          ))
        )}
        {thinking && (
          <div className="thinking">
            <LoaderCircle size={15} className="spin" />
            {m.t("thinking")}
          </div>
        )}
      </div>
      {messages.length > 0 && (
        <button
          className="clear-chat"
          disabled={thinking}
          onClick={() => setMessages([])}
        >
          <Trash2 size={13} />
          {m.t("clearConversation")}
        </button>
      )}
      <form className="chat-composer" onSubmit={ask}>
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder={m.t("aiPlaceholder")}
          aria-label={m.t("aiPlaceholder")}
          rows={3}
          maxLength={16000}
          dir="auto"
        />
        <div>
          <span>
            <KeyRound size={12} />
            {m.t("approvalRequired")}
          </span>
          <button
            type="submit"
            disabled={thinking || !prompt.trim()}
            aria-label={m.t("send")}
            title={m.t("send")}
          >
            <ArrowUp size={18} />
          </button>
        </div>
      </form>
      <p className="chat-footnote">{m.t("contextHint")}</p>
    </aside>
  );
}
