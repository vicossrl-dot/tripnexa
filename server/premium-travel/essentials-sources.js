// A conservative destination-authority registry. Unknown destinations still have official advisory links.
const destinationAuthorities={
 JP:['https://www.mofa.go.jp/j_info/visit/visa/index.html','https://www.japan.travel/en/plan/'],
 IT:['https://vistoperitalia.esteri.it/','https://www.italia.it/en'],
 CH:['https://www.sem.admin.ch/sem/en/home/themen/einreise.html','https://www.myswitzerland.com/en/'],
 FR:['https://france-visas.gouv.fr/en/','https://www.france.fr/en/'],
 GB:['https://www.gov.uk/check-uk-visa','https://www.visitbritain.com/en'],
 US:['https://travel.state.gov/en/us-visas.html','https://www.cbp.gov/travel'],
 RO:['https://eviza.mae.ro/','https://www.politiadefrontiera.ro/en/main'],
 MD:['https://igm.gov.md/en/','https://mfa.gov.md/en/'],
 DE:['https://www.auswaertiges-amt.de/en/visa-service','https://www.germany.travel/en/home.html'],
 ES:['https://www.exteriores.gob.es/en/ServiciosAlCiudadano/Paginas/index.aspx','https://www.spain.info/en/'],
 PT:['https://vistos.mne.gov.pt/en/','https://www.visitportugal.com/en'],
 CA:['https://www.canada.ca/en/immigration-refugees-citizenship/services/visit-canada.html'],
 AU:['https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-finder/visit','https://www.australia.com/en'],
 NZ:['https://www.immigration.govt.nz/','https://www.newzealand.com/int/'],
 SG:['https://www.ica.gov.sg/enter-transit-depart','https://www.visitsingapore.com/'],
 TH:['https://www.thaievisa.go.th/','https://www.tourismthailand.org/'],
 KR:['https://www.visa.go.kr/','https://english.visitkorea.or.kr/'],
 IN:['https://indianvisaonline.gov.in/'],
 ID:['https://www.imigrasi.go.id/'],
 VN:['https://evisa.gov.vn/'],
 AE:['https://u.ae/en/information-and-services/visa-and-emirates-id'],
 TR:['https://www.mfa.gov.tr/visa-information-for-foreigners.en.mfa']
};
export const advisoryLinks=['https://www.gov.uk/foreign-travel-advice','https://travel.state.gov/en/international-travel.html','https://www.who.int/travel-advice'];
export const authorityRegistry=Object.fromEntries(Object.entries(destinationAuthorities).map(([code,urls])=>[code,{
 entry:urls.slice(0,1),tourism:urls.slice(1),transport:[],emergency:[],health:[],practical:[]
}]));
Object.assign(authorityRegistry.JP,{
 transport:['https://www.tokyometro.jp/en/'],
 emergency:['https://www.fdma.go.jp/en/'],
 health:['https://www.mhlw.go.jp/english/'],
 practical:['https://www.japan.travel/en/plan/']
});
// Curated organizations/operators; never accept an arbitrary model-suggested domain.
export const practicalSources={
 power:['https://www.iec.ch/world-plugs'],
 transport:['https://www.iata.org/'],
 timezone:['https://www.timeanddate.com/'],
 JP:{transport:['https://www.jreast.co.jp/en/','https://www.westjr.co.jp/global/en/']}
};
export function authorityLinks(code){return [...new Set([...Object.values(authorityRegistry[code]||{}).flat(),...advisoryLinks])];}
export function safeSourceUrl(value){
 try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&url.href.length<=2000?url:null;}catch{return null;}
}
export function canonicalSourceUrl(value){const url=safeSourceUrl(value);if(!url)return null;url.hash='';for(const key of [...url.searchParams.keys()])if(/^utm_/i.test(key))url.searchParams.delete(key);return url.href;}
const matchesRoot=(host,root)=>host===root||host.endsWith('.'+root);
const hosts=urls=>urls.map(value=>new URL(value).hostname.replace(/^www\./,''));
// Bounded discovery: country government namespaces, not arbitrary .org or "official" titles.
export function destinationGovernment(host,code){
 const suffix=code==='GB'?'uk':String(code).toLowerCase();
 if(code==='US')return host.endsWith('.gov');
 if(code==='JP'&&matchesRoot(host,'lg.jp'))return true;
 if(code==='CA'&&matchesRoot(host,'gc.ca'))return true;
 return ['gov','gouv','gob','go','gv'].some(label=>matchesRoot(host,label+'.'+suffix));
}
export function classifySource(value,code,key='practical',highRisk=false){
 const url=safeSourceUrl(canonicalSourceUrl(value));if(!url)return null;
 // Public authority sites can themselves contain forums/UGC. Exclude those paths too.
 if(/\/(?:forum|forums|community|comments|reviews|blog|blogs|affiliate)(?:\/|$)/i.test(url.pathname))return null;
 const entry=key==='entryDocuments',officialRoots=hosts(entry?(authorityRegistry[code]?.entry||[]):authorityLinks(code));
 if(destinationGovernment(url.hostname,code)||officialRoots.some(root=>matchesRoot(url.hostname,root)))return {url:url.href,sourceType:'official'};
 if(highRisk||entry)return null;
 const trustedRoots=hosts([...(practicalSources[key]||[]),...(practicalSources[code]?.[key]||[])]);
 return trustedRoots.some(root=>matchesRoot(url.hostname,root))?{url:url.href,sourceType:'trusted'}:null;
}
// Existing consumers keep the official-only URL contract.
export function trustedSource(value,code,entry=false){const source=classifySource(value,code,entry?'entryDocuments':'practical',true);return source?.sourceType==='official'?source.url:null;}
export {essentialsSections} from '../../src/lib/essentials-guidance.js';
