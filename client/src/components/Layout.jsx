import {useState} from 'react';
import {Link,NavLink,Outlet,useParams} from 'react-router-dom';
import {GitBranch,LayoutDashboard,Folder,FileText,TriangleAlert,ChartNoAxesCombined,LogOut,Menu,X} from 'lucide-react';
import {useAuth} from '../context/AuthContext.jsx';
import {Notice} from './UI.jsx';
import {errorMessage} from '../lib/api.js';
export default function Layout(){
  const {user,logout}=useAuth();const {projectId}=useParams();const [open,setOpen]=useState(false),[error,setError]=useState('');
  const links=[['',LayoutDashboard,'Overview'],['/sources',FileText,'Sources'],['/incidents',TriangleAlert,'Incidents'],['/evaluation',ChartNoAxesCombined,'Evaluation']];
  return <div className="app-shell"><header className="mobile-header"><Link className="brand" to="/projects"><GitBranch size={22}/>RootTrace</Link><button className="icon-button" aria-label={open?'Close navigation':'Open navigation'} aria-expanded={open} onClick={()=>setOpen(!open)}>{open?<X/>:<Menu/>}</button></header><aside className={`sidebar ${open?'is-open':''}`} aria-label="Workspace navigation"><Link className="brand" to="/projects"><GitBranch size={25}/>RootTrace<span className="brand-dot"/></Link><div className="sidebar-label">WORKSPACE</div><nav onClick={()=>setOpen(false)}><NavLink to="/projects" end><Folder size={18}/> All projects</NavLink>{projectId&&<><div className="sidebar-label">PROJECT</div>{links.map(([suffix,Icon,label])=><NavLink key={label} to={`/projects/${projectId}${suffix}`} end={!suffix}><Icon size={18}/>{label}</NavLink>)}</>}</nav><div className="sidebar-foot"><div className="avatar">{user.name.slice(0,1).toUpperCase()}</div><div className="user-name"><strong>{user.name}</strong><span>Personal workspace</span></div><button className="icon-button" aria-label="Log out" onClick={async()=>{try{await logout();}catch(e){setError(errorMessage(e));}}}><LogOut size={17}/></button></div></aside><main className="workspace"><div className="topbar"><span>Engineering workspace</span><span className="topbar-note"><span className="status-dot"/>Evidence first</span></div><Notice>{error}</Notice><Outlet/></main></div>;
}
