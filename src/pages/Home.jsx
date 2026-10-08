import { t, translateText } from "@/i18n/runtime";
import { useLocale } from "@/i18n/react";
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Compass, UserRound } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import TripBagCard from "@/components/home/TripBagCard";
import NewTripCard from "@/components/home/NewTripCard";
import NewTripDialog from "@/components/home/NewTripDialog";
import ScrollVideo from "@/components/home/ScrollVideo";
import BrandMark from '@/components/BrandMark';
import { useAuth } from '@/lib/AuthContext';
import LanguageButton from '@/components/LanguageButton';

import { INTRO_VIDEO_URL } from "@/lib/public-media";

const VIDEOS = [INTRO_VIDEO_URL];

export default function Home() {
  useLocale();
  const {user}=useAuth();
  const [trips, setTrips] = useState(null);
  const [error, setError] = useState('');
  const [endedByTrip, setEndedByTrip] = useState({});
  const [newOpen, setNewOpen] = useState(false);
  const [windowOpened, setWindowOpened] = useState(false);
  const navigate = useNavigate();

  const loadTrips = () => {
    setError('');
    api.entities.Trip.list("-created_date").then((list) => {
      sessionStorage.setItem("tripsync_entered", "1");
      setTrips(list);
    }).catch(failure => setError(failure.message));
  };

  useEffect(() => {
    loadTrips();
    // Find each trip's last date; trips fully in the past get a passport stamp
    api.entities.TripItem.list(undefined, 500).then((items) => {
      const lastDate = {};
      items.forEach((i) => {
        const d = i.end_date || i.date;
        if (d && (!lastDate[i.trip_id] || d > lastDate[i.trip_id])) lastDate[i.trip_id] = d;
      });
      const today = new Date().toISOString().slice(0, 10);
      const ended = {};
      Object.entries(lastDate).forEach(([tripId, d]) => { if (d < today) ended[tripId] = d; });
      setEndedByTrip(ended);
    }).catch(() => { /* Optional passport stamps must not block the trip list. */ });
  }, []);

  // Clicking the airplane window enters the last trip you worked on
  const openLastTrip = () => {
    const last = localStorage.getItem("tripsync_last_trip");
    const target = trips?.some((t) => t.id === last) ? last : trips?.[0]?.id;
    if (target) navigate(`/trip/${target}`);
  };

  return (
    <div className="cinematic-trips relative bg-black">
      <ScrollVideo
        srcs={VIDEOS}
        endImage="/media/3e19e9ad6_travel_app_Gemini_3__Nano_Banana_Pro__2026-07-21_09-15-04.png"
        openImage="/media/c87db4dfa_travel_app_Gemini_3__Nano_Banana_Pro__2026-07-21_10-52-07.png"
        onOpen={openLastTrip}
        onOpening={() => setWindowOpened(true)}
      />
      <div className={`fixed inset-0 bg-gradient-to-b from-black/70 via-transparent to-black/90 pointer-events-none transition-opacity [transition-duration:1400ms] ${windowOpened ? "opacity-0" : "opacity-100"}`} />
      <div className={`fixed inset-0 pointer-events-none [background:radial-gradient(ellipse_45%_35%_at_50%_44%,rgba(0,0,0,0.45),transparent_70%)] transition-opacity [transition-duration:1400ms] ${windowOpened ? "opacity-0" : "opacity-100"}`} />
      <div className="h-[200vh]" aria-hidden="true" />
      <div className="fixed inset-0 z-10 flex flex-col px-[15px] py-[15px] pointer-events-none">
        <div className="flex items-center justify-between gap-3 pointer-events-auto">
          <Link to="/?trips=1" title={t("ui.home.3a78695")} className="flex items-center gap-3">
            <BrandMark className="h-8 sm:h-10 w-auto max-w-[min(60vw,12rem)] object-contain shrink-0" fallback={mark=><>
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-lime flex items-center justify-center shrink-0">
                <Compass className="w-4 h-4 sm:w-5 sm:h-5 text-neutral-900" />
              </div>
              <div>
                <h1 className="font-heading font-black tracking-[-0.03em] text-white text-lg sm:text-2xl leading-none">{mark.wordmark}</h1>
                <p className="font-mono text-[13px] font-light uppercase tracking-[0.05em] text-white/70 mt-0.5 whitespace-nowrap">{t("ui.personal.travel.app.18a05a7")}</p>
              </div>
            </>} />
          </Link>
          {['ADMIN','SUPER_ADMIN'].includes(user?.role)&&<Link to="/admin" className="text-sm text-lime ml-auto mr-3">Admin</Link>}
          <LanguageButton className="inline-flex items-center gap-2 rounded-xl bg-white/10 hover:bg-white/20 text-white px-3 py-2 mr-2"/>
          <Link to="/profile" title={t("ui.my.account.b53181a")} className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center shrink-0 transition-colors">
            <UserRound className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
          </Link>
        </div>
        <div className="flex-1 flex flex-col items-center text-center">
          <div className="flex-1 flex flex-col items-center justify-center">
            <p className="font-mono text-[13px] font-light uppercase tracking-[0.3em] text-lime mb-2">{t("ui.your.trips.06358db")}</p>
            <h2 className="font-heading font-medium tracking-[-0.04em] text-white text-4xl sm:text-5xl leading-none">{t("ui.where.to.next.4473a6d")}</h2>
            <p className="text-white text-sm sm:text-base font-light mt-3">{t("ui.plan.your.journey.with.ease.b8b883a")}<br />{t("ui.all.your.travel.data.organized.in.one.place.56d3f71")}</p>
          </div>
          <div className="pb-4 w-full flex justify-center">
          {error ? (
            <div role="alert" className="pointer-events-auto text-white text-sm"><p>{translateText(error)}</p><button type="button" className="mt-2 underline" onClick={loadTrips}>{t("ui.try.again.d8b8392")}</button></div>
          ) : trips === null ? (
            <div className="w-8 h-8 border-4 border-white/20 border-t-white rounded-full animate-spin" />
          ) : (
            <div className="pointer-events-auto w-[calc(100%+30px)] -mx-[15px] max-w-none overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex w-max mx-auto items-start gap-2 px-[15px]">
                {trips.map((trip) => (
                  <TripBagCard
                    key={trip.id}
                    trip={trip}
                    endedOn={endedByTrip[trip.id]}
                    onDeleted={(id) => setTrips((list) => list.filter((t) => t.id !== id))}
                  />
                ))}
                <NewTripCard onClick={() => setNewOpen(true)} />
              </div>
            </div>
          )}
          </div>
        </div>
      </div>
      <NewTripDialog open={newOpen} onClose={() => setNewOpen(false)} />
    </div>
  );
}
