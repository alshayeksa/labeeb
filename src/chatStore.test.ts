import { afterEach, expect, it } from 'vitest';
import { chatHistory, chatKey, readChats } from './chatStore';
afterEach(() => localStorage.clear());
it('restores conversations and marks interrupted responses as stopped', () => {
  localStorage.setItem(chatKey, JSON.stringify({active:'one',items:[{id:'one',title:'Question',draft:'next',messages:[{role:'assistant',text:'partial',status:'streaming'}]}]}));
  const chats = readChats();
  expect(chats.active).toBe('one'); expect(chats.items[0].draft).toBe('next');
  expect(chats.items[0].messages[0].status).toBe('stopped');
});
it('recovers from invalid storage and excludes failed or stopped pairs from context', () => {
  localStorage.setItem(chatKey, '{broken'); expect(readChats().items).toHaveLength(1);
  expect(chatHistory([{role:'user',text:'one'},{role:'assistant',text:'done'}, {role:'user',text:'two'},{role:'assistant',text:'partial',status:'stopped'}]))
    .toEqual([{role:'user',content:'one'},{role:'assistant',content:'done'}]);
});
it('bounds context to 32 messages and 128KB without orphaning turns', () => {
  const messages = Array.from({length:30},() => [{role:'user' as const,text:'question'},{role:'assistant' as const,text:'answer'}]).flat();
  expect(chatHistory(messages)).toHaveLength(32);
  expect(chatHistory([{role:'user',text:'q'}, {role:'assistant',text:'x'.repeat(128000)}])).toEqual([]);
});
