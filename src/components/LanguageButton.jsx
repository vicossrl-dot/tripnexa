import { useState } from 'react';
import { Languages, Check, Globe2 } from 'lucide-react';
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useLocale } from '@/i18n/react';
import { t, locales, localeNames, selectLocale } from '@/i18n/runtime';
import { useAuth } from '@/lib/AuthContext';

export default function LanguageButton({ className = 'trip-button secondary' }) {
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const { saveLocale, localeError } = useAuth();
  return <>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><button type="button" className={className} aria-label={t('language.select')} title={t('language.select')}><Languages size={17} aria-hidden="true"/><span className="hidden sm:inline">{localeNames[locale]}</span><span className="sm:hidden uppercase">{locale}</span></button></DialogTrigger>
      <DialogContent className="rounded-2xl w-[calc(100%-2rem)] max-w-md max-h-[90dvh] overflow-y-auto p-6 bg-white text-neutral-950 border-neutral-200">
        <Globe2 className="text-emerald-700" size={30} aria-hidden="true"/>
        <DialogTitle>{t('language.select')}</DialogTitle>
        <DialogDescription className="text-neutral-600">{t('language.description')}</DialogDescription>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="group" aria-label={t('language.select')}>
          {locales.map(code => <button key={code} type="button" lang={code} aria-pressed={locale === code} onClick={() => { selectLocale(code); void saveLocale(code); }} className={`min-h-14 rounded-xl border px-4 py-3 flex items-center justify-between text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 ${locale === code ? 'border-emerald-700 bg-emerald-50' : 'border-neutral-200 hover:bg-neutral-100'}`}><span>{localeNames[code]}</span>{locale === code && <Check size={18} aria-hidden="true"/>}</button>)}
        </div>
        <p role="status" className="text-sm text-neutral-600">{t(localeError ? 'language.saveError' : 'language.immediate')}</p>
        {localeError && <button type="button" className="underline text-sm text-emerald-800" onClick={() => void saveLocale(locale)}>{t('language.retry')}</button>}
      </DialogContent>
    </Dialog>
  </>;
}
