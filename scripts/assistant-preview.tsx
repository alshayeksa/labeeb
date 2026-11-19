// Development-only fixture: no credentials, providers or real page content.
import React from 'react';
import {createRoot} from 'react-dom/client';
import AssistantPanel from '../src/AssistantPanel';
import {translate} from '../src/i18n';
import '../src/styles.css';
import '@fontsource/tajawal/400.css';
import '@fontsource/tajawal/700.css';
const answer = '## ملخص الصفحة\n\nهذه **إجابة تجريبية** لاختبار عرض النص داخل المساعد.\n\n' + Array.from({length:10},(_,i)=> `${i+1}. تظهر المعلومات بوضوح وتُرتّب في نقاط قابلة للقراءة، مع الاحتفاظ بمساحة واسعة للمحادثة.`).join('\n') + '\n\n| البند | القيمة |\n| --- | --- |\n| بيانات تجريبية | 1,250 ريال |\n| إجمالي تجريبي | 2,500 ريال |\n\n**نهاية الإجابة التجريبية.**';
const cancelled = new Set<string>();
Object.assign(window, {__TAURI_INTERNALS__: {
  transformCallback: () => 1, unregisterCallback: () => {},
  invoke: async (name: string, args: {requestId: string; onChunk: {onmessage: (event: {started?: boolean; delta?: string}) => void}}) => {
    if (name === 'ai_cancel') { cancelled.add(args.requestId); return; }
    args.onChunk.onmessage({started:true});
    for (let i = 0; i < answer.length; i += 45) {
      await new Promise(resolve => setTimeout(resolve, 35));
      if (cancelled.has(args.requestId)) throw Error('AI_CANCELLED');
      args.onChunk.onmessage({delta:answer.slice(i, i + 45)});
    }
    return {text:answer};
  },
}});
const model = {locale:'ar' as const, t:(key:Parameters<typeof translate>[1])=>translate('ar',key), notify:()=>{}, refresh:async()=>{}, isNative:true, aiConfigured:true};
createRoot(document.getElementById('root')!).render(<div style={{display:'flex',height:'100vh'}}>
  <main style={{flex:1,display:'grid',placeItems:'center'}}><h1>معاينة لبيب · بيانات تجريبية</h1></main>
  <AssistantPanel model={model} open onClose={()=>{}} onOpenSettings={()=>{}} tabs={[{id:'fixture',title:'صفحة تجريبية',url:'https://example.test/'}]} activeId="fixture"/>
</div>);
