import { t, translateText } from "@/i18n/runtime";
import { useLocale } from "@/i18n/react";
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import WalletFileViewer from './WalletFileViewer';

export default function WalletAttachments({ files, onChange, onRemove, category, onExtract = null, busy = false }) {
  useLocale();
  const [viewing, setViewing] = useState(null);
  const update = (index,key,value) => onChange(files.map((file,i) => i === index ? {...file,[key]:value} : file));
  return <div className="space-y-3">
    {files.map((file,index) => <div key={file.id || file.file_url} data-wallet-attachment className="rounded-xl border border-neutral-200 p-3 space-y-2 text-neutral-900">
      <div className="flex items-start gap-2"><span className="flex-1 text-xs break-all">{file.original_name || t("ui.travel.file.b18d3ab")}</span><button type="button" disabled={busy} onClick={() => setViewing(file)} className="text-sm underline">{t("ui.view.dcc839a")}</button><button type="button" disabled={busy} onClick={() => onRemove(file)} className="text-sm text-red-700">{t("ui.remove.c3812fc")}</button></div>
      <div className="grid sm:grid-cols-2 gap-2">
        <label className="text-xs">{t("ui.label.title.ffb361b")}<Input aria-label={t("ui.attachment.value.label.ee442d0", {v0: index+1})} disabled={busy} value={file.label || ''} maxLength={255} onChange={event => update(index,'label',event.target.value)} /></label>
        <label className="text-xs">{t("ui.traveler.person.3c1e880")}<Input aria-label={t("ui.attachment.value.traveler.23c9a13", {v0: index+1})} disabled={busy} value={file.traveler || ''} maxLength={200} onChange={event => update(index,'traveler',event.target.value)} /></label>
        {category === 'document' && <><label className="text-xs">{t("ui.document.type.5b81f70")}<select aria-label={t("ui.attachment.value.document.type.554bc5c", {v0: index+1})} disabled={busy} value={file.document_type || ''} onChange={event => update(index,'document_type',event.target.value)} className="block w-full h-9 rounded-md border bg-transparent px-2">
          <option value="">{t("ui.choose.optional.ca69a8c")}</option>{["Passport","National ID","Visa","Travel insurance","Driving licence","Medical / travel certificate","Other"].map(type => <option key={type}>{translateText(type)}</option>)}
        </select></label><label className="text-xs">{t("ui.expiry.date.70a46a7")}<Input aria-label={t("ui.attachment.value.expiry.date.4b34e5d", {v0: index+1})} disabled={busy} type="date" value={file.expiry_date || ''} onChange={event => update(index,'expiry_date',event.target.value)} /></label></>}
      </div>
      <label className="block text-xs">{t("ui.file.notes.93d5375")}<Textarea aria-label={t("ui.attachment.value.notes.5d27386", {v0: index+1})} disabled={busy} value={file.notes || ''} maxLength={4000} rows={2} onChange={event => update(index,'notes',event.target.value)} /></label>
      {onExtract && category !== 'document' && <button type="button" disabled={busy} onClick={() => onExtract(file)} className="text-sm underline disabled:opacity-50">{t("ui.extract.details.for.review.7bd474b")}</button>}
    </div>)}
    {viewing && <WalletFileViewer key={viewing.file_url} file={viewing} onClose={() => setViewing(null)} />}
  </div>;
}
