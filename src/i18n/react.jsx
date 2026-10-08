import { useSyncExternalStore } from 'react';
import { getLocaleSnapshot, subscribe } from './runtime';

export function useLocale() {
  return useSyncExternalStore(subscribe, getLocaleSnapshot, () => 'en:0').split(':')[0];
}
