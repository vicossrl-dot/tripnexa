import { Info } from 'lucide-react';

export default function FieldHelper({ children, icon: Icon = Info }) {
  return <p className="mt-2 flex items-start gap-2 text-xs leading-relaxed text-neutral-500">
    <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
    <span>{children}</span>
  </p>;
}
