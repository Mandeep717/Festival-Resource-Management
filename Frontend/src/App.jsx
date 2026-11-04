import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { Button, Loading } from "./components/UI";
import { ForgotPasswordPage, LoginPage, RegisterPage } from "./pages/AuthPages";
import { FestivalGuidePage, FestivalPage, LandingPage } from "./pages/PublicPages";
import Workspace from "./pages/Workspace";

function ProtectedWorkspace() {
  const { user, loading } = useAuth(); const location = useLocation();
  if (loading) return <Loading label="Preparing your workspace" />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  return <Workspace />;
}

function SessionRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <Loading label="Checking your session" />;
  return user ? <Navigate to="/workspace/overview" replace /> : <Navigate to="/login" replace />;
}

function NotFound() {
  return <div className="grid min-h-screen place-items-center bg-[#f7f8f5] px-5"><div className="max-w-md text-center"><p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-700">A small detour</p><h1 className="mt-3 text-3xl font-semibold text-slate-900">We couldn’t find that page</h1><p className="mt-3 text-sm leading-6 text-slate-500">The link may have changed, or the page may not be available yet.</p><div className="mt-6 flex justify-center gap-3"><Link to="/"><Button>Back to festivals</Button></Link><Link to="/workspace/overview"><Button variant="secondary">My workspace</Button></Link></div></div></div>;
}

function AppRoutes() {
  return <Routes>
    <Route path="/" element={<LandingPage />} />
    <Route path="/festival-guide" element={<FestivalGuidePage />} />
    <Route path="/festivals/:slug" element={<FestivalPage />} />
    <Route path="/login" element={<LoginPage />} />
    <Route path="/register" element={<RegisterPage />} />
    <Route path="/forgot-password" element={<ForgotPasswordPage />} />
    <Route path="/workspace/:section?" element={<ProtectedWorkspace />} />
    <Route path="/app" element={<SessionRedirect />} />
    <Route path="*" element={<NotFound />} />
  </Routes>;
}

export default function App() {
  return <BrowserRouter><AuthProvider><AppRoutes /></AuthProvider></BrowserRouter>;
}
