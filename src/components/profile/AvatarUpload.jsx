import { t, translateText } from "@/i18n/runtime";
import { useLocale } from "@/i18n/react";
import React, { useRef, useState } from "react";
import { api } from "@/api/client";
import { Image } from "@/components/ui/image";
import { UserRound, Camera, Loader2 } from "lucide-react";

export default function AvatarUpload({ user, onChange }) {
  useLocale();
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    if (!['image/png','image/jpeg','image/gif','image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) {
      setError('Choose a PNG, JPEG, GIF or WebP image up to 10 MB.');
      return;
    }
    setUploading(true);
    try {
      const { file_url } = await api.upload({ file });
      await api.auth.updateMe({ avatar_url: file_url });
      onChange(file_url);
    } catch (failure) { setError(failure.message || 'Your photo could not be saved. Try again.'); }
    finally { setUploading(false); }
  };

  return (
    <div className="flex flex-col items-center gap-2">
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      className="relative group w-20 h-20 rounded-2xl overflow-hidden bg-lime flex items-center justify-center shrink-0"
      title={t("ui.change.photo.c5fbcb8")}
      aria-label={t("ui.change.profile.photo.ec55182")}
      disabled={uploading}
    >
      {user.avatar_url ? (
        <Image src={user.avatar_url} alt={t("ui.profile.photo.ac8a731")} className="w-full h-full" />
      ) : (
        <UserRound className="w-9 h-9 text-neutral-900" />
      )}
      <span className={`absolute inset-0 bg-black/50 ${uploading ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'} transition-opacity flex items-center justify-center`}>
        {uploading ? <Loader2 className="w-5 h-5 text-white animate-spin" /> : <Camera className="w-5 h-5 text-white" />}
      </span>
    </button>
    <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" aria-label={t("ui.profile.image.c10c5bb")} className="hidden" onChange={handleFile} disabled={uploading} />
    <span className="text-xs text-white/70" role="status">{uploading ? t("ui.uploading.photo.dc8f9dd") : t("ui.change.photo.up.to.10.mb.95e1df6")}</span>
    {error && <p role="alert" className="text-sm text-red-200 max-w-xs">{translateText(error)}</p>}
    </div>
  );
}
