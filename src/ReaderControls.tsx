import { useEffect, useState } from 'react';
import type { Tab } from './bridge';
import { ChevronRight, BookOpen } from './icons';
export interface ReaderScope { targets: {id: string; url: string}[]; consent: boolean; selectionOnly: boolean }
export default function ReaderControls({ar, tabs, activeId, scope, change, busy, onExport, onPrompt}: {
  ar: boolean; tabs: Tab[]; activeId?: string | null; scope: ReaderScope; change: (scope: ReaderScope) => void;
  busy: boolean; onExport: (format: 'csv' | 'json') => void; onPrompt: (prompt: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  useEffect(() => { if (busy) setExpanded(false); }, [busy]);
  const valid = tabs.filter(tab => /^https?:\/\//.test(tab.url));
  const titles = scope.targets.map(target => tabs.find(tab => tab.id === target.id)?.title || target.url).join(' · ');
  return <section className="reader-controls" aria-label={ar ? 'مصادر القراءة' : 'Reading sources'}>
    <div className="reader-source-bar">
      <button type="button" className="reader-source-toggle" aria-expanded={expanded} aria-controls="reader-options"
        aria-label={ar ? 'مصادر القراءة' : 'Reading sources'} title={titles} disabled={busy} onClick={() => setExpanded(value => !value)}>
        <BookOpen size={15}/><span>{titles || (ar ? 'اختر المصادر' : 'Choose sources')}</span>
        <small>{scope.targets.length}/2</small><ChevronRight size={14} className={expanded ? 'is-expanded' : ''}/>
      </button>
      <button type="button" className="reader-current" disabled={busy || !valid.some(t => t.id === activeId && !t.loading)}
        aria-label={ar ? 'اختيار الصفحة الحالية' : 'Select current page'} onClick={() => {
          const tab = valid.find(tab => tab.id === activeId);
          change({...scope, targets: tab ? [{id:tab.id,url:tab.url}] : [], consent:false});
        }}>{ar ? 'الحالية' : 'Current'}</button>
    </div>
    {expanded && <fieldset id="reader-options" className="reader-options" disabled={busy}>
      <legend>{ar ? 'اختر حتى تبويبين' : 'Choose up to two tabs'}</legend>
      <div className="reader-tabs">{valid.map(tab => <label key={tab.id}>
        <input type="checkbox" checked={scope.targets.some(t => t.id === tab.id && t.url === tab.url)}
          disabled={tab.loading || (!scope.targets.some(t => t.id === tab.id) && scope.targets.length >= 2)}
          onChange={e => change({...scope, consent:false, targets:e.target.checked ? [...scope.targets.filter(t => t.id !== tab.id), {id:tab.id,url:tab.url}] : scope.targets.filter(t => t.id !== tab.id)})}/>
        <span title={tab.title}>{tab.title || new URL(tab.url).hostname}</span>
      </label>)}</div>
      {!valid.length && <p>{ar ? 'افتح صفحة ويب لقراءتها.' : 'Open a web page to read it.'}</p>}
      <label><input type="checkbox" checked={scope.selectionOnly} onChange={e => change({...scope, selectionOnly:e.target.checked, consent:false})}/>{ar ? 'النص المحدد فقط' : 'Selected text only'}</label>
      <div className="reader-actions">
        <button type="button" onClick={() => { onPrompt(ar ? 'لخّص الصفحة الحالية في خمس نقاط.' : 'Summarize this page in five points.'); setExpanded(false); }}>{ar ? 'تلخيص' : 'Summarize'}</button>
        <button type="button" onClick={() => { onPrompt(ar ? 'قارن محتوى هذين التبويبين واستخرج الفروقات.' : 'Compare these two tabs and identify differences.'); setExpanded(false); }}>{ar ? 'مقارنة' : 'Compare'}</button>
        <button type="button" onClick={() => { change({...scope, selectionOnly:true, consent:false}); onPrompt(ar ? 'ترجم النص المحدد إلى العربية مع المحافظة على المصطلحات التقنية.' : 'Translate the selected text into Arabic, preserving technical terms.'); setExpanded(false); }}>{ar ? 'ترجمة المحدد' : 'Translate selection'}</button>
        <button type="button" disabled={!scope.targets.length} onClick={() => onExport('csv')}>{ar ? 'حفظ الجداول CSV' : 'Save tables CSV'}</button>
        <button type="button" disabled={!scope.targets.length} onClick={() => onExport('json')}>{ar ? 'حفظ المحتوى JSON' : 'Save content JSON'}</button>
      </div>
      <small>{ar ? 'التصدير محلي. تُستثنى الحقول والإطارات، وقد تكون القراءة جزئية. النص المرئي قد يحتوي بيانات شخصية.' : 'Export stays local. Fields and frames are excluded; extraction may be partial. Visible text may contain personal data.'}</small>
    </fieldset>}
    <label className="reader-consent" title={ar ? 'يُرسل محتوى المصادر المختارة إلى مزود النموذج في هذا الطلب فقط.' : 'Send the selected content to your configured model provider for this request only.'}>
      <input type="checkbox" disabled={busy || !scope.targets.length} checked={scope.consent}
        aria-label={ar ? 'أوافق على إرسال هذا المحتوى في الطلب التالي' : 'Share this content for the next request'}
        onChange={e => change({...scope, consent:e.target.checked})}/>
      <span>{ar ? 'إرسال المحتوى إلى النموذج لهذا الطلب' : 'Share content with the model for this request'}{scope.selectionOnly && <small> · {ar ? 'المحدد فقط' : 'selection only'}</small>}</span>
    </label>
  </section>;
}
