import React, { useState } from "react";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { api } from "@/api/client";

export default function DeleteTripDialog({ trip, open, onClose, onDeleted }) {
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
          <AlertDialogTitle>Delete "{trip.name}"?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete the trip and everything saved inside it. This can't be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); handleDelete(); }}
            disabled={deleting}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {deleting ? "Deleting…" : "Delete Trip"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
