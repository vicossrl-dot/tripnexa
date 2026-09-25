import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { api } from '@/api/client';
import { Compass, ShieldCheck, LogOut } from 'lucide-react';
export const ADMIN_GROUPS=[
 ['Management',[['users','Users'],['trips','Trips'],['files','Travel Wallet / Files']]],
 ['Operations',[['analytics','Analytics'],['ai','AI & Providers'],['integrations','Integrations'],['email','Email'],['logs','Logs'],['audit','Audit'],['health','System Health']]],
 ['Revenue',[['tours-tickets','Tours & Tickets'],['referrals','Referral Links'],['affiliate-analytics','Affiliate Analytics']]],
 ['Configuration',[['domains','Domains & URLs'],['authentication','Authentication Providers'],['settings','App Settings'],['branding','Branding'],['features','Feature Flags'],['limits','Limits & Quotas'],['security','Security']]],
 ['System',[['maintenance','Maintenance'],['jobs','Jobs'],['support','Support'],['data','Data Inspector']]],
];
export default function AdminLayout({children}) {
 const {user}=useAuth();
 return <div className="admin-shell"><aside className="admin-sidebar"><Link to="/admin" className="admin-brand"><Compass size={27}/><span>TripSync<span className="admin-caption">ADMINISTRATION</span></span></Link><nav aria-label="Administration"><NavLink end to="/admin">Dashboard</NavLink>{ADMIN_GROUPS.map(([group,links])=><section key={String(group)}><h2>{String(group)}</h2>{Array.isArray(links)&&links.map(([path,label])=><NavLink key={path} to={'/admin/'+path}>{label}</NavLink>)}</section>)}</nav><footer><ShieldCheck size={17}/><strong>{user?.display_name||user?.email}</strong><small>{user?.role}</small><Link to="/">Open TripSync</Link><button onClick={()=>api.auth.logout()}><LogOut size={15}/> Sign out</button></footer></aside><main className="admin-main">{children}</main></div>;
}
