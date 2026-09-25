async function request(path, options = {}) {
  const isForm = options.body instanceof FormData;
  const response = await fetch(`/api${path}`, {
    credentials: 'same-origin', ...options,
    headers: { 'X-Requested-With': 'TripSync', ...(!isForm && options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
    body: options.body && !isForm ? JSON.stringify(options.body) : options.body,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = Object.assign(new Error(data.error || `Request failed (${response.status}).`), { status: response.status });
    // Surface failed saves even in older components which catch errors silently.
    if (!options.silent && options.method && options.method !== 'GET' && !path.startsWith('/auth') && !path.startsWith('/places')) {
      window.dispatchEvent(new CustomEvent('api-error', { detail: error.message }));
    }
    throw error;
  }
  return data;
}
function entity(name) {
  const path = `/entities/${name}`;
  const list = (filter, sort, limit) => {
    const query = new URLSearchParams();
    if (filter) query.set('filter', JSON.stringify(filter));
    if (sort) query.set('sort', sort);
    if (limit) query.set('limit', String(limit));
    return request(`${path}?${query}`);
  };
  return {
    list: (sort, limit) => list(null, sort, limit),
    filter: list,
    get: id => request(`${path}/${encodeURIComponent(id)}`),
    create: body => request(path, { method: 'POST', body }),
    update: (id, body) => request(`${path}/${encodeURIComponent(id)}`, { method: 'PATCH', body }),
    delete: id => request(`${path}/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    deleteMany: filter => request(`${path}?${new URLSearchParams({ filter: JSON.stringify(filter) })}`, { method: 'DELETE' }),
    bulkCreate: items => request(`${path}/bulk`, { method: 'POST', body: { items } }),
  };
}
export const api = {
  account: (path,body=undefined) => request('/account/'+path,{method:body?'POST':'GET',body,silent:true}),
  entities: Object.fromEntries(['Trip','TripItem','PlaceSelection','DayWindow','ItineraryItem','TodoBoard','TodoItem'].map(name => [name, entity(name)])),
  auth: {
    me: () => request('/auth/me'),
    updateMe: body => request('/auth/me', { method: 'PATCH', body }),
    register: body => request('/auth/register', { method: 'POST', body }),
    verifyOtp: body => request('/auth/verify', { method: 'POST', body }),
    resendOtp: email => request('/auth/resend', { method: 'POST', body: { email } }),
    loginViaEmailPassword: (email, password) => request('/auth/login', { method: 'POST', body: { email, password } }),
    resetPasswordRequest: email => request('/auth/forgot-password', { method: 'POST', body: { email } }),
    resetPassword: body => request('/auth/reset-password', { method: 'POST', body }),
    logout: async (redirect = '/login') => {
      await request('/auth/logout', { method: 'POST' });
      localStorage.removeItem('tripsync_last_trip');
      sessionStorage.removeItem('tripsync_entered');
      if (redirect) window.location.assign('/login');
    },
  },
  ai: {
    planningSuggestions: (tripId, signal) => request('/ai/planning-suggestions', { method: 'POST', body: { trip_id: tripId }, signal }),
    tripNames: body => request('/ai/trip-names', { method: 'POST', body }),
    text: body => request('/ai/text', { method: 'POST', body }),
    image: body => request('/ai/image', { method: 'POST', body }),
  },
  upload: ({ file }) => {
    const body = new FormData();
    body.append('file', file);
    return request('/uploads', { method: 'POST', body });
  },
  uploadDocument: file => {
    const body = new FormData();
    body.append('file', file);
    return request('/uploads/document', { method: 'POST', body });
  },
  extractStay: body => request('/ai/stay-extraction', { method: 'POST', body }),
  wallet: {
    list: tripId => request(`/trips/${encodeURIComponent(tripId)}/wallet`),
    save: (tripId, itemId, body) => request(`/trips/${encodeURIComponent(tripId)}/wallet/items${itemId ? '/' + encodeURIComponent(itemId) : ''}`, { method:itemId ? 'PATCH' : 'POST',body }),
    upload: file => { const body = new FormData(); body.append('file',file); return request('/uploads/wallet',{method:'POST',body}); },
    extract: body => request('/ai/wallet-extraction',{method:'POST',body}),
  },
  sharedTrip: token => request(`/shared/${encodeURIComponent(token)}`),
  shareTrip: (id, body) => request(`/trips/${encodeURIComponent(id)}/share`, { method: 'POST', body }),
  shareUrl: id => request(`/trips/${encodeURIComponent(id)}/share-url`),
  mealOptions: (id,meal,refresh=false) => request(`/trips/${encodeURIComponent(id)}/meals/${encodeURIComponent(meal)}/options`,{method:'POST',body:{refresh}}),
  chooseMeal: (id,meal,body) => request(`/trips/${encodeURIComponent(id)}/meals/${encodeURIComponent(meal)}/choice`,{method:'POST',body}),
  getItinerary: id => request(`/trips/${encodeURIComponent(id)}/itinerary`),
  tripHealth: id => request(`/trips/${encodeURIComponent(id)}/health`),
  repairTrip: (id,action,token=undefined) => request(`/trips/${encodeURIComponent(id)}/repair/${action}`,{method:'POST',body:{token},silent:true}),
  buildItinerary: (id, body = {}) => request(`/trips/${encodeURIComponent(id)}/itinerary`, { method: 'POST', body }),
  editItinerary: (id, body) => request(`/trips/${encodeURIComponent(id)}/itinerary/edit`, { method: 'POST', body }),
  previewItinerary: (id, body) => request(`/trips/${encodeURIComponent(id)}/itinerary/preview`, { method:'POST', body }),
  applyItinerary: (id, token) => request(`/trips/${encodeURIComponent(id)}/itinerary/apply`, { method:'POST', body:{token} }),
  downloadItinerary: async id => {
    const response=await fetch(`/api/trips/${encodeURIComponent(id)}/itinerary/pdf`,{credentials:'same-origin'});
    if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.error || 'PDF export failed. Please retry.');}
    const url=URL.createObjectURL(await response.blob()),link=document.createElement('a');link.href=url;link.download='TripSync-itinerary.pdf';link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
  },
  savePlanning: (id, collection, items) => request(`/trips/${encodeURIComponent(id)}/planning/${collection}`, { method: 'PUT', body: { items } }),
  config: () => request('/config'),
  places: {
    resolve: (body, signal) => request('/places/resolve', { method:'POST', body, signal }),
    photos: (id, signal) => request(`/places/${encodeURIComponent(id)}/photos`, { signal }),
    autocomplete: (body, signal) => request('/places/autocomplete', { method: 'POST', body, signal }),
    details: (body, signal) => request('/places/details', { method: 'POST', body, signal }),
  },
};
