import { useState } from 'react';
import { api } from '@/api/client';

export default function PrivateFileField({ label, value, onChange }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <div className="space-y-2 text-sm text-white/70">
    <label className="block">{label}
      <input aria-label={label} type="file" accept="application/pdf,image/png,image/jpeg,image/gif,image/webp" disabled={busy}
        className="block mt-2 w-full text-xs file:rounded-lg file:border-0 file:bg-white/10 file:text-white file:px-3 file:py-2 file:mr-2"
        onChange={async event => {
          const file = event.target.files?.[0]; event.target.value = '';
          if (!file) return;
          setBusy(true); setError('');
          try {
            if (file.size > 10 * 1024 * 1024) throw new Error('Choose a file up to 10 MB.');
            const result = await api.uploadDocument(file);
            await onChange(result.file_url);
          } catch (failure) { setError(failure.message); }
          finally { setBusy(false); }
        }} />
    </label>
    {busy && <p role="status">Uploading privately…</p>}
    {value && <a href={value} target="_blank" rel="noopener noreferrer" className="text-lime underline">View / download {label.toLowerCase()}</a>}
    {error && <p role="alert" className="text-red-300">{error}</p>}
    <p className="text-xs text-white/40">PDF, JPG, PNG, GIF or WebP, up to 10 MB. Visible only to your account.</p>
  </div>;
}
