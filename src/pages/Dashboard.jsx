import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '@/api/client';
import { TripNavigation, TripLoading } from '@/components/trip/TripUI';
import TripOverview from '@/components/trip/TripOverview';

export default function Dashboard() {
  const {tripId}=useParams();
  const [data,setData]=useState(null),[error,setError]=useState(''),[revision,setRevision]=useState(0);
  useEffect(()=>{
    let active=true;setData(null);setError('');
    Promise.all([api.entities.Trip.get(tripId),api.getItinerary(tripId),api.wallet.list(tripId),api.entities.PlaceSelection.filter({trip_id:tripId},'created_date',1000)])
      .then(([trip,plan,wallet,places])=>{if(active)setData({trip,plan,items:wallet.items,places});}).catch(failure=>{if(active)setError(failure.message);});
    localStorage.setItem('tripsync_last_trip',tripId);sessionStorage.setItem('tripsync_entered','1');
    return()=>{active=false;};
  },[tripId,revision]);
  if(!data)return <TripLoading error={error}/>;
  return <div className="trip-experience"><TripNavigation trip={data.trip} onUpdated={trip=>setData(previous=>({...previous,trip}))}/><main className="trip-container py-6 sm:py-8 pb-16"><TripOverview {...data} onUpdated={()=>setRevision(v=>v+1)}/></main></div>;
}
