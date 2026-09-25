import { Navigate, useParams } from 'react-router-dom';

// Preserve saved links while keeping private files in one central organizer.
export default function TripDocuments() {
  const {tripId}=useParams();
  return <Navigate replace to={`/trip/${tripId}/wallet?category=document`}/>;
}
