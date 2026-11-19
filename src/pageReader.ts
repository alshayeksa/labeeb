export function requestsCurrentPage(prompt: string): boolean {
  const text = prompt.toLowerCase().replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[أإآ]/g, 'ا');
  if (/(?:لا|لات|بدون)\s*(?:تقرا|تقراء|تقرأ|تلخص|تشرح|تحلل)|\b(?:do not|don't|without)\s+(?:read|summariz|analys|analyz)/i.test(text)) return false;
  return /(?:اقرا|اقراء|لخص|حلل|اشرح|ترجم|استخرج).{0,60}(?:الصفحة|هذه الصفحة|هذي الصفحة|الصفحه|التبويب|الموقع المفتوح)/.test(text)
    || /\b(?:read|summari[sz]e|explain|analy[sz]e|translate|extract)\b.{0,60}\b(?:this|current|active|open)\s+(?:web\s*)?(?:page|tab|website)\b/.test(text);
}

export interface PageContext {
  title: string; origin: string; selected: string; text: string;
  headings: string[]; links: {text: string; url: string}[];
  tables: string[][][]; truncated: boolean;
}
export function tablesCsv(pages: PageContext[]): string {
  const cell = (value: string) => {
    // Prevent spreadsheet formulas, including leading whitespace/control characters.
    const safe = /^[\s\u0000-\u001f]*[=+@-]/.test(value) ? "'" + value : value;
    return '"' + safe.replace(/"/g, '""') + '"';
  };
  const rows: string[][] = [];
  pages.forEach(page => page.tables.forEach((table, index) => {
    rows.push([page.title, page.origin, String(index + 1)], ...table, []);
  }));
  return '\ufeff' + rows.map(row => row.map(cell).join(',')).join('\r\n');
}
export function readerError(error: unknown, ar: boolean): string {
  const code = String(error);
  if (code.includes('READER_NO_SELECTION')) return ar ? 'حدد نصًا داخل الصفحة أولًا، ثم أعد المحاولة.' : 'Select text in the page first, then retry.';
  if (code.includes('READER_PAGE_CHANGED')) return ar ? 'تغيّرت الصفحة أو ما زالت تُحمّل. اخترها مجددًا بعد اكتمال التحميل.' : 'The page changed or is still loading. Select it again after loading.';
  if (code.includes('READER_TIMEOUT')) return ar ? 'انتهت مهلة قراءة الصفحة. أعد المحاولة.' : 'Reading timed out. Please retry.';
  return ar ? 'تعذّرت قراءة المحتوى أو تصديره. افتح صفحة ويب عادية؛ الإطارات وملفات PDF والمحتوى غير المحمّل قد لا تكون مدعومة.' : 'Could not read or export this content. Open a regular web page; frames, PDFs and unloaded content may not be supported.';
}
