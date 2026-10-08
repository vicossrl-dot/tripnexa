import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { refreshDocumentLocale } from './runtime';

export default function LocaleRouteSync() {
  const { pathname } = useLocation();
  useEffect(() => { refreshDocumentLocale(); }, [pathname]);
  return null;
}
