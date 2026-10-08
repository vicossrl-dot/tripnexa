import { t } from "@/i18n/runtime";
import { useLocale } from "@/i18n/react";
import React, { useState,useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { api } from "@/api/client";
import { Copy, Check, Link2, Loader2, Eye, EyeOff } from "lucide-react";

export default function ShareDialog({ trip, open, onClose, onUpdated }) {
  useLocale();
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
            <Link2 className="w-5 h-5 text-lime" />{" "}{t("ui.share.trip.49000f4")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {linkError&&<p role="alert" className="text-red-600">{linkError}</p>}
          <p className="text-sm text-neutral-500">{t("ui.friends.can.view.your.itinerary.without.an.account.access.is.view.0dd92c5")}</p>

          {!trip.share_enabled ? (
            <Button
              onClick={enableSharing}
              disabled={saving}
              className="w-full bg-lime text-neutral-900 hover:brightness-105 font-bold"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : t("ui.enable.sharing.6f983cf")}
            </Button>
          ) : (
            <>
              <div className="flex items-center gap-2 bg-neutral-50 border rounded-lg p-3">
                <input
                  readOnly
                  value={shareUrl}
                  className="flex-1 bg-transparent text-sm text-neutral-700 outline-none min-w-0"
                />
                <button disabled={!shareUrl} aria-label={t("ui.copy.share.link.d31483e")} onClick={copyLink} className="shrink-0 text-neutral-500 hover:text-neutral-900">
                  {copied ? <Check className="w-4 h-4 text-lime" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>

              <div className="flex gap-2">
                <Button disabled={!shareUrl} onClick={shareNative} variant="outline" className="flex-1">{t("ui.share.link.712a482")}</Button>
                <Button onClick={regenerate} variant="outline" className="flex-1" disabled={saving}>{t("ui.regenerate.1651031")}</Button>
              </div>

              <div className="flex items-center justify-between gap-3 py-2">
                <div className="flex items-center gap-2">
                  {hideStay ? <EyeOff className="w-4 h-4 text-neutral-400" /> : <Eye className="w-4 h-4 text-neutral-400" />}
                  <Label className="text-sm text-neutral-700 cursor-pointer">{t("ui.hide.stay.address.7970795")}</Label>
                </div>
                <Switch checked={hideStay} onCheckedChange={toggleHideStay} />
              </div>

              <div className="text-xs text-neutral-400 space-y-1">
                <p>{t("ui.view.only.access.no.editing.or.booking.7916ffa")}</p>
                <p>{t("ui.private.documents.qr.codes.and.reservation.numbers.are.excluded.075846b")}</p>
                <p>{t("ui.the.link.uses.a.hard.to.guess.token.and.can.be.deactivated.6caec3a")}</p>
              </div>

              <Button
                onClick={disableSharing}
                disabled={saving}
                variant="outline"
                className="w-full text-red-600 border-red-200 hover:bg-red-50"
              >{t("ui.disable.sharing.7b1511a")}</Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
