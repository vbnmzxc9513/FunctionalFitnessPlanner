export async function copyExportText(value) {
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(value); return; } catch { /* Offer the legacy selection fallback. */ }
  }
  const input = document.createElement('textarea');
  input.value = value; input.style.position = 'fixed'; input.style.opacity = '0';
  document.body.append(input); input.focus(); input.select();
  let copied = false;
  try { copied = typeof document.execCommand === 'function' && document.execCommand('copy'); }
  finally { input.remove(); }
  if (!copied) throw new Error('COPY_FAILED');
}

export function downloadExportCsv(value, filename) {
  const url = URL.createObjectURL(new Blob([value], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url; link.download = filename;
  try { document.body.append(link); link.click(); }
  finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000); }
}
