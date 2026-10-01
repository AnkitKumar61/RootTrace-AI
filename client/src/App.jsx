import {Navigate,Routes,Route,Outlet} from 'react-router-dom';
import {AuthProvider,useAuth} from './context/AuthContext.jsx';
import {Loading} from './components/UI.jsx';
import Auth from './pages/Auth.jsx';
import Layout from './components/Layout.jsx';
import Projects from './pages/Projects.jsx';
import ProjectLayout from './pages/ProjectLayout.jsx';
function Protected(){const {user,loading}=useAuth();if(loading)return <Loading/>;return user?<Outlet/>:<Navigate to="/login" replace/>;}
export default function App(){return <AuthProvider><Routes><Route path="/" element={<Navigate to="/projects" replace/>}/><Route path="/login" element={<Auth/>}/><Route path="/register" element={<Auth register/>}/><Route element={<Protected/>}><Route element={<Layout/>}><Route path="/projects" element={<Projects/>}/><Route path="/projects/:projectId" element={<ProjectLayout/>}><Route index element={<p>Add sources to begin investigating.</p>}/></Route></Route></Route><Route path="*" element={<main><h1>Page not found</h1><a href="/projects">Return to projects</a></main>}/></Routes></AuthProvider>;}
