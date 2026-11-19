import { useState } from "react";
import { ExternalLink, FileDown, Film, FolderOpen, Music2, RotateCcw, Trash2, X, Zap } from "./icons";
import type { BrowserModel } from "./useBrowser";
import type { Download, VideoJob } from "./bridge";
import ConfirmDialog from "./ConfirmDialog";

/** Sizes in the units people read: 1.4 GB, 312 MB, 87 KB. */
export function formatBytes(bytes: number, ar: boolean): string {
  const units = ar ? ["بايت", "ك.ب", "م.ب", "ج.ب", "ت.ب"] : ["B", "KB", "MB", "GB", "TB"];
  let value = Math.max(0, bytes), unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
  return `${unit === 0 ? Math.round(value) : value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}
/** Time left as the largest two units: 1 h 12 min, 3 min 20 s, 45 s. */
export function formatDuration(seconds: number, ar: boolean): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  const [uh, um, us] = ar ? ["س", "د", "ث"] : ["h", "min", "s"];
  if (h) return `${h} ${uh} ${m} ${um}`;
  if (m) return `${m} ${um} ${s} ${us}`;
  return `${s} ${us}`;
}

type Row = { key: string; started: number } & ({ kind: "file"; item: Download } | { kind: "video"; job: VideoJob });
const finished = (status: string) => ["completed", "failed", "cancelled"].includes(status);

/**
 * One list for everything being downloaded or recently downloaded — videos and
 * ordinary files together, newest first — with progress, cancel, and removal.
 */
export default function DownloadsList({ m }: { m: BrowserModel }) {
  const ar = m.locale === "ar";
  const text = (a: string, e: string) => (ar ? a : e);
  const [confirmDelete, setConfirmDelete] = useState<Download | null>(null);
  const rows: Row[] = [
    ...(m.snapshot.downloads ?? []).map((item): Row => ({ kind: "file", key: item.id, started: item.startedMs ?? 0, item })),
    ...(m.snapshot.video?.jobs ?? []).map((job): Row => ({ kind: "video", key: job.id, started: job.startedMs ?? 0, job })),
  ];
  // Newest first; records without a start time keep their arrival order, latest on top.
  const ordered = rows.map((row, index) => ({ row, index })).sort((a, b) => (b.row.started - a.row.started) || (b.index - a.index)).map(entry => entry.row);
  if (!ordered.length) return null;
  const anyFinished = ordered.some(row => finished(row.kind === "file" ? row.item.status : row.job.status));
  const labels: Record<string, string> = {
    queued: text("في الانتظار", "Queued"), preparing: text("تجهيز أدوات التحميل…", "Preparing download tools…"),
    pending: text("في الانتظار", "Queued"), running: text("جارٍ التنزيل", "Downloading"), merging: text("تجهيز الملف النهائي", "Finishing file"),
    completed: text("اكتمل", "Completed"), failed: text("تعذر التنزيل", "Failed"), cancelled: text("أُلغي", "Cancelled"),
  };
  const dismiss = (id: string) => void m.run("download_dismiss", { id });
  const dismissButton = (id: string, name: string) => (
    <button type="button" className="icon-button" title={text("إزالة من القائمة (يبقى الملف)", "Remove from list (keeps the file)")}
      aria-label={`${text("إزالة من القائمة", "Remove from list")}: ${name}`} disabled={m.busy} onClick={() => dismiss(id)}><X size={16} /></button>
  );

  const fileRow = (item: Download) => {
    const active = item.status === "running" || item.status === "pending";
    const received = item.receivedBytes ?? 0, total = item.totalBytes ?? 0, speed = item.bytesPerSecond ?? 0;
    const percent = total > 0 ? Math.min(100, Math.floor((received / total) * 100)) : null;
    const parts: string[] = [];
    const fast = active && (item.connections ?? 0) > 1;
    if (active) {
      if (percent !== null) parts.push(`${percent}%`);
      parts.push(total > 0 ? `${formatBytes(received, ar)} ${text("من", "of")} ${formatBytes(total, ar)}` : formatBytes(received, ar));
      if (speed > 0) parts.push(`${formatBytes(speed, ar)}${text("/ث", "/s")}`);
      if (speed > 0 && total > received) parts.push(`${text("المتبقي", "left")} ${formatDuration((total - received) / speed, ar)}`);
    } else if (item.status === "completed" && total > 0) parts.push(formatBytes(total, ar));
    return (
      <article className={`dl-row ${item.status}`} key={item.id}>
        <span className="dl-icon"><FileDown size={20} aria-hidden="true" /></span>
        <div className="dl-main">
          <strong dir="auto" title={item.name}>{item.name}</strong>
          <span className="dl-source" dir="ltr" title={item.url}>{item.url}</span>
          <div className="dl-status"><span className="dl-state">{labels[item.status] ?? item.status}</span>
            {fast && <span className="dl-fast" title={text("الملف يُنزَّل على عدة اتصالات في وقت واحد", "The file is being fetched over several connections at once")}><Zap size={13} aria-hidden="true" />{text(`تنزيل سريع · ${item.connections} اتصالات`, `Accelerated · ${item.connections} connections`)}</span>}
            {parts.map(part => <span key={part} dir="auto">{part}</span>)}</div>
          {active && (percent !== null
            ? <progress max={100} value={percent} aria-label={`${text("تقدم التنزيل", "Download progress")}: ${item.name}`} />
            : <progress aria-label={`${text("تقدم التنزيل", "Download progress")}: ${item.name}`} />)}
          {item.error && <p className="dl-error" role="status">{item.error}</p>}
        </div>
        <div className="dl-actions">
          {active && <button type="button" className="button" disabled={m.busy} onClick={() => void m.run("download_cancel", { id: item.id })}>{text("إلغاء", "Cancel")}</button>}
          {item.status === "completed" && <>
            <button type="button" className="button primary" disabled={m.busy} onClick={() => void m.run("download_open", { id: item.id })}><ExternalLink size={15} />{text("فتح", "Open")}</button>
            <button type="button" className="button" disabled={m.busy} onClick={() => void m.run("download_reveal", { id: item.id })}><FolderOpen size={15} />{text("فتح المجلد", "Show in folder")}</button>
            <button type="button" className="icon-button danger" title={text("حذف الملف إلى سلة المحذوفات", "Delete file to Recycle Bin")}
              aria-label={`${text("حذف الملف", "Delete file")}: ${item.name}`} disabled={m.busy} onClick={() => setConfirmDelete(item)}><Trash2 size={16} /></button>
          </>}
          {!item.native && ["failed", "cancelled"].includes(item.status) && <button type="button" className="button" disabled={m.busy} onClick={() => void m.run("download_retry", { id: item.id })}><RotateCcw size={15} />{text("إعادة المحاولة", "Retry")}</button>}
          {!active && dismissButton(item.id, item.name)}
        </div>
      </article>
    );
  };

  const videoRow = (job: VideoJob) => {
    const active = !finished(job.status);
    const moving = ["running", "merging"].includes(job.status);
    const parts: string[] = [job.quality === "audio" ? text("صوت M4A", "Audio M4A") : `${job.quality}p`];
    if (moving) {
      parts.push(`${Math.round(job.percent)}%`);
      if (job.speed && job.speed !== "NA") parts.push(job.speed.trim());
      if (job.eta && job.eta !== "NA") parts.push(`${text("المتبقي", "left")} ${job.eta.trim()}`);
    }
    return (
      <article className={`dl-row ${job.status}`} key={job.id}>
        <span className="dl-icon">{job.quality === "audio" ? <Music2 size={20} aria-hidden="true" /> : <Film size={20} aria-hidden="true" />}</span>
        <div className="dl-main">
          <strong dir="auto" title={job.title}>{job.title}</strong>
          <span className="dl-source" dir="auto" title={job.folder}>{job.folder}</span>
          <div className="dl-status"><span className="dl-state">{labels[job.status] ?? job.status}</span>{parts.map(part => <span key={part} dir="ltr">{part}</span>)}</div>
          {active && (moving
            ? <progress max={100} value={job.percent} aria-label={`${text("تقدم تحميل الفيديو", "Video download progress")}: ${job.title}`} />
            : <progress aria-label={`${text("تقدم تحميل الفيديو", "Video download progress")}: ${job.title}`} />)}
          {job.status === "preparing" && <p className="field-hint">{text("تنزيل الأدوات والتحقق من سلامتها. يمكنك متابعة التصفح.", "Downloading and verifying tools. You can continue browsing.")}</p>}
          {job.error && <p className="dl-error" role="status">{job.error}</p>}
        </div>
        <div className="dl-actions">
          {active && <button type="button" className="button" disabled={m.busy} onClick={() => void m.run("video_cancel", { id: job.id })}>{text("إلغاء", "Cancel")}</button>}
          {["failed", "cancelled"].includes(job.status) && <button type="button" className="button" disabled={m.busy} onClick={() => void m.run("video_start", { url: job.url, quality: job.quality, folder: job.folder })}><RotateCcw size={15} />{text("إعادة المحاولة", "Retry")}</button>}
          {!active && dismissButton(job.id, job.title)}
        </div>
      </article>
    );
  };

  return (
    <section className="dl-list" aria-label={text("التنزيلات الجارية والأخيرة", "Current and recent downloads")}>
      <div className="dl-heading">
        <h2>{text("التنزيلات الجارية والأخيرة", "Current and recent downloads")}</h2>
        <button type="button" className="button subtle" disabled={m.busy || !anyFinished}
          title={text("يزيل السجلات المنتهية من القائمة ولا يحذف أي ملف", "Removes finished records from the list; no files are deleted")}
          onClick={() => void m.run("downloads_clear")}>{text("مسح القائمة", "Clear list")}</button>
      </div>
      <div className="dl-rows">{ordered.map(row => (row.kind === "file" ? fileRow(row.item) : videoRow(row.job)))}</div>
      {confirmDelete && <ConfirmDialog busy={m.busy}
        title={text("حذف هذا الملف؟", "Delete this file?")}
        itemName={confirmDelete.name}
        detail={text("سيُنقل الملف إلى سلة المحذوفات ويُزال من قائمة التنزيلات. يمكنك استرجاعه من السلة ما دامت لم تُفرَّغ.", "The file moves to the Recycle Bin and leaves the downloads list. You can restore it from the Recycle Bin until it is emptied.")}
        confirmLabel={text("حذف", "Delete")} cancelLabel={text("إلغاء", "Cancel")}
        onConfirm={async () => { const id = confirmDelete.id; await m.run("download_delete", { id }, text("نُقل الملف إلى سلة المحذوفات.", "Moved to the Recycle Bin.")); setConfirmDelete(null); }}
        onCancel={() => setConfirmDelete(null)} />}
    </section>
  );
}
