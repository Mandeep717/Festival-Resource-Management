import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { post } from "../api/client";
import { Button, Card, Empty, Notice, TextArea } from "../components/UI";

export default function FestivalChat({ festivalId }) {
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState(null);
  const [conversationId, setConversationId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function ask(event) {
    event.preventDefault();
    if (!festivalId || !query.trim()) return;
    setBusy(true);
    setError("");
    try {
      const result = await post(`/festivals/${festivalId}/chat`, {
        query: query.trim(),
        ...(conversationId ? { conversationId } : {}),
      });
      setAnswer(result);
      setConversationId(result.conversationId);
      setQuery("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!festivalId) return <Empty title="Choose a festival" detail="Select a festival to ask the guide about its details." />;

  return <Card className="max-w-3xl"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e6efe9] text-teal-800"><MessageCircle size={19} /></span><div><h2 className="font-semibold">Festival guide</h2><p className="text-xs text-slate-500">Ask about the festival details and public event guides. No festival membership is needed.</p></div></div><form onSubmit={ask} className="mt-5"><TextArea label="Your question" value={query} onChange={(event) => setQuery(event.target.value)} maxLength={4000} placeholder="Where is the festival, and when does it start?" /><Button className="mt-3" disabled={busy || !query.trim()}>{busy ? "Thinking…" : "Ask assistant"}</Button></form>{error && <div className="mt-4"><Notice>{error}</Notice></div>}{answer && <div className="mt-6 rounded-2xl bg-[#f5f7f4] p-5"><p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">{answer.answer}</p>{answer.citations?.length > 0 && <div className="mt-4 border-t border-slate-200 pt-4"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Sources</p><div className="mt-2 grid gap-2">{answer.citations.map((citation) => <p key={`${citation.sourceId}-${citation.documentId}`} className="text-sm text-teal-900"><span className="mr-2 rounded bg-teal-100 px-2 py-0.5 text-xs font-bold">{citation.sourceId}</span>{citation.title} · section {citation.chunkIndex + 1}</p>)}</div></div>}</div>}{conversationId && <p className="mt-3 text-xs text-slate-400">This conversation is saved in this browser.</p>}</Card>;
}
