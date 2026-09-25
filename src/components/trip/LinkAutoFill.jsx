import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Sparkles, Loader2 } from "lucide-react";
import { api } from "@/api/client";

export default function LinkAutoFill({ category, onExtracted, tripId }) {
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
        <Label>Paste a link</Label>
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." className="mt-1" />
        <p className="mt-1.5 text-xs text-neutral-500">We'll read the page and fill in the details for you.</p>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <Button onClick={handleFetch} disabled={loading || !url.trim()} className="w-full bg-neutral-800 text-white hover:bg-neutral-700">
        {loading ? (
          <span className="inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Reading link…</span>
        ) : (
          <span className="inline-flex items-center gap-2"><Sparkles className="w-4 h-4" /> Auto-fill from link</span>
        )}
      </Button>
    </div>
  );
}
