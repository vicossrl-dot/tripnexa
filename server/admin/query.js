import {assert} from '../errors.js';
export function paging(query,sorts,defaultSort){
 const page=Number(query.page||1),size=Number(query.pageSize||25),sort=String(query.sort||defaultSort),direction=query.direction==='asc'?'ASC':'DESC';
 assert(Number.isInteger(page)&&page>0&&page<=100000&&[10,25,50,100].includes(size),400,'Choose a valid page and page size.');
 assert(Object.hasOwn(sorts,sort),400,'Invalid sort.');
 return{page,size,limit:` LIMIT ${size} OFFSET ${(page-1)*size}`,order:` ORDER BY ${sorts[sort]} ${direction}, id ASC`};
}
export function dateRange(query){
 const days=Number(query.days||7);assert([1,7,30,90].includes(days),400,'Choose 24 hours, 7, 30 or 90 days.');
 const end=query.to?new Date(String(query.to)+'T23:59:59.999Z'):new Date(),start=query.from?new Date(String(query.from)+'T00:00:00Z'):new Date(end.getTime()-days*86400000);
 assert(Number.isFinite(start.getTime())&&Number.isFinite(end.getTime())&&end>=start&&end-start<=366*86400000,400,'Choose a valid date range of at most one year.');
 return{start:start.toISOString().slice(0,23).replace('T',' '),end:end.toISOString().slice(0,23).replace('T',' ')};
}
export const searchTerm=value=>String(value||'').trim().slice(0,150);
