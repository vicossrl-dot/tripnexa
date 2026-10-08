export function safeReturnTo() {
  const raw = new URLSearchParams(window.location.search).get("returnTo");
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return "/";
  const url = new URL(raw, window.location.origin);
  return url.origin === window.location.origin && !url.pathname.startsWith("//")
    ? url.pathname + url.search : "/";
}
export async function resumeReturnTo(){
  const requested=safeReturnTo();
  if(requested!=='/')return requested;
  try{const response=await fetch('/api/public-itineraries/intent',{credentials:'same-origin'});if(response.ok){const data=await response.json();if(/^\/customize\/[a-f0-9-]{36}$/.test(data.returnTo))return data.returnTo;}}catch{}
  return '/';
}
