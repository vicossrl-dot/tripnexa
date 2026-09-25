import { useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

export default function WalletFileViewer({ file, onClose }) {
  const [actualSize, setActualSize] = useState(false);
  if (!file) return null;
  const pdf = file.mime === 'application/pdf';
  const title = file.label || file.original_name || 'Travel file';
  return <Dialog open onOpenChange={open => !open && onClose()}>
    <DialogContent aria-describedby={undefined} className="max-w-none w-[100vw] h-[100dvh] rounded-none p-0 gap-0 border-0 bg-neutral-950 text-white flex flex-col [&>button]:hidden" data-wallet-viewer>
      <header className="shrink-0 flex flex-wrap items-center gap-3 border-b border-white/15 px-4 py-3">
        <button onClick={onClose} className="rounded-lg bg-white/10 px-3 py-2 text-sm">Close file</button>
        <DialogTitle className="flex-1 text-sm truncate">{title}{file.traveler ? ` · ${file.traveler}` : ''}</DialogTitle>
        {!pdf && <button onClick={() => setActualSize(!actualSize)} className="text-sm text-lime">{actualSize ? 'Fit screen' : 'Original size'}</button>}
        <a href={file.file_url + '?view=1'} target="_blank" rel="noopener noreferrer" className="text-sm text-lime">Open in new tab</a>
        <a href={file.file_url} download={title} className="text-sm text-lime">Download</a>
      </header>
      <div className={`flex-1 min-h-0 overflow-auto bg-white ${actualSize ? '' : 'flex items-start justify-center'}`} data-wallet-file-content>
        {pdf ? <iframe title={title} src={file.file_url + '?view=1'} className="w-full h-full border-0" /> :
          <img src={file.file_url} alt={title} className={actualSize ? 'max-w-none shrink-0' : 'w-full h-full object-contain'} style={actualSize ? { maxWidth:'none' } : undefined} />}
      </div>
    </DialogContent>
  </Dialog>;
}
