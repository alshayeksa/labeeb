import { lazy, memo, Suspense, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  ArrowUp,
  KeyRound,
  LoaderCircle,
  PanelRightClose,
  Sparkles,
  Trash2,
  Plus,
  Clock3,
  RefreshCw,
} from "./icons";
import { command, utf8Length } from "./bridge";
import { assistantErrorKey } from "./assistantError";
import type { BrowserModel } from "./useBrowser";
import { IconButton } from "./components";
import { useAssistantWidth } from './useAssistantWidth';
import type { Tab } from './bridge';
import { requestsCurrentPage, readerError } from './pageReader';
import { saveChats, readChats, newConversation, chatHistory } from './chatStore';
import type { Message } from './chatStore';
import { askChat } from './chatTransport';
import CopyButton from './CopyButton';
const AssistantMarkdown = lazy(() => import('./AssistantMarkdown'));
export default memo(function AssistantPanel({
  model: m,
  onClose,
  onOpenSettings,
  onOpenLink,
  open,
  tabs = [], activeId,
}: {
  model: Pick<BrowserModel, "t" | "notify" | "isNative" | "refresh" | "locale"> & { aiConfigured: boolean };
  open: boolean;
  tabs?: Tab[]; activeId?: string | null;
  onClose: () => void;
  onOpenSettings: () => void;
  onOpenLink?: (url: string) => Promise<void>;
}) {
  const ar = m.locale === 'ar';
  const openLink = async (url: string) => {
    if (!m.isNative) { m.notify(m.t('nativeRequired'), true); return; }
    try { if (onOpenLink) await onOpenLink(url); else { await command('tab_create', {url}); await m.refresh(true); } }
    catch { m.notify(ar ? 'تعذّر فتح الرابط. حاول مجددًا.' : 'Could not open the link. Try again.', true); }
  };

  const {width, handle} = useAssistantWidth(ar);
  const [chats, setChats] = useState(readChats);
  const current = chats.items.find(c => c.id === chats.active)!;
  const messages = current.messages, prompt = current.draft;
  const setPrompt = (draft: string) => setChats(state => ({ ...state, items: state.items.map(c => c.id === state.active ? { ...c, draft } : c) }));
  const setMessages = (next: Message[] | ((old: Message[]) => Message[])) => setChats(state => ({ ...state, items: state.items.map(c => c.id === state.active ? { ...c, messages: typeof next === 'function' ? next(c.messages) : next } : c) }));
  const [thinking, setThinking] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [storageFailed, setStorageFailed] = useState(false);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => { try { saveChats(chats); setStorageFailed(false); } catch { setStorageFailed(true); } }, 250);
    return () => clearTimeout(timer);
  }, [chats]);
  const latestChats = useRef(chats); latestChats.current = chats;
  useEffect(() => {
    const save = () => { try { saveChats(latestChats.current); } catch { /* The visible warning handles storage failures. */ } };
    window.addEventListener('pagehide', save);
    return () => { pending.current?.abort(); save(); window.removeEventListener('pagehide', save); };
  }, []);
  const startNew = () => { const next = newConversation(); setChats(state => ({ active: next.id, items: [next, ...state.items.filter(c => c.messages.length || c.draft)] })); setShowHistory(false); };
  const removeCurrent = () => setChats(state => { const remaining = state.items.filter(c => c.id !== state.active); const items = remaining.length ? remaining : [newConversation()]; return { items, active: items[0].id }; });
  const stop = () => { pending.current?.abort(); pending.current = null; setThinking(false); setMessages(old => old.map(message => message.status === 'streaming' ? { ...message, status: 'stopped' } : message)); };
  const input = useRef<HTMLTextAreaElement>(null);
  const messagesArea = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);
  const [atBottom, setAtBottom] = useState(true);
  const jumpToLatest = () => { followLatest.current = true; setAtBottom(true); if (messagesArea.current) messagesArea.current.scrollTop = messagesArea.current.scrollHeight; };
  useEffect(() => {
    const area = input.current;
    if (area) { area.style.height = 'auto'; area.style.height = `${Math.min(area.scrollHeight, 120)}px`; }
  }, [prompt, open, width]);
  useEffect(() => {
    const area = messagesArea.current;
    if (!open || !area) return;
    const observer = new ResizeObserver(() => { if (followLatest.current) area.scrollTop = area.scrollHeight; });
    observer.observe(area);
    if (area.firstElementChild) observer.observe(area.firstElementChild);
    return () => observer.disconnect();
  }, [open, messages]);
  useEffect(() => { if (open && m.aiConfigured) input.current?.focus(); }, [open, m.aiConfigured]);
  useEffect(() => {
    const area = messagesArea.current;
    if (open && area && followLatest.current) area.scrollTop = area.scrollHeight;
  }, [messages, thinking, open]);
  const ask = async (event: FormEvent) => { event.preventDefault(); await send(prompt.trim()); };
  const send = async (question: string, base: Message[] = messages) => {
    if (!question || pending.current) return;
    if (utf8Length(question) > 16000) {
      m.notify(m.t("promptTooLong"), true);
      return;
    }
    if (!m.isNative) {
      m.notify(m.t("nativeRequired"), true);
      return;
    }
    if (!m.aiConfigured) {
      m.notify(m.t("configureFirst"), true);
      return;
    }
    const readPage = requestsCurrentPage(question);
    const activeTab = tabs.find(tab => tab.id === activeId);
    if (readPage && (!activeTab || !/^https?:\/\//i.test(activeTab.url))) {
      m.notify(ar ? 'افتح صفحة ويب أولًا ثم اطلب قراءتها.' : 'Open a web page first, then ask me to read it.', true);
      return;
    }
    const controller = new AbortController(); pending.current = controller;
    setThinking(true); followLatest.current = true; setAtBottom(true);
    setPrompt("");
    // Resubmitting the restored draft retries the failed turn rather than duplicating it.
    if (base.at(-1)?.status && base.at(-2)?.role === 'user' && base.at(-2)?.text === question) base = base.slice(0, -2);
    const prefix: Message[] = [...base, { role: 'user', text: question }];
    let partial = '';
    setMessages([...prefix, { role: 'assistant', text: '', status: 'streaming' }]);
    setChats(state => ({ ...state, items: state.items.map(c => c.id === state.active && !c.title ? { ...c, title: question.slice(0, 70) } : c) }));
    try {
      const answer = await askChat({ prompt: question, history: chatHistory(base),
        ...(readPage && activeTab ? { targets: [{ id: activeTab.id, url: activeTab.url }], selectionOnly: false, consent: true } : {}),
      }, controller.signal, delta => {
        if (pending.current !== controller || controller.signal.aborted) return;
        partial += delta;
        setMessages([...prefix, { role: 'assistant', text: partial, status: 'streaming' }]);
      });
      if (pending.current !== controller || controller.signal.aborted) return;
      setMessages([...prefix, { role: 'assistant', text: answer.text }]);
    } catch (error) {
      if (pending.current !== controller || controller.signal.aborted) return;
      const detail = String(error).includes('READER_') ? readerError(error, ar) : m.t(assistantErrorKey(error));
      setMessages([...prefix, { role: 'assistant', text: partial, status: 'error', error: detail }]);
      if (!partial) setChats(state => ({ ...state, items: state.items.map(c => c.id === state.active ? { ...c, draft: c.draft || question } : c) }));
      m.notify(detail, true);
    } finally {
      if (pending.current === controller) { pending.current = null; setThinking(false); }
    }
  };
  const retry = () => { const last = messages.map(m => m.role).lastIndexOf('user'); if (last >= 0) void send(messages[last].text, messages.slice(0, last)); };
  if (!open) return null;
  return (
    <aside id="assistant-panel" className="assistant-panel" style={{width}} aria-label={m.t("assistant")}>
      <div className="assistant-resizer" role="separator" aria-orientation="vertical" tabIndex={0}
        aria-label={ar ? 'تغيير عرض المساعد' : 'Resize assistant'} aria-valuenow={width} aria-valuemin={280} aria-valuemax={Math.max(280, Math.min(720, window.innerWidth - 400))}
        title={ar ? 'اسحب لتغيير العرض · نقرتان لإعادة الضبط' : 'Drag to resize · double-click to reset'} {...handle}/>
      <div className="assistant-header">
        <div>
          <span className="assistant-avatar">
            <Sparkles size={18} />
          </span>
          <strong>{m.t("assistant")}</strong>
        </div>
        <div>
        {messages.length > 0 && <IconButton label={m.t('clearConversation')} disabled={thinking} onClick={removeCurrent}><Trash2 size={15}/></IconButton>}
        <IconButton label={m.t("close")} onClick={onClose}>
          <PanelRightClose size={18} />
        </IconButton>
        </div>
      </div>
      <div className="conversation-toolbar">
        <button type="button" disabled={thinking} onClick={startNew}><Plus size={15}/>{ar ? 'محادثة جديدة' : 'New chat'}</button>
        <button type="button" disabled={thinking} aria-expanded={showHistory} onClick={() => setShowHistory(!showHistory)}><Clock3 size={15}/>{ar ? 'المحادثات' : 'Conversations'}</button>
      </div>
      {showHistory && <nav className="conversation-list" aria-label={ar ? 'المحادثات' : 'Conversations'}>
        {chats.items.map(c => <button key={c.id} type="button" disabled={thinking} aria-current={c.id === chats.active ? 'page' : undefined} onClick={() => { setChats(state => ({ ...state, active: c.id })); setShowHistory(false); followLatest.current = true; }}>
          <span dir="auto">{c.title || (ar ? 'محادثة جديدة' : 'New chat')}</span>
        </button>)}
      </nav>}
      {storageFailed && <p className="chat-error" role="alert">{ar ? 'تعذّر حفظ المحادثات على جهازك. وفّر مساحة قبل إغلاق لبيب.' : 'Could not save chats on this device. Free some space before closing Labeeb.'}</p>}
      <div className={`assistant-chat-container ${messages.length === 0 ? 'is-empty' : ''}`}>
      <div ref={messagesArea} className="assistant-messages" role="log" aria-label={m.t("assistant")} aria-live="polite" aria-relevant="additions text"
        onScroll={event => { const el=event.currentTarget; const near=el.scrollHeight-el.scrollTop-el.clientHeight < 48; followLatest.current=near; setAtBottom(near); }}>
        <div className="assistant-transcript">
        {messages.length === 0 ? (
          <div className="assistant-intro">
            <h2>{ar ? 'بماذا نبدأ؟' : 'Where should we begin?'}</h2>
          </div>
        ) : (
          messages.map((message, index) => (
            <article key={index} className={`chat-message ${message.role}`}>
              <small>
                {m.t(message.role === "assistant" ? "assistant" : "you")}
              </small>
              {message.role === 'assistant' ? <Suspense fallback={<p dir="auto">{message.text}</p>}><AssistantMarkdown text={message.text} ar={ar} onOpenLink={url => void openLink(url)}/></Suspense> : <p dir="auto">{message.text}</p>}
              {message.status === 'stopped' && <p className="chat-note">{ar ? 'تم الإيقاف — هذه الإجابة غير مكتملة.' : 'Stopped - this answer is incomplete.'}</p>}
              {message.status === 'error' && <p className="chat-error" role="alert">{message.error}</p>}
              <div className="chat-message-actions">
                {!!message.text && <CopyButton text={message.text} ar={ar}/>}
                {message.role === 'assistant' && index === messages.length - 1 && !thinking && <button type="button" onClick={retry}><RefreshCw size={13}/>{ar ? 'إعادة المحاولة' : 'Try again'}</button>}
              </div>
            </article>
          ))
        )}
        {thinking && !messages.at(-1)?.text && (
          <div className="thinking">
            <LoaderCircle size={15} className="spin" />
            {m.t("thinking")}
          </div>
        )}
        </div>
      </div>
      {!atBottom && messages.length > 0 && <button type="button" className="assistant-jump" onClick={jumpToLatest}>{ar ? '↓ آخر إجابة' : '↓ Latest answer'}</button>}
      <div className="assistant-compose-area">
      {!m.aiConfigured && (
        <div className="assistant-connection" role="status">
          <p id="assistant-connection-hint">{m.t("configureFirst")}</p>
          <button type="button" className="button subtle" onClick={onOpenSettings}>
            <KeyRound size={14} />{m.t("connectModel")}
          </button>
        </div>
      )}
      <form className="chat-composer" onSubmit={ask}>
        <p id="assistant-send-hint" className="composer-hint">{m.t("assistantSendHint")}</p>
        <textarea
          ref={input}
          disabled={!m.aiConfigured}
          aria-describedby={`assistant-send-hint${m.aiConfigured ? "" : " assistant-connection-hint"}`}
          onKeyDown={event => {
            if (!event.nativeEvent.isComposing && event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              const form = event.currentTarget.form;
              if (form?.requestSubmit) form.requestSubmit();
              else form?.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
            }
          }}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder={ar ? 'اسأل لبيب' : 'Ask Labeeb'}
          aria-label={m.t("aiPlaceholder")}
          rows={1}
          maxLength={16000}
          dir={prompt.trim() ? 'auto' : ar ? 'rtl' : 'ltr'}
        />
        <div>
          {thinking ? <button type="button" onClick={stop} aria-label={ar ? 'إيقاف التوليد' : 'Stop generating'} title={ar ? 'إيقاف التوليد' : 'Stop generating'}><span aria-hidden="true">&#9632;</span></button> : <button type="submit" disabled={!m.aiConfigured || !prompt.trim()} aria-label={m.t("send")} title={m.t("send")}><ArrowUp size={18}/></button>}

        </div>
      </form>
      {messages.length === 0 && m.aiConfigured && <div className="chat-starters"><button type="button" onClick={() => { setPrompt(ar ? 'ماذا يمكنك أن تفعل؟' : 'What can you do?'); input.current?.focus(); }}>{ar ? 'ماذا يمكنك أن تفعل؟' : 'What can you do?'}</button></div>}
      <p className="chat-footnote" title={m.t('contextHint')}>{ar ? 'قد يخطئ المساعد. تحقّق من المعلومات المهمة.' : 'AI can make mistakes. Check important information.'}</p>
      </div>
      </div>
    </aside>
  );
});
