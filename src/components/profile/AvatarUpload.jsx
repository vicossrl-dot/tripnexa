import React, { useRef, useState } from "react";
import { api } from "@/api/client";
import { Image } from "@/components/ui/image";
import { UserRound, Camera, Loader2 } from "lucide-react";

export default function AvatarUpload({ user, onChange }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await api.upload({ file });
      await api.auth.updateMe({ avatar_url: file_url });
      onChange(file_url);
    } catch { /* The shared API handler displays the error. */ }
    finally { setUploading(false); }
  };

  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      className="relative group w-20 h-20 rounded-2xl overflow-hidden bg-lime flex items-center justify-center shrink-0"
      title="Change photo"
    >
      {user.avatar_url ? (
        <Image src={user.avatar_url} alt="Profile photo" className="w-full h-full" />
      ) : (
        <UserRound className="w-9 h-9 text-neutral-900" />
      )}
      <span className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
        {uploading ? <Loader2 className="w-5 h-5 text-white animate-spin" /> : <Camera className="w-5 h-5 text-white" />}
      </span>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </button>
  );
}
