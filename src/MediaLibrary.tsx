import { useEffect, useRef, useState } from "react";
import { Film, Music2, Play, FolderOpen, RefreshCw, Trash2 } from "./icons";
import { command } from "./bridge";
import type { BrowserModel } from "./useBrowser";
import ConfirmDialog from "./ConfirmDialog";
export interface MediaItem {id:string; title:string; path:string; size:number; modified:number; audio:boolean}
function Preview({item, ar}:{item:MediaItem; ar:boolean}) {
  const ref = useRef<HTMLDivElement>(null), [image,setImage] = useState<string | null>(null);
  useEffect(()=>{
    if(item.audio) return;
    let alive = true, requested = false;
    const observer = new IntersectionObserver(entries=>{
      if(requested || !entries.some(e=>e.isIntersecting)) return;
      requested = true; observer.disconnect();
      void command<string | null>('media_thumbnail',{id:item.id}).then(value=>{if(alive && value?.startsWith('data:image/jpeg;base64,'))setImage(value);}).catch(()=>{});
    },{rootMargin:'120px'});
    if(ref.current)observer.observe(ref.current);
    return ()=>{alive=false;observer.disconnect();};
  },[item.id,item.audio,item.modified,item.size]);
  return <div ref={ref} className="media-preview">{image ? <img src={image} alt="" loading="lazy"/> : item.audio ? <Music2 size={42}/> : <Film size={42}/>}<span className="media-format">{item.audio ? (ar ? 'صوت' : 'Audio') : (ar ? 'فيديو' : 'Video')}</span></div>;
}
export default function MediaLibrary({m}:{m:BrowserModel}) {
  const [items,setItems] = useState<MediaItem[]>([]), [loading,setLoading] = useState(true), [error,setError] = useState(false), [query,setQuery] = useState(''), [refresh,setRefresh] = useState(0);
  const ar = m.locale === 'ar';
  const [pendingDelete,setPendingDelete] = useState<MediaItem | null>(null);
  const confirmDelete = async () => {
    const item = pendingDelete; if(!item) return;
    const ok = await m.run('media_delete',{id:item.id}, ar?'نُقل المقطع إلى سلة المحذوفات.':'Moved to the Recycle Bin.');
    setPendingDelete(null); if(ok) setRefresh(v=>v+1);
  };
  const completed = (m.snapshot.video?.jobs.filter(j=>j.status==='completed').map(j=>j.id).join(',') ?? '') + (m.snapshot.downloads ?? []).filter(j=>j.status==='completed').map(j=>j.id).join(',');
  useEffect(()=>{
    let alive = true;
    if(!m.isNative){setLoading(false);return;}
    setLoading(true); setError(false);
    void command<MediaItem[]>('media_list').then(value=>{if(!Array.isArray(value))throw Error('Invalid library response');if(alive)setItems(value);}).catch(()=>{if(alive)setError(true);}).finally(()=>{if(alive)setLoading(false);});
    return ()=>{alive=false;};
  },[completed,refresh,m.isNative]);
  const visible = items.filter(item=>item.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <section className="media-library" aria-label={ar?'مكتبة الفيديو والصوت':'Video and audio library'}>
    <div className="media-library-heading"><div><h2>{ar?'مقاطعك المحمّلة':'Your downloaded media'}</h2><p className="field-hint">{ar?'محفوظة على جهازك ومتاحة بعد إعادة تشغيل المتصفح.':'Saved on your device and available after restarting.'}</p></div>
      <button className="button" disabled={loading} onClick={()=>setRefresh(v=>v+1)} aria-label={ar?'تحديث المكتبة':'Refresh library'}><RefreshCw size={16}/></button></div>
    {items.length>0 && <input className="media-search" aria-label={ar?'ابحث في المقاطع':'Search media'} placeholder={ar?'ابحث باسم الفيديو أو المقطع الصوتي…':'Search videos or audio…'} value={query} onChange={e=>setQuery(e.target.value)}/>}
    {error ? <p role="alert">{ar?'تعذر قراءة المكتبة. اضغط تحديث لإعادة المحاولة.':'Could not load the library. Refresh to retry.'}</p> : loading && !items.length ? <p role="status">{ar?'جارٍ عرض المقاطع…':'Loading media…'}</p> : !visible.length ? <p className="field-hint">{items.length ? (ar?'لا توجد نتائج مطابقة.':'No matching media.') : (ar?'ستظهر مقاطعك هنا بعد اكتمال التحميل من زر الفيديو.':'Your media appears here after downloading from the video button.')}</p> : null}
    <div className="media-grid">{visible.map(item=><article className="media-card" key={item.id}>
      <button className="media-play" aria-label={`${ar?'تشغيل':'Play'} ${item.title}`} onClick={()=>void m.run('media_open',{id:item.id,folder:false})}><Preview item={item} ar={ar}/><span className="media-play-icon"><Play size={24}/></span></button>
      <div className="media-card-body"><h3 dir="auto" title={item.title}>{item.title}</h3><p className="media-details">{(item.size/1024/1024).toFixed(1)} MB · {new Date(item.modified*1000).toLocaleDateString(ar?'ar-SA':'en-US')}</p>
        <div className="button-row"><button className="button primary" disabled={m.busy} onClick={()=>void m.run('media_open',{id:item.id,folder:false})}><Play size={15}/>{ar?'تشغيل':'Play'}</button>
          <button className="button" disabled={m.busy} onClick={()=>void m.run('media_open',{id:item.id,folder:true})}><FolderOpen size={15}/>{ar?'فتح المجلد':'Open folder'}</button>
          <button className="button subtle danger media-delete" disabled={m.busy} title={ar?'حذف إلى سلة المحذوفات':'Delete to Recycle Bin'} aria-label={`${ar?'حذف':'Delete'} ${item.title}`}
            onClick={()=>setPendingDelete(item)}><Trash2 size={15}/>{ar?'حذف':'Delete'}</button></div></div>
    </article>)}</div>
    {pendingDelete && <ConfirmDialog busy={m.busy}
      title={pendingDelete.audio ? (ar?'حذف هذا المقطع الصوتي؟':'Delete this audio file?') : (ar?'حذف هذا الفيديو؟':'Delete this video?')}
      itemName={pendingDelete.title}
      detail={ar?'سيُنقل الملف إلى سلة المحذوفات ويُزال من مكتبتك. يمكنك استرجاعه من السلة ما دامت لم تُفرَّغ.':'The file moves to the Recycle Bin and leaves your library. You can restore it from the Recycle Bin until it is emptied.'}
      confirmLabel={ar?'حذف':'Delete'} cancelLabel={ar?'إلغاء':'Cancel'}
      onConfirm={()=>void confirmDelete()} onCancel={()=>setPendingDelete(null)}/>}
  </section>;
}
