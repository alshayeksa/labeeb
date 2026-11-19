import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import AssistantPanel from './AssistantPanel';
import { translate } from './i18n';
const transport = vi.hoisted(() => vi.fn());
vi.mock('./chatTransport', () => ({askChat:transport}));
const model = {t:(key:Parameters<typeof translate>[1])=>translate('en',key),locale:'en' as const,notify:vi.fn(),isNative:true,aiConfigured:true,refresh:vi.fn()};
const view = () => render(<AssistantPanel model={model} open onClose={()=>{}} onOpenSettings={()=>{}}/>);
beforeEach(() => { localStorage.clear(); vi.stubGlobal('ResizeObserver',class {observe(){} disconnect(){}}); });
afterEach(() => {cleanup();vi.clearAllMocks();vi.unstubAllGlobals();localStorage.clear();});
function send(text:string) {fireEvent.change(screen.getByRole('textbox'),{target:{value:text}});fireEvent.click(screen.getByRole('button',{name:'Send'}));}
it('keeps partial output when stopped and ignores late completion', async () => {
  let done!: (v:{text:string})=>void; let delta!: (text:string)=>void; let signal!:AbortSignal;
  transport.mockImplementation((_args, s, receive) => { signal=s; delta=receive; return new Promise(resolve=>{done=resolve;}); });
  view(); send('Question');
  act(()=>delta('Partial answer'));
  expect(screen.getByRole('log')).toHaveTextContent('Partial answer');
  fireEvent.click(screen.getByRole('button',{name:'Stop generating'})); expect(signal.aborted).toBe(true);
  await act(async()=>done({text:'Late answer'}));
  expect(screen.getByRole('log')).not.toHaveTextContent('Late answer');
  expect(screen.getByRole('log')).toHaveTextContent('incomplete');
  expect(screen.getByRole('button',{name:'Try again'})).toBeEnabled();
});
it('saves separate conversations, restores them and deletes the selected chat', async () => {
  transport.mockResolvedValue({text:'Answer'});
  const first = view(); send('First question');
  await waitFor(()=>expect(screen.getByRole('log')).toHaveTextContent('Answer'));
  fireEvent.click(screen.getByRole('button',{name:'New chat'})); send('Second question');
  await waitFor(()=>expect(screen.getByRole('log')).toHaveTextContent('Answer'));
  first.unmount(); view();
  expect(screen.getByRole('log')).toHaveTextContent('Second question');
  fireEvent.click(screen.getByRole('button',{name:'Conversations'})); fireEvent.click(screen.getByRole('button',{name:'First question'}));
  expect(screen.getByRole('log')).toHaveTextContent('First question');
  expect(screen.getByRole('log')).not.toHaveTextContent('Second question');
  fireEvent.click(screen.getByRole('button',{name:translate('en','clearConversation')}));
  expect(screen.getByRole('log')).toHaveTextContent('Second question');
});
it('retries a failed question without duplicating it or sending the error as context', async () => {
  transport.mockRejectedValueOnce('AI service unreachable').mockResolvedValue({text:'Recovered'});
  view(); send('Retry question');
  await screen.findByRole('alert'); fireEvent.click(screen.getByRole('button',{name:'Try again'}));
  await waitFor(()=>expect(screen.getByRole('log')).toHaveTextContent('Recovered'));
  expect(transport.mock.calls[1][0]).toEqual({prompt:'Retry question',history:[]});
  expect(screen.getAllByText('Retry question')).toHaveLength(1);
});
