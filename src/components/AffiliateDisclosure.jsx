import { t, translateText } from "@/i18n/runtime";
import { useLocale } from "@/i18n/react";
import {usePublicSettings} from '@/lib/PublicSettingsContext';
export default function AffiliateDisclosure(){
  useLocale();
 const {affiliateDisclosure}=usePublicSettings();
 if(!affiliateDisclosure.text)return null;
 return <footer className="bg-neutral-950 text-white/50 text-xs px-6 py-5 text-center" aria-label={t("ui.affiliate.disclosure.15ed514")}>{translateText(affiliateDisclosure.text)}{affiliateDisclosure.url&&<> <a className="underline" href={affiliateDisclosure.url} target="_blank" rel="noopener noreferrer">{t("ui.learn.more.1445799")}</a></>}</footer>;
}
