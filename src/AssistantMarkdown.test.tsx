import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';
import AssistantMarkdown from './AssistantMarkdown';
import {assistantWidth} from './useAssistantWidth';
import {pageLink} from './AssistantMarkdown';
afterEach(cleanup);
it('opens web links through Labeeb only on activation, including plain URLs', () => {
  const open = vi.fn();
  render(<AssistantMarkdown text={'[Example](https://example.com/page)\n\nhttps://example.org/path'} onOpenLink={open}/>);
  expect(open).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('link',{name:'Example'}));
  expect(open).toHaveBeenCalledWith('https://example.com/page');
  fireEvent(screen.getByRole('link',{name:'https://example.org/path'}),new MouseEvent('auxclick',{button:1,bubbles:true,cancelable:true}));
  expect(open).toHaveBeenLastCalledWith('https://example.org/path');
});
it('rejects executable, file, credential-bearing and relative links', () => {
  for (const url of ['javascript:alert(1)','data:text/html,x','file:///C:/secret','https://user:secret@example.com','/relative','//example.com']) expect(pageLink(url)).toBeNull();
  expect(pageLink('https://example.com')).toBe('https://example.com/');
});
it('renders lists, emphasis and tables without active HTML, links or remote images', () => {
  const {container} = render(<AssistantMarkdown text={'## Summary\n\n- **Important** item\n- Second\n\n| Name | Amount |\n| --- | --- |\n| A | 42 |\n\n<img src=x onerror=alert(1)>\n\n![tracker](https://example.com/pixel)\n\n[Click](javascript:alert(1))'}/>);
  expect(screen.getByRole('heading')).toHaveTextContent('Summary');
  expect(screen.getAllByRole('listitem')).toHaveLength(2);
  expect(container.querySelector('strong')).toHaveTextContent('Important');
  expect(screen.getByRole('table')).toHaveTextContent('42');
  expect(container.querySelector('script,img,a')).toBeNull();
});
it('bounds sidebar widths while reserving the page area', () => {
  expect(assistantWidth(900,1920)).toBe(720);
  expect(assistantWidth(900,900)).toBe(500);
  expect(assistantWidth(100,900)).toBe(280);
  expect(assistantWidth(NaN,1200)).toBe(380);
});
