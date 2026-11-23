const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

export function validatePdfBytes(bytes: Uint8Array): void {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 64) {
    throw new Error('File PDF kosong atau ukurannya tidak valid.');
  }
  for (let i = 0; i < PDF_MAGIC.length; i++) {
    if (bytes[i] !== PDF_MAGIC[i]) {
      // Check if server accidentally returned HTML or JSON text
      const snippet = new TextDecoder('utf-8', { fatal: false })
        .decode(bytes.slice(0, 120))
        .trim();
      if (snippet.startsWith('{') || snippet.startsWith('<')) {
        throw new Error('Dokumen tidak valid: server mengembalikan respon teks/HTML, bukan biner PDF.');
      }
      throw new Error('Signature file PDF tidak valid (header %PDF- tidak ditemukan).');
    }
  }
  const tailSlice = bytes.slice(Math.max(0, bytes.byteLength - 1024));
  const tailText = new TextDecoder('latin1').decode(tailSlice);
  if (!tailText.includes('%%EOF')) {
    throw new Error('Struktur file PDF tidak lengkap atau terpotong (%%EOF tidak ditemukan).');
  }
}

export function ensurePdfExtension(fileName: string): string {
  const clean = fileName.trim() || 'dokumen';
  return clean.toLowerCase().endsWith('.pdf') ? clean : `${clean}.pdf`;
}

export function downloadBinaryFile(
  bytes: Uint8Array,
  mimeType: string,
  fileName: string
): void {
  const lower = fileName.toLowerCase();
  const isPdf = mimeType === 'application/pdf' || lower.endsWith('.pdf');
  if (isPdf) {
    validatePdfBytes(bytes);
  }
  const finalMime = isPdf ? 'application/pdf' : mimeType || 'application/octet-stream';
  const finalName = isPdf ? ensurePdfExtension(fileName) : fileName;

  // Use a fresh copy so detached/transferred buffers never corrupt the Blob
  const blob = new Blob([bytes.slice()], { type: finalMime });
  const objectUrl = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = finalName;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Delay revocation generously so sandboxed browser download managers finish reading the Blob
  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 60_000);
}

export function downloadPdfBytes(bytes: Uint8Array, fileName: string): void {
  downloadBinaryFile(bytes, 'application/pdf', ensurePdfExtension(fileName));
}

export async function fetchVerifiedAttachmentBytes(
  url: string,
  expectedExtension?: string
): Promise<{ bytes: Uint8Array; mimeType: string }> {
  const response = await fetch(url, {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
  });

  const contentType = (response.headers.get('content-type') || '').toLowerCase();

  if (!response.ok) {
    let errMsg = `Gagal mengambil file dokumen (HTTP ${response.status}).`;
    if (contentType.includes('application/json')) {
      const payload = (await response.json().catch(() => ({}))) as { message?: string };
      if (payload.message) errMsg = payload.message;
    }
    throw new Error(errMsg);
  }

  if (contentType.includes('text/html') || contentType.includes('application/json')) {
    throw new Error('Respon server bukan file dokumen biner yang valid.');
  }

  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const ext = (expectedExtension || '').toLowerCase();
  const isPdf = ext === 'pdf' || contentType.includes('application/pdf');

  if (isPdf) {
    validatePdfBytes(bytes);
    return { bytes, mimeType: 'application/pdf' };
  }

  if (bytes.byteLength === 0) {
    throw new Error('Berkas dokumen kosong (0 byte).');
  }

  return {
    bytes,
    mimeType: contentType.split(';')[0] || 'application/octet-stream',
  };
}
