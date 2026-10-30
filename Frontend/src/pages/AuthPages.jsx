import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Music2 } from "lucide-react";
import { post } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Button, Card, Field, Notice, SelectField } from "../components/UI";

function AuthFrame({ title, description, children }) {
  return <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#e6eee8] via-[#f7f8f5] to-[#f2ebdf] px-4 py-10"><div className="w-full max-w-md"><Link to="/" className="mb-7 inline-flex items-center gap-2 text-sm font-semibold text-teal-800"><ArrowLeft size={16} /> Back to festivals</Link><Card className="p-7 sm:p-9"><div className="mb-7 flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-teal-800 text-white"><Music2 size={20} /></span><div><p className="text-xs font-bold uppercase tracking-widest text-teal-700">Common Ground</p><p className="text-sm text-slate-500">Campus festival</p></div></div><h1 className="text-2xl font-semibold text-slate-900">{title}</h1><p className="mt-2 text-sm leading-6 text-slate-500">{description}</p><div className="mt-6">{children}</div></Card></div></div>;
}

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [accountType, setAccountType] = useState("attendee");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault(); setError(""); setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      await login(accountType, { email: form.get("email"), password: form.get("password") });
      const requested = new URLSearchParams(location.search).get("next");
      if (requested === "festival") navigate(-1);
      else if (requested?.startsWith("/") && !requested.startsWith("//")) navigate(requested, { replace: true });
      else navigate("/workspace/overview", { replace: true });
    }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <AuthFrame title="Welcome back" description="Sign in to pick up where you left off."><form onSubmit={submit} className="grid gap-4"><SelectField label="I’m signing in as" value={accountType} onChange={(e) => setAccountType(e.target.value)} options={[{value:"attendee",label:"Attendee"},{value:"volunteer",label:"Volunteer"},{value:"organizer",label:"Organizer"},{value:"admin",label:"Administrator"}]} /><Field label="Email" name="email" type="email" autoComplete="email" required placeholder="you@example.com" /><Field label="Password" name="password" type="password" autoComplete="current-password" required placeholder="Your password" />{error && <Notice>{error}</Notice>}<Button type="submit" disabled={busy} className="mt-1 w-full">{busy ? "Signing in…" : "Sign in"}</Button><div className="flex justify-between text-sm"><Link to={`/forgot-password?role=${accountType}`} className="font-medium text-teal-800 hover:underline">Forgot password?</Link><Link to="/register" className="font-medium text-teal-800 hover:underline">Create account</Link></div></form></AuthFrame>;
}

export function RegisterPage() {
  const { register } = useAuth(); const navigate = useNavigate();
  const [accountType, setAccountType] = useState("attendee"); const [error, setError] = useState(""); const [success, setSuccess] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault(); setError(""); setSuccess(""); setBusy(true); const form = new FormData(event.currentTarget);
    const password = form.get("password"); if (password.length < 8) { setError("Use at least 8 characters for your password."); setBusy(false); return; }
    try { await register(accountType, { name: form.get("name"), email: form.get("email"), password }); setSuccess("Your account is ready. Sign in to continue."); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <AuthFrame title="Join the gathering" description="Create an account to register for sessions or help run the festival."><form onSubmit={submit} className="grid gap-4"><SelectField label="Account type" value={accountType} onChange={(e) => setAccountType(e.target.value)} options={[{value:"attendee",label:"Attendee"},{value:"volunteer",label:"Volunteer"},{value:"organizer",label:"Organizer"}]} /><p className="-mt-2 text-xs leading-5 text-slate-500">Volunteer and organizer access to a festival may require membership approval.</p><Field label="Full name" name="name" autoComplete="name" required placeholder="Your name" /><Field label="Email" name="email" type="email" autoComplete="email" required placeholder="you@example.com" /><Field label="Password" name="password" type="password" autoComplete="new-password" required minLength={8} placeholder="At least 8 characters" />{error && <Notice>{error}</Notice>}{success && <Notice tone="success">{success}</Notice>}<Button type="submit" disabled={busy} className="w-full">{busy ? "Creating account…" : "Create account"}</Button>{success && <Button type="button" variant="secondary" onClick={() => navigate("/login")}>Go to sign in</Button>}<p className="text-center text-sm text-slate-500">Already have an account? <Link to="/login" className="font-semibold text-teal-800">Sign in</Link></p></form></AuthFrame>;
}

export function ForgotPasswordPage() {
  const params = new URLSearchParams(useLocation().search); const [role, setRole] = useState(params.get("role") || "attendee"); const [error, setError] = useState(""); const [success, setSuccess] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(event) { event.preventDefault(); setBusy(true); setError(""); setSuccess(""); const email = new FormData(event.currentTarget).get("email"); try { const result = await post(`/${role}/forgot-password`, { email }); setSuccess(result.message || "If the email exists, recovery instructions will be sent."); } catch (err) { setError(err.message); } finally { setBusy(false); } }
  return <AuthFrame title="Reset your password" description="Enter your account email and we’ll start the recovery process."><form onSubmit={submit} className="grid gap-4"><SelectField label="Account type" value={role} onChange={(e) => setRole(e.target.value)} options={["attendee","volunteer","organizer"]} /><Field label="Email" name="email" type="email" required placeholder="you@example.com" />{error && <Notice>{error}</Notice>}{success && <Notice tone="success">{success}</Notice>}<p className="text-xs leading-5 text-slate-500">Password recovery depends on the backend’s email delivery and reset flow.</p><Button type="submit" disabled={busy} className="w-full">{busy ? "Sending…" : "Continue"}</Button><Link to="/login" className="text-center text-sm font-semibold text-teal-800">Return to sign in</Link></form></AuthFrame>;
}
