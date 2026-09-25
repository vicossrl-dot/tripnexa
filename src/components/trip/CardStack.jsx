import React from "react";

export function NotchSeam() {
  // Real cutout holes: a mask punches transparent circles out of the white
  // band so the page background shows through.
  return (
    <div
      className="relative h-6 bg-white pointer-events-none"
      aria-hidden="true"
      style={{
        WebkitMaskImage:
          "radial-gradient(circle 12px at 0% 50%, transparent 11.5px, black 12px), radial-gradient(circle 12px at 100% 50%, transparent 11.5px, black 12px)",
        WebkitMaskComposite: "source-in",
        maskImage:
          "radial-gradient(circle 12px at 0% 50%, transparent 11.5px, black 12px), radial-gradient(circle 12px at 100% 50%, transparent 11.5px, black 12px)",
        maskComposite: "intersect",
      }}
    >
      <div className="absolute left-5 right-5 top-1/2 -translate-y-1/2 border-t border-dashed border-neutral-900" />
    </div>
  );
}

export default function CardStack({ children }) {
  const kids = React.Children.toArray(children).filter(Boolean);
  const last = kids.length - 1;
  return (
    <div className="rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.08),0_10px_30px_rgba(0,0,0,0.08)]">
      {kids.map((child, i) => {
        const rounding = `${i === 0 ? "rounded-t-xl" : ""} ${i === last ? "rounded-b-xl" : ""}`.trim();
        const el = React.isValidElement(child)
          ? React.cloneElement(child, { className: `${child.props.className || ""} ${rounding}` })
          : child;
        return (
          <React.Fragment key={React.isValidElement(child) ? child.key ?? i : i}>
            {i > 1 && <NotchSeam />}
            {el}
          </React.Fragment>
        );
      })}
    </div>
  );
}
