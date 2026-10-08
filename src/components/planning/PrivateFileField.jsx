import { translateText, t } from "@/i18n/runtime";
import { useLocale } from "@/i18n/react";
import { useState } from 'react';
import { api } from '@/api/client';
import FieldHelper from '@/components/ui/field-helper';

export default function PrivateFileField({ label, value, onChange, tripId, helper = 'Keep your travel document here for easy access. Uploading saves the file; it does not fill in your trip details.' }) {
  useLocale();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <div className="space-y-2 text-sm text-white/70">
    <label className="block">{translateText(label)}
      <input aria-label={translateText(label)} type="file" accept="application/pdf,image/png,image/jpeg,image/gif,image/webp" disabled={busy}
        className="block mt-2 w-full text-xs"
        onChange={async event => {
          const file = event.target.files?.[0]; event.target.value = '';
          if (!file) return;
          setBusy(true); setError('');
          try {
            if (file.size > 10 * 1024 * 1024) throw new Error('Choose a file up to 10 MB.');
            const result = await api.uploadDocument(file, tripId);
            await onChange(result.file_url);
          } catch (failure) { setError(failure.message); }
          finally { setBusy(false); }
        }} />
    </label>
    <FieldHelper>{translateText(helper)}</FieldHelper>
    {busy && <p role="status">{t("ui.uploading.privately.ea04049")}</p>}
    {value && <a href={value} target="_blank" rel="noopener noreferrer" className="text-lime underline">{t("ui.view.download.b9606d2")}{" "}{label.toLowerCase()}</a>}
    {error && <p role="alert" className="text-red-300">{translateText(error)}</p>}
    <p className="text-xs text-white/40">{t("ui.pdf.jpg.png.gif.or.webp.up.to.10.mb.visible.only.to.your.account.e0acfa1")}</p>
  </div>;
}
