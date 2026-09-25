import React, { useEffect, useRef, useState } from "react";

export default function ScrollVideo({ srcs, endImage, openImage, onOpen, onOpening }) {
  const refs = useRef([]);
  const [active, setActive] = useState(0);
  const [finished, setFinished] = useState(false);
  const [opened, setOpened] = useState(false);
  const lastScrollIndex = useRef(0);

  // Clicking the closed-windows frame opens the window, then enters the trip
  const handleOpen = () => {
    if (opened || !openImage) return;
    setOpened(true);
    if (onOpening) onOpening();
    if (onOpen) setTimeout(onOpen, 2200);
  };

  // Scrolling fast-forwards to the next video
  useEffect(() => {
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? window.scrollY / max : 0;
      const scrollIndex = Math.min(Math.floor(p * srcs.length), srcs.length - 1);
      if (scrollIndex !== lastScrollIndex.current) {
        lastScrollIndex.current = scrollIndex;
        setFinished(false);
        setActive(scrollIndex);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [srcs.length]);

  // Start the incoming video from its first frame, then cut to it instantly
  useEffect(() => {
    if (finished) return;
    const next = refs.current[active];
    if (!next) return;
    let cancelled = false;
    const swap = () => {
      if (cancelled) return;
      refs.current.forEach((v, i) => {
        if (!v) return;
        v.style.opacity = i === active ? 1 : 0;
        if (i !== active && !v.paused) v.pause();
      });
    };
    next.currentTime = 0;
    Promise.resolve(next.play()).catch(() => {}).then(() => {
      // Wait until the first frame is actually painted before cutting over
      if (next.requestVideoFrameCallback) next.requestVideoFrameCallback(swap);
      else requestAnimationFrame(swap);
    });
    return () => { cancelled = true; };
  }, [active, finished]);

  return (
    <>
      {srcs.map((src, i) => (
        <video
          key={src}
          ref={(el) => (refs.current[i] = el)}
          src={src}
          muted
          playsInline
          preload="auto"
          autoPlay={i === 0}
          onTimeUpdate={(e) => {
            // Only once the video is effectively frozen on its final frame do
            // we start the crossfade — fading in earlier, while the video is
            // still moving, causes a visible jump against the static image
            if (endImage && i === srcs.length - 1 && !finished) {
              const v = e.currentTarget;
              if (v.duration && v.currentTime >= v.duration - 0.05) {
                setFinished(true);
              }
            }
          }}
          onEnded={() => {
            if (endImage && i === srcs.length - 1) setFinished(true);
            else setActive((a) => (a + 1) % srcs.length);
          }}
          className="fixed inset-0 w-full h-full object-cover"
          style={{ opacity: i === 0 ? 1 : 0 }}
        />
      ))}
      {endImage && (
        <img
          src={endImage}
          alt=""
          onClick={handleOpen}
          className="fixed inset-0 w-full h-full object-cover transition-opacity [transition-duration:2000ms] ease-in-out"
          style={{ opacity: finished ? 1 : 0, pointerEvents: finished && !opened ? "auto" : "none", cursor: "pointer" }}
        />
      )}
      {openImage && (
        <img
          src={openImage}
          alt=""
          className="fixed inset-0 w-full h-full object-cover pointer-events-none"
          style={{
            // Reveal from the bottom up, like a window shade sliding open
            clipPath: opened ? "inset(0 0 0 0)" : "inset(100% 0 0 0)",
            transition: "clip-path 1400ms cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        />
      )}
    </>
  );
}