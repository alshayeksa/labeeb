import { memo } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import CopyButton from './CopyButton';
// Model output cannot run HTML/scripts. Only explicit HTTP(S) links are actionable.
export function pageLink(value?: string) {
  if (!value) return null;
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; }
}
export default memo(function AssistantMarkdown({text, ar = false, onOpenLink}: {text: string; ar?: boolean; onOpenLink?: (url: string) => void}) {
  return <div className="assistant-markdown" dir="auto"><Markdown remarkPlugins={[remarkGfm]} skipHtml
    components={{img: () => null, a: ({children, href}) => {
      const url = pageLink(href);
      return url && onOpenLink ? <a href={url} title={url} onClick={event => { event.preventDefault(); onOpenLink(url); }} onAuxClick={event => { event.preventDefault(); if (event.button === 1) onOpenLink(url); }}>{children}</a> : <span>{children}</span>;
    },
      pre: ({children, node}) => <div className="chat-code"><div className="chat-code-toolbar"><CopyButton ar={ar} text={node?.children.map(child => 'children' in child ? child.children.map(c => 'value' in c ? c.value : '').join('') : '').join('') ?? ''}/></div><pre dir="ltr">{children}</pre></div>,
      table: ({children}) => <div className="assistant-table-scroll" tabIndex={0}><table>{children}</table></div>}}>{text}</Markdown></div>;
});
