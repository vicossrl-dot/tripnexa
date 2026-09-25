import { useEffect, useState } from 'react';
import { api } from '@/api/client';
export function useCapabilities() {
  const [capabilities, setCapabilities] = useState({ ai: false, imageGeneration: false, places: false, loading: true, error: '' });
  useEffect(() => {
    let active = true;
    const refresh = () => api.config().then(value => {
      if (active) setCapabilities({ ...value, loading: false, error: '' });
    }).catch(() => {
      if (active) setCapabilities(previous => ({ ...previous, loading: false, error: 'Cannot contact the backend. Check that TripSync is running; configuration will retry automatically.' }));
    });
    refresh();
    const timer = setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, []);
  return capabilities;
}
