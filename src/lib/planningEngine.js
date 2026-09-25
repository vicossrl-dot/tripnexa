// Planning engine — deterministic scheduling logic for TripSync "Planifică vizitele".
// GPT is NOT the authority for overlaps, distances, or times. This module is.

// ---------- Time helpers (all times are "HH:mm" strings, local to the trip timezone) ----------

export function timeToMin(t) {
  if (!t || typeof t !== "string") return null;
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

export function minToTime(min) {
  if (min == null || isNaN(min)) return "";
  min = ((Math.round(min) % 1440) + 1440) % 1440;
  const h = Math.floor(min / 60);
  const mm = min % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export function addMin(time, mins) {
  const base = timeToMin(time);
  if (base == null) return "";
  return minToTime(base + mins);
}

export function diffMin(a, b) {
  const x = timeToMin(a);
  const y = timeToMin(b);
  if (x == null || y == null) return null;
  return y - x;
}

// ---------- Windows ----------

export function parseWindows(json) {
  try {
    const arr = JSON.parse(json || "[]");
    return Array.isArray(arr) ? arr.filter((w) => w.start && w.end) : [];
  } catch {
    return [];
  }
}

export function stringifyWindows(arr) {
  return JSON.stringify((arr || []).filter((w) => w.start && w.end));
}

export function totalWindowMinutes(windows) {
  return windows.reduce((sum, w) => sum + (diffMin(w.start, w.end) || 0), 0);
}

export function largestContinuousBlock(windows) {
  return windows.reduce((max, w) => Math.max(max, diffMin(w.start, w.end) || 0), 0);
}

export function subtractBlocked(windows, blocked) {
  let result = windows.map((w) => ({ start: w.start, end: w.end }));
  for (const b of blocked) {
    const bs = timeToMin(b.start);
    const be = timeToMin(b.end);
    if (bs == null || be == null) continue;
    const next = [];
    for (const w of result) {
      const ws = timeToMin(w.start);
      const we = timeToMin(w.end);
      if (be <= ws || bs >= we) {
        next.push(w);
      } else {
        if (ws < bs) next.push({ start: w.start, end: minToTime(bs) });
        if (be < we) next.push({ start: minToTime(be), end: w.end });
      }
    }
    result = next;
  }
  return result;
}

// ---------- Insertion feasibility ----------

export function insertionImpact({ visitDurationMin, accessMin = 15, bufferMin = 15, transportAX, transportXB, transportAB }) {
  const tAX = transportAX ?? 0;
  const tXB = transportXB ?? 0;
  const tAB = transportAB ?? 0;
  return visitDurationMin + accessMin + tAX + tXB - tAB + bufferMin * 2;
}

export function visitFitsInInterval({ intervalStart, intervalEnd, visitDurationMin, openingHours, accessMin = 15 }) {
  const iStart = timeToMin(intervalStart);
  const iEnd = timeToMin(intervalEnd);
  if (iStart == null || iEnd == null) return { fits: false, reason: "Invalid interval" };
  const avail = iEnd - iStart;
  if (avail < visitDurationMin + accessMin) {
    return { fits: false, reason: `Interval too short (${avail} min, needed ${visitDurationMin + accessMin})` };
  }
  if (openingHours && openingHours.open && openingHours.close) {
    const oStart = timeToMin(openingHours.open);
    const oClose = timeToMin(openingHours.close);
    const lastEntry = openingHours.lastEntry ? timeToMin(openingHours.lastEntry) : oClose - visitDurationMin;
    const earliestStart = Math.max(iStart, oStart);
    const latestStart = Math.min(iEnd - visitDurationMin, lastEntry);
    if (latestStart < earliestStart) {
      return { fits: false, reason: `Closed in this interval (open ${openingHours.open}–${openingHours.close})` };
    }
    return { fits: true, start: minToTime(earliestStart), end: minToTime(earliestStart + visitDurationMin) };
  }
  const start = minToTime(iStart);
  return { fits: true, start, end: minToTime(iStart + visitDurationMin), needsVerification: true };
}

// ---------- Day capacity ----------

export function dayCapacity({ windows, blocked, mealMin = 60, bufferMin = 15 }) {
  const free = subtractBlocked(parseWindows(windows), parseWindows(blocked));
  const total = totalWindowMinutes(free);
  const reserved = mealMin + bufferMin * 2;
  return {
    freeIntervals: free,
    totalFreeMin: Math.max(0, total - reserved),
    continuousMax: largestContinuousBlock(free),
    reservedMin: reserved,
  };
}

// ---------- Build itinerary (deterministic) ----------

export function buildItinerary({ trip, dayWindows, places, mealMin = 60, bufferMin = 15, accessMin = 15 }) {
  const routeMode = ['walk', 'transit', 'taxi', 'car'].includes(trip.transport_preference) ? trip.transport_preference : 'transit';
  const days = [...dayWindows].sort((a, b) => a.date.localeCompare(b.date));
  const items = [];
  const conflicts = [];
  const version = (trip.plan_version || 0) + 1;
  const preferred = places.filter(place => place.priority === 'preferred');
  const scheduledPreferred = new Set();

  for (const day of days) {
    const cap = dayCapacity({ windows: day.windows, blocked: day.blocked, mealMin, bufferMin });
    let cursor = cap.freeIntervals.length > 0 ? timeToMin(cap.freeIntervals[0].start) : timeToMin("09:30");
    const dayItems = [];
    const startPoint = day.start_point || "Hotel";
    const endPoint = day.end_point || day.start_point || "Hotel";

    const fixed = places.filter((p) => p.priority === "mandatory" && p.fixed_date === day.date && p.fixed_time);
    for (const p of fixed) {
      const start = timeToMin(p.fixed_time);
      const dur = p.desired_duration_min || 120;
      dayItems.push({
        step_type: "visit",
        title: p.name,
        start_time: p.fixed_time,
        end_time: minToTime(start + dur),
        duration_min: dur,
        location: p.address || p.name,
        ticket_type: p.ticket_type,
        ticket_status: p.ticket_purchased ? "purchased" : p.ticket_type === "none" ? "free" : "needed",
        locked: true,
        source_status: p.ticket_purchased ? "confirmed_by_user" : "estimated",
        source_url: p.source_url,
        notes: p.notes,
      });
    }

    const mandatory = places.filter((p) => p.priority === "mandatory" && (!p.fixed_date || p.fixed_date === day.date) && !p.fixed_time);
    for (const p of mandatory) {
      const dur = p.desired_duration_min || 120;
      let placed = false;
      for (const w of cap.freeIntervals) {
        const fit = visitFitsInInterval({
          intervalStart: w.start,
          intervalEnd: w.end,
          visitDurationMin: dur,
          openingHours: null,
          accessMin,
        });
        if (fit.fits && timeToMin(fit.start) >= cursor) {
          dayItems.push({
            step_type: "visit",
            title: p.name,
            start_time: fit.start,
            end_time: fit.end,
            duration_min: dur,
            location: p.address || p.name,
            ticket_type: p.ticket_type,
            ticket_status: p.ticket_purchased ? "purchased" : p.ticket_type === "none" ? "free" : "needed",
            locked: false,
            source_status: p.ticket_purchased ? "confirmed_by_user" : "estimated",
            source_url: p.source_url,
            notes: p.notes,
          });
          cursor = timeToMin(fit.end);
          placed = true;
          break;
        }
      }
      if (!placed) {
        conflicts.push({ place: p.name, date: day.date, reason: "Does not fit in available windows" });
      }
    }

    if (dayItems.length > 0) {
      const mealStart = Math.min(...dayItems.map((i) => timeToMin(i.end_time)).filter(Boolean));
      if (mealStart != null && !isNaN(mealStart)) {
        dayItems.push({
          step_type: "meal",
          title: "Meal break",
          start_time: minToTime(mealStart),
          end_time: minToTime(mealStart + mealMin),
          duration_min: mealMin,
          locked: false,
          source_status: "estimated",
        });
      }
    }

    // Accepted suggestions fill spare time after the existing mandatory plan.
    // Keep the established mandatory scheduling unchanged.
    for (const place of preferred) {
      if (scheduledPreferred.has(place) || (place.fixed_date && place.fixed_date !== day.date)) continue;
      const duration = place.desired_duration_min || 120;
      const gap = 30 + bufferMin + accessMin;
      const latestEnd = dayItems.length ? Math.max(...dayItems.map(item => timeToMin(item.end_time))) : null;
      for (const window of cap.freeIntervals) {
        const start = place.fixed_time ? timeToMin(place.fixed_time) : Math.max(timeToMin(window.start) + gap, latestEnd === null ? 0 : latestEnd + gap);
        const end = start + duration;
        if (start < timeToMin(window.start) + gap || (latestEnd !== null && start < latestEnd + gap) || end + 30 + bufferMin + (dayItems.length ? 0 : mealMin) > timeToMin(window.end)) continue;
        dayItems.push({ step_type: 'visit', title: place.name, start_time: minToTime(start), end_time: minToTime(end), duration_min: duration,
          location: place.address || place.name, ticket_type: place.ticket_type,
          ticket_status: place.ticket_purchased ? 'purchased' : place.ticket_type === 'none' ? 'free' : place.ticket_type ? 'needed' : 'to_verify',
          locked: Boolean(place.fixed_time), source_status: 'estimated', source_url: place.source_url, notes: place.notes });
        if (latestEnd === null && mealMin > 0) dayItems.push({ step_type: 'meal', title: 'Meal break', start_time: minToTime(end), end_time: minToTime(end + mealMin), duration_min: mealMin, locked: false, source_status: 'estimated' });
        scheduledPreferred.add(place);
        break;
      }
    }

    const sorted = [...dayItems].sort((a, b) => timeToMin(a.start_time) - timeToMin(b.start_time));
    const withTransport = [];
    for (let i = 0; i < sorted.length; i++) {
      const cur = sorted[i];
      if (i === 0) {
        withTransport.push({
          step_type: "transport",
          title: `${startPoint} → ${cur.location || cur.title}`,
          start_time: minToTime(timeToMin(cur.start_time) - 30),
          end_time: cur.start_time,
          duration_min: 30,
          route_origin: startPoint,
          route_destination: cur.location || cur.title,
          route_mode: routeMode,
          route_duration_min: 30,
          source_status: "estimated",
          notes: "Transport estimate — verify the route live before departure.",
        });
      }
      withTransport.push(cur);
      if (i < sorted.length - 1) {
        const nxt = sorted[i + 1];
        const gap = timeToMin(nxt.start_time) - timeToMin(cur.end_time);
        if (gap > 5) {
          withTransport.push({
            step_type: "transport",
            title: `${cur.location || cur.title} → ${nxt.location || nxt.title}`,
            start_time: cur.end_time,
            end_time: nxt.start_time,
            duration_min: gap,
            route_origin: cur.location || cur.title,
            route_destination: nxt.location || nxt.title,
            route_mode: routeMode,
            route_duration_min: gap,
            source_status: "estimated",
            notes: "Transport estimate — verify the route live.",
          });
        }
      }
    }
    if (withTransport.length > 0) {
      const last = withTransport[withTransport.length - 1];
      const lastLocation = ("location" in last && last.location) || last.title;
      withTransport.push({
        step_type: "transport",
        title: `${lastLocation} → ${endPoint}`,
        start_time: last.end_time,
        end_time: minToTime(timeToMin(last.end_time) + 30),
        duration_min: 30,
        route_origin: lastLocation,
        route_destination: endPoint,
        route_mode: routeMode,
        route_duration_min: 30,
        source_status: "estimated",
        notes: "Return — verify the route live.",
      });
    }

    // Overlap detection among scheduled visits on this day
    const dayVisits = withTransport.filter((i) => i.step_type === "visit");
    for (let i = 0; i < dayVisits.length; i++) {
      for (let j = i + 1; j < dayVisits.length; j++) {
        const a = dayVisits[i], b = dayVisits[j];
        const as = timeToMin(a.start_time), ae = timeToMin(a.end_time);
        const bs = timeToMin(b.start_time), be = timeToMin(b.end_time);
        if (as != null && ae != null && bs != null && be != null && as < be && bs < ae) {
          conflicts.push({ place: `${a.title} ↔ ${b.title}`, date: day.date, reason: "Time overlap" });
        }
      }
    }

    withTransport.sort((a, b) => timeToMin(a.start_time) - timeToMin(b.start_time));
    withTransport.forEach((it, idx) => {
      items.push({ ...it, trip_id: trip.id, date: day.date, sort_order: idx, version });
    });
  }

  // Budget validation
  for (const place of preferred) if (!scheduledPreferred.has(place)) conflicts.push({ place: place.name, date: place.fixed_date || '—', reason: 'Preferred place does not fit after mandatory visits and time allowances.' });
  const totalActivityCost = items
    .filter((i) => i.step_type === "visit")
    .reduce((sum, i) => sum + (i.cost || 0), 0);
  const budgetLimit = trip.budget_activities || 0;
  const budgetExceeded = budgetLimit > 0 && totalActivityCost > budgetLimit;
  if (budgetExceeded) {
    conflicts.push({ place: "Activity budget", date: "—", reason: `Exceeded by ${Math.round(totalActivityCost - budgetLimit)} ${trip.currency || ""}` });
  }

  return { items, conflicts, version, totalActivityCost, budgetExceeded };
}

// ---------- Selection simulation ----------

export function simulateSelection({ trip, dayWindows, currentPlaces, candidate, mealMin = 60, bufferMin = 15 }) {
  const toggled = candidate.add
    ? [...currentPlaces, candidate.place]
    : currentPlaces.filter((p) => p.name !== candidate.place.name);

  const { items, conflicts } = buildItinerary({ trip, dayWindows, places: toggled, mealMin, bufferMin });

  const inserted = items.find((i) => i.step_type === "visit" && i.title === candidate.place.name);

  const remainingByDay = {};
  for (const dw of dayWindows) {
    const cap = dayCapacity({ windows: dw.windows, blocked: dw.blocked, mealMin, bufferMin });
    const usedByVisits = items
      .filter((i) => i.date === dw.date && i.step_type === "visit")
      .reduce((s, i) => s + (i.duration_min || 0), 0);
    remainingByDay[dw.date] = Math.max(0, cap.totalFreeMin - usedByVisits);
  }

  return {
    feasible: !conflicts.some((c) => c.place === candidate.place.name),
    insertedDay: inserted?.date || null,
    insertedInterval: inserted ? `${inserted.start_time}–${inserted.end_time}` : null,
    transportChangeMin: 0,
    remainingCapacityByDay: remainingByDay,
    conflicts: conflicts.filter((c) => c.place === candidate.place.name),
    toggledPlaces: toggled,
  };
}

// ---------- Google Maps navigation link ----------

export function buildMapsLink({ origin, destination, mode = "transit" }) {
  if (!origin || !destination) return "";
  const o = encodeURIComponent(origin);
  const d = encodeURIComponent(destination);
  const travelMode = { walk: 'walking', taxi: 'driving', car: 'driving', transit: 'transit' }[mode] || 'transit';
  return `https://www.google.com/maps/dir/?api=1&origin=${o}&destination=${d}&travelmode=${travelMode}`;
}

// ---------- Status helpers ----------

export const STATUS_LABELS = {
  draft: "Draft",
  calculated: "Itinerary calculated",
  needs_verification: "Needs verification",
  ready: "Ready (verified data)",
  in_progress: "In progress",
  completed: "Completed",
};

export const SOURCE_LABELS = {
  confirmed_by_user: "Confirmed by user",
  confirmed_by_document: "Confirmed by document",
  api_provided: "API-provided",
  estimated: "Estimated",
  unknown: "Unknown",
  expired: "Expired",
  conflicting: "Conflicting sources",
};

export const PRIORITY_LABELS = {
  mandatory: "Mandatory",
  preferred: "Preferred",
  suggestion: "Suggestion",
  excluded: "Excluded",
};

// Shift all non-locked items after a given item on the same day by delayMin minutes.
// Locked (fixed-time) items stay put; items that would push past 23:00 are flagged.
export function shiftDayAfter({ dayItems, itemId, delayMin }) {
  const idx = dayItems.findIndex((i) => i.id === itemId);
  if (idx === -1 || delayMin <= 0) return { shifted: dayItems, overflow: false };
  let overflow = false;
  const shifted = dayItems.map((it, i) => {
    if (i <= idx) return it;
    if (it.locked) return it;
    const s = timeToMin(it.start_time);
    const e = timeToMin(it.end_time);
    if (s == null || e == null) return it;
    const newEnd = e + delayMin;
    if (newEnd > 23 * 60) overflow = true;
    return { ...it, start_time: minToTime(s + delayMin), end_time: minToTime(newEnd) };
  });
  return { shifted, overflow };
}

// Returns specific issues for a single TripItem — each: { field, label, reason }
export function getItemIssues(item) {
  if (!item) return [];
  const issues = [];
  if (item.category === "flight") {
    if (!item.departure_datetime)
      issues.push({ field: "departure_datetime", label: "Departure time", reason: "Without it, the first day schedule is approximate." });
    if (!item.arrival_datetime)
      issues.push({ field: "arrival_datetime", label: "Arrival time", reason: "Needed to calculate when you can start visits on the first day." });
  } else if (item.category === "stay") {
    if (!item.address)
      issues.push({ field: "address", label: "Hotel address", reason: "Without it, transfers from/to the hotel are marked as uncalculated." });
    if (!item.date)
      issues.push({ field: "date", label: "Check-in date", reason: "Needed to know which nights are covered." });
    if (!item.end_date)
      issues.push({ field: "end_date", label: "Check-out date", reason: "Needed to know which nights are covered." });
  } else if (item.category === "place") {
    if (!item.address && !item.place_id)
      issues.push({ field: "address", label: "Location", reason: "Without a location, this place can't be included in the calculated route." });
  }
  return issues;
}

export function isItemIncomplete(item) {
  return getItemIssues(item).length > 0;
}

// Full trip validation for finalization.
// Returns { essential: [...], optional: [...] }
// Each issue: { recordName, field, fieldLabel, reason, recordType, recordId, stepIndex }
// stepIndex: wizard step to fix it (0=Trip, 1=Stay, 3=Places, null=Dashboard only)
export function validateTripForFinalize({ trip, tripItems = [], places = [] }) {
  const essential = [];
  const optional = [];

  // --- Essential: destination ---
  if (!trip.destination || !trip.destination.trim()) {
    essential.push({
      recordName: trip.name || "Trip",
      field: "destination",
      fieldLabel: "Destination",
      reason: "We need a destination to build the itinerary around.",
      recordType: "trip",
      stepIndex: 0,
    });
  }

  // --- Essential: valid date range ---
  if (!trip.start_date || !trip.end_date) {
    essential.push({
      recordName: trip.name || "Trip",
      field: "dates",
      fieldLabel: "Travel dates",
      reason: "We need the travel dates to schedule visits.",
      recordType: "trip",
      stepIndex: 0,
    });
  } else if (new Date(trip.end_date + "T00:00:00") < new Date(trip.start_date + "T00:00:00")) {
    essential.push({
      recordName: trip.name || "Trip",
      field: "dates",
      fieldLabel: "Travel dates",
      reason: "Return date is before departure date.",
      recordType: "trip",
      stepIndex: 0,
    });
  }

  // --- Optional: per-record issues from existing TripItems ---
  for (const item of tripItems) {
    const issues = getItemIssues(item);
    for (const iss of issues) {
      optional.push({
        recordName: item.title || item.category,
        field: iss.field,
        fieldLabel: iss.label,
        reason: iss.reason,
        recordType: item.category,
        recordId: item.id,
        stepIndex: item.category === "stay" ? 1 : item.category === "place" ? 3 : null,
      });
    }
  }

  // --- Optional: mandatory PlaceSelections without location ---
  for (const p of places) {
    if (p.priority === "mandatory" && !p.address && !p.place_id) {
      optional.push({
        recordName: p.name,
        field: "address",
        fieldLabel: "Location",
        reason: "Mandatory place without a location can't be scheduled. Add the address or downgrade to 'preferred'.",
        recordType: "place",
        recordId: p.id,
        stepIndex: 3,
      });
    }
  }

  return { essential, optional };
}
