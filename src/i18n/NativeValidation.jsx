import { useEffect } from 'react';
import { useLocale } from './react';
import { t, isAdmin } from './runtime';

export default function NativeValidation() {
  const locale = useLocale();
  useEffect(() => {
    const message = field => {
      const validity = field.validity;
      if (validity.valueMissing) return t('validation.required');
      if (validity.typeMismatch) return t(field.type === 'email' ? 'validation.email' : 'validation.value');
      if (validity.tooShort) return t('validation.minLength', { count: field.minLength });
      if (validity.tooLong) return t('validation.maxLength', { count: field.maxLength });
      if (validity.rangeUnderflow) return t('validation.min', { count: field.min });
      if (validity.rangeOverflow) return t('validation.max', { count: field.max });
      if (validity.patternMismatch || validity.stepMismatch || validity.badInput) return t('validation.value');
      return '';
    };
    const invalid = event => {
      if (isAdmin()) return;
      const field = event.target;
      if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement) field.setCustomValidity(message(field));
    };
    const clear = event => {
      const field = event.target;
      if (!isAdmin() && (field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement)) field.setCustomValidity('');
    };
    // Reset only our custom validity text when the language changes.
    if (!isAdmin()) document.querySelectorAll('input,select,textarea').forEach(field => {
      if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement) {
        if (field.dataset.i18nValidity === 'true') { field.setCustomValidity(''); delete field.dataset.i18nValidity; }
      }
    });
    const set = event => { invalid(event); if (!isAdmin() && event.target instanceof HTMLElement) event.target.dataset.i18nValidity = 'true'; };
    document.addEventListener('invalid', set, true);
    document.addEventListener('input', clear, true);
    document.addEventListener('change', clear, true);
    return () => { document.removeEventListener('invalid', set, true); document.removeEventListener('input', clear, true); document.removeEventListener('change', clear, true); };
  }, [locale]);
  return null;
}
