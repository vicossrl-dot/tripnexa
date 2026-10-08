import { t, translateText } from "@/i18n/runtime";
import { useLocale } from "@/i18n/react";
import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Sparkles, Loader2 } from "lucide-react";
import { api } from "@/api/client";
import FieldHelper from '@/components/ui/field-helper';

export default function LinkAutoFill({ category, onExtracted, tripId }) {
  useLocale();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleFetch = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError("");
    try {
      if (category === 'stay') {
        const result = await api.extractStay({ trip_id: tripId, url: url.trim() });
        onExtracted({ ...result.data, url: url.trim() }, result.warnings);
        return;
      }
      const res = await api.ai.text({
        trip_id: tripId,
        prompt: `Visit and research this URL: ${url}\nIt is a travel-related page (booking, flight, hotel, restaurant, attraction, or document). Determine the correct category for it: "flight" (flights/airlines), "stay" (hotels/apartments), "place" (restaurants/attractions/activities), or "document" (tickets/insurance/files). Extract the details for the trip item. Return the item title (short, human-friendly), date (YYYY-MM-DD) and time (HH:mm) if relevant, end_date for hotel check-out if relevant, flight_number and confirmation_number if visible, a representative image URL from the page if available, and a one-line note with the most useful detail. Leave fields empty if unknown.`,
        add_context_from_internet: true,
        response_json_schema: {
          type: "object",
          properties: {
            category: { type: "string", enum: ["flight", "stay", "place", "document"] },
            title: { type: "string" },
            date: { type: "string" },
            time: { type: "string" },
            end_date: { type: "string" },
            flight_number: { type: "string" },
            confirmation_number: { type: "string" },
            image_url: { type: "string" },
            notes: { type: "string" },
          },
        },
      });
      onExtracted({ ...res, url });
    } catch (e) {
      setError(e.message || "Couldn't read that link. Try filling in manually.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <Label>{t("ui.paste.a.link.8275f7c")}</Label>
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." className="mt-1" />
        <FieldHelper>{t("ui.save.time.select.auto.fill.from.link.to.find.available.6dfa890")}{" "}{category === 'stay' ? t("ui.stay.39be152") : t("ui.travel.0209442")}{" "}{t("ui.details.review.suggestions.before.saving.private.booking.pages.ma.af73449")}</FieldHelper>
      </div>
      {error && <p className="text-xs text-red-600">{translateText(error)}</p>}
      <Button onClick={handleFetch} disabled={loading || !url.trim()} className="w-full bg-neutral-800 text-white hover:bg-neutral-700">
        {loading ? (
          <span className="inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />{" "}{t("ui.reading.link.caa1c9d")}</span>
        ) : (
          <span className="inline-flex items-center gap-2"><Sparkles className="w-4 h-4" />{" "}{t("ui.auto.fill.from.link.c4ba59c")}</span>
        )}
      </Button>
    </div>
  );
}
