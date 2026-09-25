import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Compass, UserRound } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import TripBagCard from "@/components/home/TripBagCard";
import NewTripCard from "@/components/home/NewTripCard";
import NewTripDialog from "@/components/home/NewTripDialog";
import ScrollVideo from "@/components/home/ScrollVideo";
import { useAuth } from '@/lib/AuthContext';

const VIDEOS = [
  "/media/fe6b26627_travel_app_Seedance_20_Reference_2026-07-23_13-49-19.mp4",
];

export default function Home() {
  const {user}=useAuth();
  const [trips, setTrips] = useState(null);
  const [endedByTrip, setEndedByTrip] = useState({});
  const [newOpen, setNewOpen] = useState(false);
  const [windowOpened, setWindowOpened] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    api.entities.Trip.list("-created_date").then((list) => {
      // On a fresh visit, jump straight into the last opened trip bag
      const lastTrip = localStorage.getItem("tripsync_last_trip");
      if (!sessionStorage.getItem("tripsync_entered")) {
        sessionStorage.setItem("tripsync_entered", "1");
        if (new URLSearchParams(window.location.search).get('trips') !== '1' && lastTrip && list.some((t) => t.id === lastTrip)) {
          navigate(`/trip/${lastTrip}`, { replace: true });
          return;
        }
      }
      setTrips(list);
    });
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
    });
  }, []);

  // Clicking the airplane window enters the last trip you worked on
  const openLastTrip = () => {
    const last = localStorage.getItem("tripsync_last_trip");
    const target = trips?.some((t) => t.id === last) ? last : trips?.[0]?.id;
    if (target) navigate(`/trip/${target}`);
  };

  return (
    <div className="relative bg-black">
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
          <Link to="/" title="Home" className="flex items-center gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-lime flex items-center justify-center shrink-0">
              <Compass className="w-4 h-4 sm:w-5 sm:h-5 text-neutral-900" />
            </div>
            <div>
              <h1 className="font-heading font-black tracking-[-0.03em] text-white text-lg sm:text-2xl leading-none">TripSync.</h1>
              <p className="font-mono text-[13px] font-light uppercase tracking-[0.05em] text-white/70 mt-0.5 whitespace-nowrap">Personal Travel App</p>
            </div>
          </Link>
          {['ADMIN','SUPER_ADMIN'].includes(user?.role)&&<Link to="/admin" className="text-sm text-lime ml-auto mr-3">Admin</Link>}
          <Link to="/profile" title="My account" className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center shrink-0 transition-colors">
            <UserRound className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
          </Link>
        </div>
        <div className="flex-1 flex flex-col items-center text-center">
          <div className="flex-1 flex flex-col items-center justify-center">
            <p className="font-mono text-[13px] font-light uppercase tracking-[0.3em] text-lime mb-2">Your Trips</p>
            <h2 className="font-heading font-medium tracking-[-0.04em] text-white text-4xl sm:text-5xl leading-none">Where to next?</h2>
            <p className="text-white text-sm sm:text-base font-light mt-3">
              Plan your journey with ease,
              <br />
              all your travel data organized in one place.
            </p>
          </div>
          <div className="pb-4 w-full flex justify-center">
          {trips === null ? (
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
