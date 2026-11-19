import { Channel } from '@tauri-apps/api/core';
import { command } from './bridge';
export async function askChat(args: Record<string, unknown>, signal: AbortSignal, receive: (text: string) => void) {
  const requestId = crypto.randomUUID();
  const channel = new Channel<{ started?: boolean; delta?: string }>();
  const cancel = () => { void command('ai_cancel', { requestId }).catch(() => {}); };
  channel.onmessage = event => {
    if (signal.aborted) { if (event.started) cancel(); return; }
    if (event.delta) receive(event.delta);
  };
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  signal.addEventListener('abort', cancel, { once: true });
  try { return await command<{ text: string }>('ai_ask', { ...args, requestId, onChunk: channel }); }
  finally { signal.removeEventListener('abort', cancel); }
}
