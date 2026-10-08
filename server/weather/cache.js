// Bounded, process-local caches; coalesce simultaneous requests and limit concurrency.
export function createWeatherCache({fetcher = (...args) => fetch(...args), now = Date.now, ttl = 3600000, maxEntries = 256} = {}) {
  const cache = new Map(), pending = new Map(), queue = [];
  let active = 0, blockedUntil = 0;
  const slot = async () => { if (active >= 3) await new Promise(resolve => queue.push(resolve)); active++; };
  const release = () => { active--; queue.shift()?.(); };
  return async (url, headers = {}) => {
    const old = cache.get(url);
    if (old?.expires > now()) { if (old.error) throw Error('Weather temporarily unavailable'); return old.data; }
    if (pending.has(url)) return pending.get(url);
    const request = (async () => {
      await slot();
      try {
        if (blockedUntil > now()) throw Error('Weather provider cooling down');
        const response = await fetcher(url, {headers:{...headers,...(old?.modified ? {'If-Modified-Since':old.modified} : {})},signal:AbortSignal.timeout(10000)});
        if (response.status === 429 || response.status === 503) {
          const retry = response.headers.get('retry-after');
          const delay = /^\d+$/.test(retry || '') ? Number(retry)*1000 : Date.parse(retry) - now();
          blockedUntil = now() + Math.max(300000, Number.isFinite(delay) ? delay : 0);
        }
        if (!response.ok && !(response.status === 304 && old?.data)) throw Error('Weather provider unavailable');
        const data = response.status === 304 ? old.data : await response.json();
        const expiresHeader = Date.parse(response.headers.get('expires'));
        const age = response.headers.get('cache-control')?.match(/max-age=(\d+)/)?.[1];
        const expires = Math.max(now()+60000, Number.isFinite(expiresHeader) ? expiresHeader : now()+(age ? Number(age)*1000 : ttl));
        cache.delete(url);
        cache.set(url,{data,expires,modified:response.headers.get('last-modified') || old?.modified});
        return data;
      } catch (error) { cache.set(url,{error:true,expires:now()+300000}); throw error; }
      finally { release(); while(cache.size > maxEntries)cache.delete(cache.keys().next().value); }
    })();
    pending.set(url,request);
    try { return await request; } finally { pending.delete(url); }
  };
}
