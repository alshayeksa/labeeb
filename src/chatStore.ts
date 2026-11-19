import { utf8Length } from './bridge';
export type Message = { role: 'user' | 'assistant'; text: string; status?: 'streaming' | 'stopped' | 'error'; error?: string };
export type Conversation = { id: string; title: string; messages: Message[]; draft: string };
export type Chats = { active: string; items: Conversation[] };
export const chatKey = 'labeeb.conversations.v1';
export function saveChats(chats: Chats) {
  if (chats.items.every(c => !c.messages.length && !c.draft)) { localStorage.removeItem(chatKey); return; }
  const raw = JSON.stringify(chats);
  if (raw.length > 5_000_000) throw new Error('Chat storage full');
  localStorage.setItem(chatKey, raw);
}
export function newConversation(): Conversation { return { id: crypto.randomUUID(), title: '', messages: [], draft: '' }; }
export function readChats(): Chats {
  try {
    const raw = localStorage.getItem(chatKey);
    if (raw && raw.length <= 5_000_000) {
      const saved = JSON.parse(raw) as Chats;
      if (Array.isArray(saved.items) && saved.items.length && saved.items.every(c => typeof c.id === 'string' && typeof c.title === 'string' && typeof c.draft === 'string' && Array.isArray(c.messages) && c.messages.every(m => ['user', 'assistant'].includes(m.role) && typeof m.text === 'string'))) {
        return { active: saved.items.some(c => c.id === saved.active) ? saved.active : saved.items[0].id,
          items: saved.items.map(c => ({ ...c, messages: c.messages.map(m => ({ ...m, status: m.status === 'streaming' ? 'stopped' : m.status })) })) };
      }
    }
  } catch { /* Recover from unavailable or malformed storage. */ }
  const first = newConversation(); return { active: first.id, items: [first] };
}
export function chatHistory(messages: Message[]) {
  const pairs: { role: 'user' | 'assistant'; content: string }[][] = [];
  for (let i = 0; i + 1 < messages.length; i++) {
    const a = messages[i], b = messages[i + 1];
    if (a.role === 'user' && b.role === 'assistant' && !b.status) { pairs.push([{ role: a.role, content: a.text }, { role: b.role, content: b.text }]); i++; }
  }
  const history: { role: 'user' | 'assistant'; content: string }[] = []; let bytes = 0;
  for (let i = pairs.length - 1; i >= 0 && history.length < 32; i--) {
    const size = pairs[i].reduce((sum, m) => sum + utf8Length(m.content), 0);
    if (bytes + size > 128000) break;
    bytes += size; history.unshift(...pairs[i]);
  }
  return history;
}
