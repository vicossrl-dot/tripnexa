import {readFileSync} from 'node:fs';
import {serverMessage,serverLocale,serverDate,serverCount} from './i18n.js';
import {requestContext} from './request-context.js';
import {translateSavedTexts,generatedTexts} from './localized-content.js';
const font=readFileSync(new URL('./assets/fonts/NotoSans.ttf',import.meta.url)).toString('base64');
export const pdfFontCss=`@font-face{font-family:TripNexaSans;src:url(data:font/ttf;base64,${font}) format('truetype');font-weight:100 900;font-style:normal;font-display:block}body,h1,h2,h3,svg text{font-family:TripNexaSans,sans-serif!important}`;
export const pdfLabel=source=>serverMessage(source);
export const pdfText=source=>{const translations=requestContext.getStore()?.pdfTranslations;return translations&&Object.hasOwn(translations,source)?translations[source]:source;};
export const pdfDate=(value,options={})=>value?serverDate(value,{day:'numeric',month:'long',year:'numeric',...options}):pdfLabel('Dates to confirm');
export const pdfNumber=value=>Number.isFinite(Number(value))?new Intl.NumberFormat(serverLocale(),{maximumFractionDigits:2}).format(Number(value)):pdfLabel(value);
export const pdfCount=serverCount;
export {serverLocale};
// Cache-only exports: never invoke a model, change canonical records or revalidate translated evidence.
export async function withPdfTranslations(value,owner,render){
 const translations=await translateSavedTexts(generatedTexts(value),{owner,generate:false});
 return requestContext.run({...requestContext.getStore(),pdfTranslations:translations},render);
}
