import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowRight, CalendarDays, MapPin, Music2, Sparkles } from "lucide-react";
import { api, get, post } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Badge, Button, Card, Empty, ErrorNotice, Loading, PageHeading } from "../components/UI";
import { formatDate } from "../utils/formatDate";

const EMPTY_SESSIONS = [];

function PublicHeader() {
  const { user, role } = useAuth();
  return <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-[#f7f8f5]/90 backdrop-blur-xl">
    <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 lg:px-8">
      <Link to="/" className="flex items-center gap-3 text-slate-900"><span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-teal-800 text-white"><Music2 size={19} /></span><span><span className="block text-sm font-bold tracking-wide">COMMON GROUND</span><span className="block text-xs text-slate-500">Campus festival</span></span></Link>
      <nav className="flex items-center gap-2">{user ? <Link to="/workspace/overview" className="rounded-xl bg-teal-800 px-4 py-2.5 text-sm font-semibold text-white">Open {role} workspace</Link> : <><Link to="/login" className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-white">Sign in</Link><Link to="/register" className="rounded-xl bg-teal-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-900">Join festival</Link></>}</nav>
    </div>
  </header>;
}

export function LandingPage() {
  const [festivals, setFestivals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = () => { setLoading(true); setError(""); get("/attendee/festivals").then((data) => setFestivals(data.festivals || [])).catch((err) => setError(err.message)).finally(() => setLoading(false)); };
  useEffect(() => {
    let live = true;
    get("/attendee/festivals").then((data) => { if (live) setFestivals(data.festivals || []); }).catch((err) => { if (live) setError(err.message); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);
  return <div className="min-h-screen bg-[#f7f8f5] text-slate-800"><PublicHeader />
    <main className="mx-auto max-w-7xl px-5 pb-20 pt-10 lg:px-8">
      <section className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#dcebe4] via-[#eaf0e8] to-[#f5ead8] px-7 py-12 sm:px-12 sm:py-16 lg:px-16">
        <div className="absolute -right-12 -top-20 h-72 w-72 rounded-full bg-white/35 blur-2xl" />
        <div className="relative max-w-2xl"><span className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/60 px-3 py-1.5 text-xs font-semibold text-teal-800"><Sparkles size={14} /> A little more together</span><h1 className="mt-6 text-4xl font-semibold leading-tight tracking-tight text-slate-900 sm:text-6xl">Make room for<br /><span className="font-serif italic font-normal text-teal-800">what brings us together.</span></h1><p className="mt-5 max-w-xl text-base leading-7 text-slate-600">Find your next conversation, workshop, performance, or shared moment. Festival plans, people, and places in one calm little corner.</p><a href="#festivals" className="mt-7 inline-flex items-center gap-2 rounded-xl bg-teal-800 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-teal-900">Explore festivals <ArrowRight size={16} /></a></div>
        <div className="absolute bottom-0 right-8 hidden h-64 w-64 items-center justify-center rounded-t-full bg-[#bed2c4]/60 lg:flex"><div className="flex h-40 w-40 items-center justify-center rounded-full bg-[#f7f8f5]/80 text-teal-800"><Music2 size={56} strokeWidth={1.2} /></div></div>
      </section>

      <section id="festivals" className="pt-14"><PageHeading eyebrow="The gathering" title="Find your festival" description="Browse the events coming up around campus." />
        <ErrorNotice error={error} retry={load} />
        {loading ? <Loading label="Finding festivals" /> : festivals.length ? <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{festivals.map((festival) => <FestivalCard key={festival._id} festival={festival} />)}</div> : <Empty title="No festivals are listed yet" detail="Check back soon, or sign in if you're helping organize an event." />}
      </section>
    </main>
    <footer className="border-t border-slate-200/70 py-7 text-center text-sm text-slate-500">Made for shared moments · Common Ground</footer>
  </div>;
}

function FestivalCard({ festival }) {
  return <Link to={`/festivals/${festival.slug}`} className="group block focus:outline-none focus:ring-4 focus:ring-teal-700/15 rounded-2xl"><Card className="h-full transition duration-200 group-hover:-translate-y-1 group-hover:shadow-lg"><div className="mb-5 flex items-start justify-between"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#e9f0eb] text-teal-800"><CalendarDays size={19} /></span><Badge tone={festival.status === "ongoing" ? "green" : "teal"}>{festival.status}</Badge></div><h2 className="text-xl font-semibold text-slate-900">{festival.name}</h2><p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">{festival.description}</p><div className="mt-5 flex items-center gap-2 text-sm text-slate-600"><MapPin size={15} />{festival.location}</div><div className="mt-4 border-t border-slate-100 pt-4 text-sm text-slate-600">{formatDate(festival.startDate)} – {formatDate(festival.endDate)}</div></Card></Link>;
}

export function FestivalPage() {
  const { slug } = useParams();
  const { role, user } = useAuth();
  const navigate = useNavigate();
  const [result, setResult] = useState({ slug: "", festival: null, sessions: [], error: "" });
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [registered, setRegistered] = useState(false);
  const [sessionStatuses, setSessionStatuses] = useState({});

  useEffect(() => {
    let live = true;
    get(`/festivals/${encodeURIComponent(slug)}`).then(async (data) => {
      if (!live) return;
      const sessionData = await get(`/festivals/${data.festival._id}/sessions`).catch(() => ({ sessions: [] }));
      if (live) setResult({ slug, festival: data.festival, sessions: sessionData.sessions || [], error: "" });
    }).catch((err) => { if (live) setResult({ slug, festival: null, sessions: [], error: err.message }); });
    return () => { live = false; };
  }, [slug]);

  const festival = result.slug === slug ? result.festival : null;
  const sessions = result.slug === slug ? result.sessions : EMPTY_SESSIONS;
  const loading = result.slug !== slug;
  const error = result.slug === slug ? result.error : "";

  useEffect(() => {
    if (!festival || role !== "attendee" || !user || !sessions.length) return;
    let live = true;
    Promise.all([
      get(`/attendee/festivals/${festival._id}/registration-status`).then(() => true).catch(() => false),
      get("/attendee/my-registrations").then((data) => data.registrations || []).catch(() => []),
      ...sessions.map((session) => get(`/attendee/festivals/${festival._id}/sessions/${session._id}/waitlist-status`).then((data) => ({ id: session._id, waitlist: data.waitlistEntry })).catch(() => ({ id: session._id, waitlist: null }))),
    ]).then(([isRegistered, registrations, ...waitlists]) => {
      if (!live) return;
      setRegistered(isRegistered);
      const next = {};
      for (const session of sessions) {
        const registration = registrations.find((r) => String(r.sessionId) === String(session._id) && r.status !== "cancelled");
        const waitlist = waitlists.find((w) => w.id === session._id)?.waitlist;
        next[session._id] = { registration, waitlist };
      }
      setSessionStatuses(next);
    });
    return () => { live = false; };
  }, [festival, role, user, sessions]);

  async function registerFestival() {
    if (!user) return navigate("/login?next=festival");
    if (role !== "attendee") return setActionError("Festival registration is available to attendee accounts.");
    setWorking(true); setActionError(""); setMessage("");
    try { await post(`/attendee/festivals/${festival._id}/register`, {}); setRegistered(true); setMessage("You're registered for this festival. You can now reserve individual sessions."); }
    catch (err) { if (err.status === 409) { setRegistered(true); setMessage("You’re already registered for this festival."); } else setActionError(err.message); }
    finally { setWorking(false); }
  }

  async function registerSession(session) {
    if (!user) return navigate("/login?next=festival");
    setWorking(true); setActionError(""); setMessage("");
    try {
      await post(`/attendee/festivals/${festival._id}/sessions/${session._id}/register`, {});
      setSessionStatuses((current) => ({ ...current, [session._id]: { registration: { status: "confirmed" }, waitlist: null } }));
      setMessage(`Your place for “${session.title}” is confirmed.`);
    } catch (err) {
      if (err.message.toLowerCase().includes("full")) {
        const join = window.confirm("This session is full. Would you like to join its waitlist?");
        if (join) try { const result = await post(`/attendee/festivals/${festival._id}/sessions/${session._id}/waitlist`, {}); setSessionStatuses((current) => ({ ...current, [session._id]: { registration: null, waitlist: result.waitlistEntry } })); setMessage(`You’re on the waitlist for “${session.title}”.`); } catch (waitErr) { setActionError(waitErr.message); }
        else setActionError(err.message);
      } else setActionError(err.message);
    } finally { setWorking(false); }
  }

  async function cancelSession(session) {
    if (!window.confirm(`Cancel your place in “${session.title}”?`)) return;
    setWorking(true); setActionError(""); setMessage("");
    try { await api(`/attendee/festivals/${festival._id}/sessions/${session._id}/unregister`, { method: "DELETE" }); setSessionStatuses((current) => ({ ...current, [session._id]: { registration: null, waitlist: null } })); setMessage("Your session registration was cancelled."); }
    catch (err) { setActionError(err.message); }
    finally { setWorking(false); }
  }

  async function leaveWaitlist(session) {
    setWorking(true); setActionError(""); setMessage("");
    try { await api(`/attendee/festivals/${festival._id}/sessions/${session._id}/waitlist`, { method: "DELETE" }); setSessionStatuses((current) => ({ ...current, [session._id]: { ...current[session._id], waitlist: null } })); setMessage("You left the waitlist."); }
    catch (err) { setActionError(err.message); }
    finally { setWorking(false); }
  }

  return <div className="min-h-screen bg-[#f7f8f5]"><PublicHeader /><main className="mx-auto max-w-7xl px-5 py-10 lg:px-8">
    <Link to="/" className="text-sm font-semibold text-teal-800 hover:text-teal-950">← All festivals</Link>
    {loading ? <Loading label="Loading festival" /> : error && !festival ? <div className="mt-6"><ErrorNotice error={error} retry={() => window.location.reload()} /></div> : festival && <>
      <div className="mt-6 rounded-[2rem] bg-gradient-to-br from-[#dcebe4] to-[#f3eadc] p-8 sm:p-12"><div className="max-w-3xl"><Badge tone="teal">{festival.status}</Badge><h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">{festival.name}</h1><p className="mt-4 text-lg leading-8 text-slate-600">{festival.description}</p><div className="mt-6 flex flex-wrap gap-x-6 gap-y-3 text-sm text-slate-700"><span className="flex items-center gap-2"><CalendarDays size={16} />{formatDate(festival.startDate)} – {formatDate(festival.endDate)}</span><span className="flex items-center gap-2"><MapPin size={16} />{festival.location}</span></div><div className="mt-6 flex flex-wrap gap-3"><Button onClick={registerFestival} disabled={working || registered}>{working ? "Please wait…" : registered ? "Festival registration complete" : "Register for festival"}</Button><span className="self-center text-sm text-slate-500">{festival.registrationFee ? `Registration fee: ${festival.registrationFee}` : "Free to attend"}</span></div></div></div>
      {message && <div className="mt-5"><div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</div></div>}{actionError && <div className="mt-5"><ErrorNotice error={actionError} /></div>}
      <section className="mt-12"><PageHeading eyebrow="Published program" title="Sessions to look forward to" description="Session times and places come from the published festival schedule." />
        {sessions.length ? <div className="grid gap-4 md:grid-cols-2">{sessions.map((session) => { const state = sessionStatuses[session._id] || {}; return <Card key={session._id} className="flex flex-col sm:flex-row sm:items-start sm:justify-between sm:gap-6"><div><div className="flex flex-wrap items-center gap-2"><Badge tone="teal">{session.sessionType}</Badge><span className="text-sm text-slate-500">{formatDate(session.startTime, { hour: "numeric", minute: "2-digit", month: "short", day: "numeric" })}</span>{state.registration&&<Badge tone="green">Registered</Badge>}{state.waitlist&&<Badge tone="amber">Waitlist · {state.waitlist.position}</Badge>}</div><h3 className="mt-3 text-lg font-semibold text-slate-900">{session.title}</h3><p className="mt-2 text-sm leading-6 text-slate-500">{session.description}</p><p className="mt-3 text-sm text-slate-600">{session.venueId?.name || "Venue details available at the event"}</p></div><div className="mt-5 flex shrink-0 flex-col gap-2 sm:mt-1">{state.registration ? <Button variant="secondary" onClick={() => cancelSession(session)} disabled={working}>Cancel place</Button> : state.waitlist ? <Button variant="secondary" onClick={() => leaveWaitlist(session)} disabled={working}>Leave waitlist</Button> : !user ? <Button variant="secondary" onClick={() => navigate("/login?next=festival")}>Sign in to reserve</Button> : role !== "attendee" ? <Button variant="secondary" disabled>Attendee reservation</Button> : !registered ? <Button variant="secondary" onClick={registerFestival} disabled={working}>Register for festival first</Button> : <Button variant="secondary" onClick={() => registerSession(session)} disabled={working}>Reserve a spot</Button>}</div></Card>; })}</div> : <Empty title="The published schedule is not available yet" detail="The organizers will add sessions here when the program is ready." />}
      </section>
    </>}
  </main></div>;
}
