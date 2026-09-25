export const coordinates=point=>point&&[point.lat,point.lng].every(v=>v!=null&&Number.isFinite(Number(v)))&&Math.abs(point.lat)<=90&&Math.abs(point.lng)<=180;
export const routeKey=(from,to,mode)=>coordinates(from)&&coordinates(to)?JSON.stringify([Number(from.lat),Number(from.lng),Number(to.lat),Number(to.lng),mode]):null;
