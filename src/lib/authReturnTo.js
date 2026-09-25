export function safeReturnTo() {
  const raw = new URLSearchParams(window.location.search).get("returnTo");
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return "/";
  const url = new URL(raw, window.location.origin);
  return url.origin === window.location.origin && !url.pathname.startsWith("//")
    ? url.pathname + url.search : "/";
}
