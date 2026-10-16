"use client";

import { FormEvent, useEffect, useState } from "react";

type Tab = "talk" | "show" | "discoveries";

type Message = { role: "user" | "assistant"; text: string };

function uniqueBy<T>(arr: T[], keyFn: (x: T) => string) {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of arr) {
    const k = keyFn(item);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(item);
    }
  }
  return out;
}

export default function HomePage() {
  const [tab, setTab] = useState<Tab>("talk");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", text: "Hey — what’s on your mind? Ask anything: patterns, missing questions, or what happens next." }
  ]);
  const [currentInsight, setCurrentInsight] = useState<any>(null);
  const [savedDiscoveries, setSavedDiscoveries] = useState<any[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [isExpanding, setIsExpanding] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("rememberreality-discoveries");
    if (saved) setSavedDiscoveries(JSON.parse(saved));
  }, []);
  useEffect(() => {
    localStorage.setItem("rememberreality-discoveries", JSON.stringify(savedDiscoveries));
  }, [savedDiscoveries]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isSending) return;
    setMessages((m) => [...m, { role: "user", text }]);
    setInput("");
    setIsSending(true);
    try {
      const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text }) });
      const json = await res.json();
      const assistantText = json.text || 'I\'m thinking through that.';
      setMessages((m) => [...m, { role: 'assistant', text: assistantText }]);
      setCurrentInsight(json.structured || { text: assistantText });
      setTab('show');
    } catch (err) {
      console.error(err);
      setMessages((m) => [...m, { role: 'assistant', text: 'Temporary error — please try again.' }]);
    } finally {
      setIsSending(false);
    }
  }

  async function expandRoundTable() {
    if (!currentInsight || isExpanding) return;
    setIsExpanding(true);
    try {
      const res = await fetch('/api/expand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ insight: currentInsight })
      });
      const json = await res.json();
      const structured = json.structured || {};

      // Merge structured into currentInsight while preserving prior knowledge
      setCurrentInsight((prev: any) => {
        if (!prev) return structured;
        const merged: any = { ...prev };

        // merge text/title
        merged.title = structured.title || prev.title;
        merged.text = (prev.text || "") + "\n\n" + (structured.text || "");

        // merge perspectives (unique by label)
        const prevPers = Array.isArray(prev.perspectives) ? prev.perspectives : [];
        const newPers = Array.isArray(structured.perspectives) ? structured.perspectives : [];
        merged.perspectives = uniqueBy([...prevPers, ...newPers], (p: any) => (p.label || JSON.stringify(p)));

        // merge missingQuestions (unique)
        const prevMQ = Array.isArray(prev.missingQuestions) ? prev.missingQuestions : [];
        const newMQ = Array.isArray(structured.missingQuestions) ? structured.missingQuestions : [];
        merged.missingQuestions = Array.from(new Set([...prevMQ, ...newMQ]));

        // merge predictions
        const prevPr = Array.isArray(prev.predictions) ? prev.predictions : [];
        const newPr = Array.isArray(structured.predictions) ? structured.predictions : [];
        merged.predictions = uniqueBy([...prevPr, ...newPr], (p: any) => (p.label || JSON.stringify(p)));

        // merge visual nodes/edges
        const pv = prev.visual || { nodes: [], edges: [] };
        const nv = structured.visual || { nodes: [], edges: [] };
        const nodes = uniqueBy([...(pv.nodes || []), ...(nv.nodes || [])], (n: any) => n.id || (n.label || JSON.stringify(n)));
        const edges = uniqueBy([...(pv.edges || []), ...(nv.edges || [])], (e: any) => `${e.from}->${e.to}:${e.label}`);
        merged.visual = { ...pv, ...nv, nodes, edges };

        // track contributing fields
        const prevFields = Array.isArray(prev.contributingFields) ? prev.contributingFields : [];
        merged.contributingFields = Array.from(new Set([...(prevFields || []), ...(structured.contributingFields || [])]));

        // track what remains unknown and ruled out
        merged.unknowns = Array.from(new Set([...(prev.unknowns || []), ...(structured.unknowns || []) || []]));
        merged.ruledOut = Array.from(new Set([...(prev.ruledOut || []), ...(structured.ruledOut || []) || []]));

        return merged;
      });

      // switch to show tab if not already
      setTab('show');
    } catch (err) {
      console.error(err);
      // show minimal error to user
      setMessages((m) => [...m, { role: 'assistant', text: 'Expansion failed — please try again.' }]);
    } finally {
      setIsExpanding(false);
    }
  }

  function saveDiscovery() {
    if (!currentInsight) return;
    const item = { id: crypto.randomUUID(), title: currentInsight.title || 'Discovery', summary: currentInsight.text || '', createdAt: new Date().toISOString(), data: currentInsight };
    setSavedDiscoveries((s) => [item, ...s]);
    setTab('discoveries');
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">THE LAST 10%</div>
        <nav className="nav" aria-label="Main navigation">
          <button className={`nav-item ${tab==='talk'?'active':''}`} onClick={() => setTab('talk')}>Let's Talk</button>
          <button className={`nav-item ${tab==='show'?'active':''}`} onClick={() => setTab('show')}>Show Me</button>
          <button className={`nav-item ${tab==='discoveries'?'active':''}`} onClick={() => setTab('discoveries')}>My Discoveries</button>
        </nav>
        <div className="mini-panel"><div className="mini-label">Current focus</div><div className="mini-value">{currentInsight? 'Active' : 'New'}</div></div>
      </aside>

      <section className="content">
        {tab==='talk' && (
          <div className="panel">
            <div className="panel-header">
              <div><div className="eyebrow">Let's Talk</div><h1>See what you're missing.</h1></div>
              {currentInsight && <div style={{display:'flex',gap:8}}><button className="primary-button" onClick={saveDiscovery}>Save discovery</button></div>}
            </div>
            <div className="messages" role="log" aria-live="polite">
              {messages.map((m, i) => <div key={i} className={`bubble ${m.role==='user'?'user':'assistant'}`}>{m.text}</div>)}
            </div>
            <form className="composer" onSubmit={handleSubmit}>
              <textarea value={input} onChange={(e)=>setInput(e.target.value)} placeholder="Ask anything: Why is this happening? What's missing? What could happen next?" />
              <div className="composer-actions"><button className="primary-button" type="submit" disabled={isSending||!input.trim()}>{isSending? 'Thinking...' : 'Send'}</button></div>
            </form>
          </div>
        )}

        {tab==='show' && (
          <div className="panel">
            <div className="panel-header">
              <div><div className="eyebrow">Show Me</div><h2>{currentInsight?.title || 'Connection map'}</h2></div>
              {currentInsight && <div style={{display:'flex',gap:8}}>
                <button className="primary-button" onClick={saveDiscovery}>Save discovery</button>
                <button className="primary-button" onClick={expandRoundTable} disabled={isExpanding}>{isExpanding? 'Expanding…' : 'Expand Round Table'}</button>
              </div>}
            </div>
            <div className="visual-grid">
              <div className="visual-card">
                <div className="visual-box">
                  {currentInsight?.visual?.nodes?.length ? (
                    <div className="graph-layout">{currentInsight.visual.nodes.map((n:any)=> <div key={n.id} className={`node ${n.group||''}`}>{n.label}</div>)}</div>
                  ) : (<div className="empty-state">No visual yet — ask a question in Let's Talk.</div>)}
                </div>
              </div>
              <div className="insight-stack">
                <div className="insight-card"><h3>Perspectives</h3>{(currentInsight?.perspectives?.length)? currentInsight.perspectives.map((p:any,i:number)=>(<div key={i} className="mini-item"><strong>{p.label}</strong><span>{p.notes}</span></div>)) : <p>Not enough context yet.</p>}</div>
                <div className="insight-card"><h3>Missing questions</h3>{(currentInsight?.missingQuestions?.length)? currentInsight.missingQuestions.map((q:string,i:number)=>(<div key={i} className="mini-item">{q}</div>)) : <p>No major gaps identified yet.</p>}</div>
                <div className="insight-card"><h3>Predictions</h3>{(currentInsight?.predictions?.length)? currentInsight.predictions.map((pr:any,i:number)=>(<div key={i} className="mini-item"><strong>{pr.label}</strong><span>{pr.summary}</span></div>)) : <p>No testable prediction yet.</p>}</div>
                <div className="insight-card"><h3>Fields contributed</h3>{(currentInsight?.contributingFields?.length)? currentInsight.contributingFields.map((f:string,i:number)=>(<div key={i} className="mini-item">{f}</div>)) : <p>None yet — expand the Round Table to bring more fields.</p>}</div>
                <div className="insight-card"><h3>Ruled out / Unknown</h3>
                  <div><strong>Ruled out:</strong>{(currentInsight?.ruledOut?.length)? <ul>{currentInsight.ruledOut.map((r:string,i:number)=>(<li key={i}>{r}</li>))}</ul> : ' None'}</div>
                  <div style={{marginTop:8}}><strong>Unknowns:</strong>{(currentInsight?.unknowns?.length)? <ul>{currentInsight.unknowns.map((u:string,i:number)=>(<li key={i}>{u}</li>))}</ul> : ' None'}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab==='discoveries' && (
          <div className="panel">
            <div className="panel-header"><div><div className="eyebrow">My Discoveries</div><h2>Saved questions and connections</h2></div></div>
            {savedDiscoveries.length? (<div className="cards-grid">{savedDiscoveries.map(d=>(<article key={d.id} className="discovery-card"><div className="tag">{d.data?.kind||'analysis'}</div><h3>{d.title}</h3><p>{d.summary}</p><small>{new Date(d.createdAt).toLocaleString()}</small></article>))}</div>) : <div className="empty-panel">Nothing saved yet. Start a conversation and save an insight.</div>}
          </div>
        )}
      </section>
    </main>
  );
}
