import { LoaderCircle, Sparkles } from "lucide-react";

export function Button({ children, variant = "primary", className = "", ...props }) {
  const styles = variant === "secondary"
    ? "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
    : variant === "quiet"
      ? "text-slate-600 hover:bg-slate-100"
      : variant === "danger"
        ? "bg-rose-600 text-white hover:bg-rose-700"
        : "bg-teal-700 text-white hover:bg-teal-800";
  return <button className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`} {...props}>{children}</button>;
}

export function Field({ label, className = "", children, ...props }) {
  return <label className={`grid gap-1.5 text-sm font-medium text-slate-700 ${className}`}>
    <span>{label}</span>
    {children || <input className="min-h-11 rounded-xl border border-slate-200 bg-white px-3.5 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-4 focus:ring-teal-700/10" {...props} />}
  </label>;
}

export function SelectField({ label, options, className = "", ...props }) {
  return <label className={`grid gap-1.5 text-sm font-medium text-slate-700 ${className}`}>
    <span>{label}</span>
    <select className="min-h-11 rounded-xl border border-slate-200 bg-white px-3.5 text-slate-800 outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-700/10" {...props}>
      {options.map((option) => typeof option === "string"
        ? <option key={option} value={option}>{option}</option>
        : <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  </label>;
}

export function TextArea({ label, className = "", ...props }) {
  return <label className={`grid gap-1.5 text-sm font-medium text-slate-700 ${className}`}>
    <span>{label}</span>
    <textarea className="min-h-24 rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-slate-800 outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-700/10" {...props} />
  </label>;
}

export function Card({ children, className = "" }) {
  return <section className={`rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_8px_30px_-24px_rgba(15,23,42,.35)] sm:p-6 ${className}`}>{children}</section>;
}

export function PageHeading({ eyebrow, title, description, action }) {
  return <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
    <div><p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-teal-700">{eyebrow}</p><h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{title}</h1>{description && <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{description}</p>}</div>
    {action}
  </div>;
}

export function Badge({ children, tone = "neutral" }) {
  const tones = { neutral: "bg-slate-100 text-slate-600", green: "bg-emerald-50 text-emerald-700", amber: "bg-amber-50 text-amber-700", red: "bg-rose-50 text-rose-700", teal: "bg-teal-50 text-teal-700" };
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${tones[tone] || tones.neutral}`}>{String(children || "unknown").replaceAll("_", " ")}</span>;
}

export function Notice({ children, tone = "error" }) {
  return <div role="alert" className={`rounded-xl border px-4 py-3 text-sm ${tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>{children}</div>;
}

export function Loading({ label = "Loading" }) {
  return <div className="flex min-h-40 items-center justify-center gap-3 text-sm text-slate-500"><LoaderCircle className="animate-spin" size={18} />{label}…</div>;
}

export function Empty({ title = "Nothing here yet", detail, action }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-12 text-center"><div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-teal-50 text-teal-700"><Sparkles size={19} /></div><h3 className="font-semibold text-slate-800">{title}</h3>{detail && <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">{detail}</p>}{action && <div className="mt-5">{action}</div>}</div>;
}

export function ErrorNotice({ error, retry }) {
  if (!error) return null;
  return <div className="mb-5 flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 sm:flex-row sm:items-center sm:justify-between"><span>{error}</span>{retry && <Button variant="secondary" onClick={retry}>Try again</Button>}</div>;
}

export function Stat({ label, value, helper }) {
  return <Card><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">{value ?? "—"}</p>{helper && <p className="mt-1 text-xs text-slate-500">{helper}</p>}</Card>;
}

