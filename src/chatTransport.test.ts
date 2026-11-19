import { expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ command: vi.fn(), channel: null as null | {onmessage:(event:{started?:boolean;delta?:string})=>void} }));
vi.mock('./bridge', () => ({ command: mock.command }));
vi.mock('@tauri-apps/api/core', () => ({ Channel: class { onmessage = () => {}; constructor() { mock.channel = this; } } }));
import { askChat } from './chatTransport';
it('streams text and cancels even if stopped before native registration', async () => {
  let finish!: (v:{text:string})=>void;
  mock.command.mockImplementation((name:string) => name === 'ai_ask' ? new Promise(resolve => {finish=resolve;}) : Promise.resolve());
  const abort = new AbortController(), receive = vi.fn();
  const pending = askChat({prompt:'hello'},abort.signal,receive);
  mock.channel!.onmessage({delta:'Hello'}); expect(receive).toHaveBeenCalledWith('Hello');
  abort.abort(); mock.channel!.onmessage({started:true}); mock.channel!.onmessage({delta:'late'});
  expect(mock.command.mock.calls.filter(c=>c[0]==='ai_cancel')).toHaveLength(2);
  expect(receive).toHaveBeenCalledTimes(1);
  finish({text:'Hello'}); await pending;
});
