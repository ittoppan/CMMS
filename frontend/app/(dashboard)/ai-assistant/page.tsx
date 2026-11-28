"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePageHero } from "@/lib/i18n";
import { PageHeader } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Alert } from "@/components/ui/alert";
import { apiJson, getCsrfToken } from "@/lib/api";
import { cn } from "@/lib/cn";

interface Scope { key: string; allowed: boolean; }
interface Session { id: number; title: string; scope: string; created_at: string; updated_at: string; }
interface Msg { id: number; role: "user" | "assistant" | "system"; content: string; created_at?: string; }

export default function AiAssistantPage() {
  const hero = usePageHero("ai-assistant");
  const [scopes, setScopes] = useState<Scope[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentId, setCurrentId] = useState<number | null>(null);
  const [scope, setScope] = useState<string>("general");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState("");
  const [technicianId, setTechnicianId] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const initialAskRef = useRef(false);

  const loadScopes = useCallback(async () => {
    try {
      const data = await apiJson<{ scopes: Scope[] }>("/api/v1/ai_assistant.php?action=scopes");
      const allowed = (data.scopes || []).filter((s) => s.allowed);
      const list = allowed.length ? allowed : [{ key: "general", allowed: true }];
      setScopes(list);
      setScope((prev) => (list.some((s) => s.key === prev) ? prev : list[0].key));
    } catch (e: any) {
      setError(e?.message || "โหลด scope ไม่สำเร็จ");
    }
  }, []);

  const loadSessions = useCallback(async () => {
    try {
      const data = await apiJson<{ sessions: Session[] }>("/api/v1/ai_assistant.php?action=sessions");
      setSessions(data.sessions || []);
    } catch (e: any) {
      setError(e?.message || "โหลดประวัติไม่สำเร็จ");
    }
  }, []);

  const loadMessages = useCallback(async (sid: number) => {
    if (streaming) return;
    try {
      const data = await apiJson<{ messages: Msg[] }>(`/api/v1/ai_assistant.php?action=messages&session_id=${sid}`);
      setMessages(data.messages || []);
      setCurrentId(sid);
      setSummary("");
      const s = sessions.find((x) => x.id === sid);
      if (s) setScope(s.scope);
    } catch (e: any) {
      setError(e?.message || "โหลดข้อความไม่สำเร็จ");
    }
  }, [sessions, streaming]);

  useEffect(() => { loadScopes(); loadSessions(); }, [loadScopes, loadSessions]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, streaming]);

  const newChat = () => {
    setCurrentId(null);
    setMessages([]);
    setSummary("");
    setTechnicianId(null);
  };

  const send = async (textOverride?: string, technicianIdOverride?: number | null) => {
    const text = (textOverride ?? input).trim();
    if (!text || streaming) return;
    setInput("");
    setError("");
    setStreaming(true);
    setSummary("");
    const userMsg: Msg = { id: Date.now(), role: "user", content: text };
    const assistantMsg: Msg = { id: Date.now() + 1, role: "assistant", content: "" };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);

    try {
      const token = await getCsrfToken();
      const res = await fetch("/api/v1/ai_assistant.php?action=send", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": token },
        body: JSON.stringify({
          session_id: currentId,
          scope,
          message: text,
          technician_id: technicianIdOverride ?? technicianId ?? undefined,
        }),
      });
      if (!res.ok || !res.body) {
        const t = await res.text();
        throw new Error(t || `HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const raw = trimmed.replace(/^data:\s*/, "");
          if (!raw) continue;
          let json: any;
          try {
            json = JSON.parse(raw);
          } catch {
            // ignore non-JSON keepalive lines
            continue;
          }
          if (json.error) throw new Error(json.error);
          if (json.delta) {
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last && last.role === "assistant") {
                next[next.length - 1] = { ...last, content: last.content + json.delta };
              }
              return next;
            });
          }
          if (json.session_id) {
            const sid = Number(json.session_id);
            if (!currentId) setCurrentId(sid);
            loadSessions();
          }
        }
      }
    } catch (e: any) {
      setError(e?.message || "ส่งข้อความไม่สำเร็จ");
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.role === "assistant" && !last.content) {
          next[next.length - 1] = { ...last, content: "เกิดข้อผิดพลาด: " + (e?.message || "") };
        }
        return next;
      });
    } finally {
      setStreaming(false);
    }
  };

  useEffect(() => {
    if (initialAskRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const ask = (params.get("ask") || "").trim();
    if (!ask) return;
    initialAskRef.current = true;
    const tid = Number(params.get("technician_id") || 0);
    window.setTimeout(() => {
      const clean = new URL(window.location.href);
      clean.searchParams.delete("ask");
      clean.searchParams.delete("technician_id");
      window.history.replaceState(null, "", clean.pathname + clean.search);
    }, 0);
    setInput(ask);
    setTechnicianId(tid > 0 ? tid : null);
    void send(ask, tid > 0 ? tid : null);
  }, [send]);

  const technicianSummary = async () => {
    setError("");
    setStreaming(true);
    try {
      const qs = technicianId ? `&technician_id=${technicianId}` : "";
      const data = await apiJson<{ summary: any }>(`/api/v1/ai_assistant.php?action=technician_summary${qs}`);
      const s = data.summary || {};
      const text = [
        "สรุปงานของช่าง #" + (s.technician_id ?? ""),
        "- งานที่ยังไม่เสร็จ: " + (s.open ?? 0),
        "- งานเกิน SLA: " + (s.overdue ?? 0),
        ...Object.entries(s.counts || {}).map(([k, v]) => "- " + k + ": " + v),
        "",
        "งานล่าสุด:",
        ...((s.recent || []).map((r: any) => "- #" + r.id + " " + (r.work_order_no || "") + " " + (r.title || "") + " [" + (r.status || "") + "]")),
      ].join("\n");
      setSummary(text);
    } catch (e: any) {
      setError(e?.message || "สรุปไม่สำเร็จ");
    } finally {
      setStreaming(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={<p className="cmms-eyebrow">AI ASSISTANT</p>}
        title={hero?.title || "AI Assistant"}
        description={hero?.desc || "ผู้ช่วยอัจฉริยะสำหรับงานซ่อมบำรุง"}
        actions={[
          <Button key="new" variant="secondary" onClick={newChat}>แชทใหม่</Button>,
          <Button key="sum" variant="secondary" onClick={technicianSummary} disabled={streaming}>AI สรุป</Button>,
        ]}
      />

      {error && <Alert variant="danger" title="ข้อผิดพลาด" description={error} />}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">ประวัติแชท</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Scope</label>
              <Select value={scope} onValueChange={setScope}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {scopes.map((s) => (
                    <SelectItem key={s.key} value={s.key}>{s.key}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="max-h-[420px] space-y-1 overflow-auto">
              {sessions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => loadMessages(s.id)}
                  disabled={streaming}
                  className={cn(
                    "w-full rounded-md border px-3 py-2 text-left text-sm transition-colors",
                    currentId === s.id ? "border-[var(--cmms-primary)] bg-[var(--cmms-primary)]/10" : "border-border hover:bg-accent"
                  )}
                >
                  <div className="truncate font-medium">{s.title}</div>
                  <div className="text-xs text-muted-foreground">{s.scope} · {s.updated_at}</div>
                </button>
              ))}
              {sessions.length === 0 && <p className="text-xs text-muted-foreground">ยังไม่มีประวัติ</p>}
            </div>
          </CardContent>
        </Card>

        <Card className="flex min-h-[520px] flex-col">
          <CardHeader>
            <CardTitle className="text-base">แชท</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-3">
            <div className="flex-1 space-y-3 overflow-auto rounded-md border border-border bg-muted/20 p-3">
              {messages.length === 0 && (
                <p className="text-sm text-muted-foreground">เริ่มถามได้เลย เช่น “มอเตอร์ร้อนและเสียงดัง” หรือกด “AI สรุป”</p>
              )}
              {messages.map((m, i) => (
                <div key={m.id ?? i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                  <div className={cn(
                    "max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm",
                    m.role === "user" ? "bg-[var(--cmms-primary)] text-white" : "bg-background border border-border"
                  )}>
                    {m.content || (streaming && i === messages.length - 1 ? "…" : "")}
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            <div className="flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder="พิมพ์ข้อความ…"
                disabled={streaming}
              />
              <Button onClick={() => send()} disabled={streaming || !input.trim()}>
                {streaming ? <Spinner size={16} /> : "ส่ง"}
              </Button>
            </div>

            {summary && (
              <div className="rounded-md border border-border bg-muted/30 p-3">
                <p className="mb-1 text-xs font-semibold text-muted-foreground">สรุปช่าง</p>
                <pre className="whitespace-pre-wrap text-xs">{summary}</pre>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}