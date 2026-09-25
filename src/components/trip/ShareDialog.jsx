import React, { useState,useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { api } from "@/api/client";
import { Copy, Check, Link2, Loader2, Eye, EyeOff } from "lucide-react";

export default function ShareDialog({ trip, open, onClose, onUpdated }) {
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hideStay, setHideStay] = useState(trip.share_hide_stay || false);

  const [shareUrl,setShareUrl]=useState(''),[linkError,setLinkError]=useState('');
  useEffect(()=>{let live=true;setShareUrl('');setLinkError('');if(open&&trip.share_enabled)api.shareUrl(trip.id).then(data=>{if(live)setShareUrl(data.url||'');}).catch(e=>{if(live)setLinkError(e.message);});return()=>{live=false;};},[open,trip.id,trip.share_token,trip.share_enabled]);

  const enableSharing = async () => {
    setSaving(true);
    try {
      const updated = await api.shareTrip(trip.id, { enabled: true, hideStay });
      onUpdated?.(updated);
    } catch (e) {}
    setSaving(false);
  };

  const disableSharing = async () => {
    setSaving(true);
    try {
      onUpdated?.(await api.shareTrip(trip.id, { enabled: false, hideStay }));
    } catch (e) {}
    setSaving(false);
  };

  const regenerate = async () => {
    setSaving(true);
    try {
      onUpdated?.(await api.shareTrip(trip.id, { enabled: true, hideStay, regenerate: true }));
    } catch (e) {}
    setSaving(false);
  };

  const toggleHideStay = async (val) => {
    setHideStay(val);
    try {
      onUpdated?.(await api.shareTrip(trip.id, { enabled: Boolean(trip.share_enabled), hideStay: val }));
    } catch (e) {}
  };

  const copyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareNative = () => {
    if (navigator.share) {
      navigator.share({ title: trip.name, url: shareUrl });
    } else {
      copyLink();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[calc(100%-30px)] max-w-md rounded-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold">
            <Link2 className="w-5 h-5 text-lime" /> Share trip
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {linkError&&<p role="alert" className="text-red-600">{linkError}</p>}
          <p className="text-sm text-neutral-500">
            Friends can view your itinerary without an account. Access is view-only and can be revoked anytime.
          </p>

          {!trip.share_enabled ? (
            <Button
              onClick={enableSharing}
              disabled={saving}
              className="w-full bg-lime text-neutral-900 hover:brightness-105 font-bold"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Enable sharing"}
            </Button>
          ) : (
            <>
              <div className="flex items-center gap-2 bg-neutral-50 border rounded-lg p-3">
                <input
                  readOnly
                  value={shareUrl}
                  className="flex-1 bg-transparent text-sm text-neutral-700 outline-none min-w-0"
                />
                <button disabled={!shareUrl} aria-label="Copy share link" onClick={copyLink} className="shrink-0 text-neutral-500 hover:text-neutral-900">
                  {copied ? <Check className="w-4 h-4 text-lime" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>

              <div className="flex gap-2">
                <Button disabled={!shareUrl} onClick={shareNative} variant="outline" className="flex-1">
                  Share link
                </Button>
                <Button onClick={regenerate} variant="outline" className="flex-1" disabled={saving}>
                  Regenerate
                </Button>
              </div>

              <div className="flex items-center justify-between gap-3 py-2">
                <div className="flex items-center gap-2">
                  {hideStay ? <EyeOff className="w-4 h-4 text-neutral-400" /> : <Eye className="w-4 h-4 text-neutral-400" />}
                  <Label className="text-sm text-neutral-700 cursor-pointer">Hide stay address</Label>
                </div>
                <Switch checked={hideStay} onCheckedChange={toggleHideStay} />
              </div>

              <div className="text-xs text-neutral-400 space-y-1">
                <p>• View-only access — no editing or booking</p>
                <p>• Private documents, QR codes, and reservation numbers are excluded</p>
                <p>• The link uses a hard-to-guess token and can be deactivated</p>
              </div>

              <Button
                onClick={disableSharing}
                disabled={saving}
                variant="outline"
                className="w-full text-red-600 border-red-200 hover:bg-red-50"
              >
                Disable sharing
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
