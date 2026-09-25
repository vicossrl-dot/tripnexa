import * as React from "react"

import { cn } from "@/lib/utils"

/** @type {React.ForwardRefRenderFunction<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>} */
const renderInput = ({ className, type, onClick, ...props }, ref) => {
  return (
    (<input
      type={type}
      className={cn(
        "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className,
        ['date', 'time', 'datetime-local'].includes(type) && className?.includes('text-white') && '[color-scheme:dark]'
      )}
      ref={ref}
      onClick={event => {
        onClick?.(event);
        if (!event.defaultPrevented && !props.disabled && !props.readOnly && ['date', 'time', 'datetime-local'].includes(type)) {
          try { event.currentTarget.showPicker?.(); } catch { /* Native keyboard entry remains available in unsupported browsers. */ }
        }
      }}
      {...props} />)
  );
}
const Input = React.forwardRef(renderInput)
Input.displayName = "Input"

export { Input }
