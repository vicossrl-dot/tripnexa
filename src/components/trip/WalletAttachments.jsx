import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import WalletFileViewer from './WalletFileViewer';

export default function WalletAttachments({ files, onChange, onRemove, category, onExtract = null, busy = false }) {
  const [viewing, setViewing] = useState(null);
  const update = (index,key,value) => onChange(files.map((file,i) => i === index ? {...file,[key]:value} : file));
  return <div className="space-y-3">
    {files.map((file,index) => <div key={file.id || file.file_url} data-wallet-attachment className="rounded-xl border border-neutral-200 p-3 space-y-2 text-neutral-900">
      <div className="flex items-start gap-2"><span className="flex-1 text-xs break-all">{file.original_name || 'Travel file'}</span><button type="button" disabled={busy} onClick={() => setViewing(file)} className="text-sm underline">View</button><button type="button" disabled={busy} onClick={() => onRemove(file)} className="text-sm text-red-700">Remove</button></div>
      <div className="grid sm:grid-cols-2 gap-2">
        <label className="text-xs">Label / title<Input aria-label={`Attachment ${index+1} label`} disabled={busy} value={file.label || ''} maxLength={255} onChange={event => update(index,'label',event.target.value)} /></label>
        <label className="text-xs">Traveler / person<Input aria-label={`Attachment ${index+1} traveler`} disabled={busy} value={file.traveler || ''} maxLength={200} onChange={event => update(index,'traveler',event.target.value)} /></label>
        {category === 'document' && <><label className="text-xs">Document type<select aria-label={`Attachment ${index+1} document type`} disabled={busy} value={file.document_type || ''} onChange={event => update(index,'document_type',event.target.value)} className="block w-full h-9 rounded-md border bg-transparent px-2">
          <option value="">Choose (optional)</option>{['Passport','National ID','Visa','Travel insurance','Driving licence','Medical / travel certificate','Other'].map(type => <option key={type}>{type}</option>)}
        </select></label><label className="text-xs">Expiry date<Input aria-label={`Attachment ${index+1} expiry date`} disabled={busy} type="date" value={file.expiry_date || ''} onChange={event => update(index,'expiry_date',event.target.value)} /></label></>}
      </div>
      <label className="block text-xs">File notes<Textarea aria-label={`Attachment ${index+1} notes`} disabled={busy} value={file.notes || ''} maxLength={4000} rows={2} onChange={event => update(index,'notes',event.target.value)} /></label>
      {onExtract && category !== 'document' && <button type="button" disabled={busy} onClick={() => onExtract(file)} className="text-sm underline disabled:opacity-50">Extract details for review</button>}
    </div>)}
    {viewing && <WalletFileViewer key={viewing.file_url} file={viewing} onClose={() => setViewing(null)} />}
  </div>;
}
