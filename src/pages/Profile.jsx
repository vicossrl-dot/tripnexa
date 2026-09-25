import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import { ArrowLeft, LogOut, Compass } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import AvatarUpload from "@/components/profile/AvatarUpload";
import ProfileForm from "@/components/profile/ProfileForm";
import PreferencesForm from "@/components/profile/PreferencesForm";
import TravelPassport from "@/components/profile/TravelPassport";
import TodoList from "@/components/profile/TodoList";
import AccountSecurity from '@/components/profile/AccountSecurity';
import ConnectedAccounts from '@/components/profile/ConnectedAccounts';

export default function Profile() {
  const [user, setUser] = useState(null);
  const [error,setError]=useState('');

  useEffect(() => {
    api.auth.me().then(setUser).catch(failure=>setError(failure.message));
  }, []);

  return (
    <div className="min-h-screen bg-black">
      {error&&<p role="alert" className="p-6 text-amber-200">{error} <button onClick={()=>window.location.reload()}>Retry</button></p>}
      {!user&&!error&&<p role="status" className="p-6 text-white/70">Loading your profile…</p>}
      <header className="flex items-center justify-between gap-3 px-[15px] py-[15px]">
        <div className="flex items-center gap-3">
          <Link
            to="/"
            title="Back home"
            className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center shrink-0 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
          </Link>
          <Link to="/" title="Home" className="flex items-center gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-lime flex items-center justify-center shrink-0">
              <Compass className="w-4 h-4 sm:w-5 sm:h-5 text-neutral-900" />
            </div>
            <div>
              <h1 className="font-heading font-black tracking-[-0.03em] text-white text-lg sm:text-2xl leading-none">TripSync.</h1>
              <p className="text-[8px] sm:text-[10px] font-light uppercase tracking-[0.2em] text-white/50 mt-0.5">Personal Travel App</p>
            </div>
          </Link>
        </div>
        <button
          onClick={() => api.auth.logout("/login")}
          className="flex items-center gap-2 h-8 sm:h-10 px-3 sm:px-4 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-medium transition-colors"
        >
          <LogOut className="w-4 h-4" /> Log out
        </button>
      </header>

      {user === null ? (
        <div className="flex justify-center py-32">
          <div className="w-8 h-8 border-4 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <section className="flex flex-col items-center text-center pt-10 sm:pt-14 pb-10 px-[15px]">
            <AvatarUpload user={user} onChange={(avatar_url) => setUser({ ...user, avatar_url })} />
            <p className="text-[10px] font-light uppercase tracking-[0.3em] text-lime mt-5 mb-2">My Account</p>
            <h2 className="font-heading font-medium tracking-[-0.04em] text-white text-4xl sm:text-6xl leading-none">
              {user.display_name || user.full_name || "Traveler"}
            </h2>
            <p className="text-white/50 text-sm sm:text-base font-light mt-3">{user.email}</p>
          </section>

          <Tabs defaultValue="details" className="pb-16">
            <div className="flex justify-center px-[15px]">
              <TabsList className="h-auto flex flex-wrap justify-center bg-white/10 rounded-2xl p-1 mb-8">
                <TabsTrigger value="details" className="min-h-11 px-5 sm:px-7 rounded-full text-white/70 data-[state=active]:bg-white data-[state=active]:text-neutral-900">Personal Details</TabsTrigger>
                <TabsTrigger value="preferences" className="min-h-11 px-5 sm:px-7 rounded-full text-white/70 data-[state=active]:bg-white data-[state=active]:text-neutral-900">Preferences</TabsTrigger>
                <TabsTrigger value="passport" className="min-h-11 px-5 sm:px-7 rounded-full text-white/70 data-[state=active]:bg-white data-[state=active]:text-neutral-900">Places Visited</TabsTrigger>
                <TabsTrigger value="todo" className="min-h-11 px-5 sm:px-7 rounded-full text-white/70 data-[state=active]:bg-white data-[state=active]:text-neutral-900">To-Do</TabsTrigger>
                <TabsTrigger value="security" className="min-h-11 px-5 rounded-full text-white/70 data-[state=active]:bg-white data-[state=active]:text-neutral-900">Security & privacy</TabsTrigger>
              </TabsList>
            </div>
            <div className="max-w-3xl mx-auto px-[15px]">
              <TabsContent value="security" className="space-y-6"><ConnectedAccounts/><AccountSecurity/></TabsContent>
              <TabsContent value="details">
                <div className="bg-white rounded-[12px] p-6 sm:p-8">
                  <h3 className="font-heading font-bold text-neutral-900 text-lg mb-1">Personal Details</h3>
                  <p className="text-sm text-neutral-500 mb-6">How should we address you and where home is</p>
                  <ProfileForm user={user} />
                </div>
              </TabsContent>
              <TabsContent value="preferences">
                <div className="bg-white rounded-[12px] p-6 sm:p-8">
                  <h3 className="font-heading font-bold text-neutral-900 text-lg mb-1">Travel Preferences</h3>
                  <p className="text-sm text-neutral-500 mb-6">Little details that make every trip yours.</p>
                  <PreferencesForm user={user} />
                </div>
              </TabsContent>
              <TabsContent value="passport">
                <div className="bg-white rounded-[12px] p-6 sm:p-8">
                  <h3 className="font-heading font-bold text-neutral-900 text-lg mb-1">Places Visited</h3>
                  <p className="text-sm text-neutral-500 mb-6">All the places you've already been.</p>
                  <TravelPassport />
                </div>
              </TabsContent>
              <TabsContent value="todo">
                <div className="bg-white rounded-[12px] p-6 sm:p-8">
                  <h3 className="font-heading font-bold text-neutral-900 text-lg mb-1">My To-Do List</h3>
                  <p className="text-sm text-neutral-500 mb-6">Everything to sort out before you fly.</p>
                  <TodoList />
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </>
      )}
    </div>
  );
}
