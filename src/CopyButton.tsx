import { useEffect, useState } from 'react';
export default function CopyButton({ text, ar }: { text: string; ar: boolean }) {
  const [result, setResult] = useState<'copied' | 'failed' | null>(null);
  useEffect(() => setResult(null), [text]);
  return <button type="button" onClick={async () => {
    try { await navigator.clipboard.writeText(text); setResult('copied'); }
    catch { setResult('failed'); }
  }}>{result === 'copied' ? (ar ? 'تم النسخ' : 'Copied') : result === 'failed' ? (ar ? 'تعذّر النسخ، حاول مجددًا' : 'Copy failed, try again') : (ar ? 'نسخ' : 'Copy')}</button>;
}
