import {Navigate,Routes,Route,Outlet} from 'react-router-dom';
import {AuthProvider,useAuth} from './context/AuthContext.jsx';
import {Loading} from './components/UI.jsx';
import Auth from './pages/Auth.jsx';
function Protected(){const {user,loading}=useAuth();if(loading)return <Loading/>;return user?<Outlet/>:<Navigate to="/login" replace/>;}
export default function App(){return <AuthProvider><Routes><Route path="/" element={<Navigate to="/projects" replace/>}/><Route path="/login" element={<Auth/>}/><Route path="/register" element={<Auth register/>}/><Route element={<Protected/>}><Route path="/projects" element={<main><h1>Your projects</h1></main>}/></Route><Route path="*" element={<main><h1>Page not found</h1><a href="/projects">Return to projects</a></main>}/></Routes></AuthProvider>;}
