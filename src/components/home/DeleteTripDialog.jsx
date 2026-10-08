import { t } from "@/i18n/runtime";
import { useLocale } from "@/i18n/react";
import React, { useState } from "react";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { api } from "@/api/client";

export default function DeleteTripDialog({ trip, open, onClose, onDeleted }) {
  useLocale();
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.entities.Trip.delete(trip.id);
    } catch (err) {
      // Already gone (e.g. deleted in another tab) — treat as success
      if (err.status !== 404) { setDeleting(false); return; }
    }
    if (localStorage.getItem("tripsync_last_trip") === trip.id) {
      localStorage.removeItem("tripsync_last_trip");
    }
    setDeleting(false);
    onDeleted(trip.id);
  };

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent className="rounded-2xl w-[calc(100%-30px)] max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle>{t("ui.delete.7613fa5")}{trip.name}"?</AlertDialogTitle>
          <AlertDialogDescription>{t("ui.this.will.permanently.delete.the.trip.and.everything.saved.inside.fd4159a")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>{t("ui.cancel.19766ed")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); handleDelete(); }}
            disabled={deleting}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {deleting ? t("ui.deleting.43b5894") : t("ui.delete.trip.d8ee104")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
