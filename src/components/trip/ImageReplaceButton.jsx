import React, { useRef, useState } from "react";
import { ImageUp, Loader2 } from "lucide-react";
import { api } from "@/api/client";

export default function ImageReplaceButton({ item, onReplaced }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await api.upload({ file });
      await api.entities.TripItem.update(item.id, { image_url: file_url });
      onReplaced(file_url);
    } catch { /* The shared API handler displays the error. */ }
    finally { setUploading(false); }
  };

  return (
    <>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      <button
        onClick={() => inputRef.current?.click()}
        aria-label="Replace image"
        title="Replace image"
        className="w-9 h-9 rounded-full bg-black/50 backdrop-blur flex items-center justify-center text-white active:scale-95 transition-transform"
      >
        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageUp className="w-4 h-4" />}
      </button>
    </>
  );
}
