"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePageHero, t, useLang } from "@/lib/i18n";
import { PageShell } from "@/components/PageShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Dialog } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AccessDenied } from "@/components/access-denied";
import {
  History,
  RefreshCw,
  Search,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  UserRound,
  MonitorSmartphone,
  Fingerprint,
  FileJson2,
  X,
} from "lucide-react";

interface AuditRow {
  id: number;
  created_at: string;
  user_id: string | null;
  user_name: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  description: string | null;
  severity: string;
  ip_address: string | null;
  user_agent: string | null;
  request_id: string | null;
}

interface ListResponse {
  items: AuditRow[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

interface FilterOptions {
  actions: string[];
  users: { user_id: string; user_name: string }[];
  resources: string[];
  severities: string[];
}

const severityVariant: Record<string, "info" | "warning" | "danger" | "neutral"> = {
  info: "info",
  warning: "warning",
  security: "danger",
};

function fmtDateTime(v: string): string {
  return v ? v.replace("T", " ").slice(0, 19) : "-";
}

function fmtValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "-";
  if (typeof v === "object") return JSON.stringify(v, null, 2);
  return String(v);
}

export default function AuditLogPage() {
  useLang();
  const hero = usePageHero("audit-log");

  const [denied, setDenied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<ListResponse | null>(null);

  const [search, setSearch] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [action, setAction] = useState("__all__");
  const [severity, setSeverity] = useState("__all__");
  const [userId, setUserId] = useState("__all__");
  const [resource, setResource] = useState("__all__");
  const [page, setPage] = useState(1);

  const [options, setOptions] = useState<FilterOptions>({
    actions: [],
    users: [],
    resources: [],
    severities: ["info", "warning", "security"],
  });

  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [detailError, setDetailError] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);

  const buildQuery = useCallback(() => {
    const p = new URLSearchParams({ page: String(page), limit: "50" });
    const cleaned = searchQuery.trim();
    if (cleaned) p.set("search", cleaned);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (action !== "__all__") p.set("action", action);
    if (severity !== "__all__") p.set("severity", severity);
    if (userId !== "__all__") p.set("user_id", userId);
    if (resource !== "__all__") p.set("resource", resource);
    return p.toString();
  }, [page, searchQuery, from, to, action, severity, userId, resource]);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError("");
    setDenied(false);
    try {
      const res = await fetch(`/api/v1/audit_logs.php?${buildQuery()}`, {
        credentials: "include",
      });
      if (res.status === 403) {
        setDenied(true);
        return;
      }
      if (res.status === 401) {
        setDenied(true);
        return;
      }
      const json = await res.json();
      if (!res.ok) {
        setError(String(json?.error || `HTTP ${res.status}`));
        return;
      }
      setData(json);
    } catch (e) {
      setError("เกิดข้อผิดพลาดในการโหลดข้อมูล กรุณาลองใหม่");
    } finally {
      setLoading(false);
    }
  }, [buildQuery]);

  const fetchOptions = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/audit_logs.php?filters=1", { credentials: "include" });
      if (!res.ok) return;
      const json = await res.json();
      setOptions((prev) => ({
        actions: Array.isArray(json?.actions) ? json.actions : prev.actions,
        users: Array.isArray(json?.users) ? json.users : prev.users,
        resources: Array.isArray(json?.resources) ? json.resources : prev.resources,
        severities: Array.isArray(json?.severities) ? json.severities : prev.severities,
      }));
    } catch {
      /* ignore filter-option failures */
    }
  }, []);

  useEffect(() => {
    setSearchQuery(search.trim());
    setPage(1);
  }, [search]);

  useEffect(() => { fetchOptions(); }, [fetchOptions]);
  useEffect(() => { fetchList(); }, [fetchList]);

  const openDetail = useCallback(async (id: number) => {
    setDetailLoading(true);
    setDetailError("");
    try {
      const res = await fetch(`/api/v1/audit_logs.php?id=${id}`, { credentials: "include" });
      const json = await res.json();
      if (!res.ok) throw new Error(String(json?.error || `HTTP ${res.status}`));
      setDetail(json);
    } catch (e: any) {
      setDetailError(e?.message || "ไม่สามารถโหลดรายละเอียดได้");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const resetFilters = () => {
    setSearch("");
    setSearchQuery("");
    setFrom("");
    setTo("");
    setAction("__all__");
    setSeverity("__all__");
    setUserId("__all__");
    setResource("__all__");
    setPage(1);
  };

  const crumbs = useMemo(
    () => [
      { label: t("nav.system") as string, href: "/settings" },
      { label: hero.title },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hero.title]
  );

  if (denied) return <AccessDenied onRetry={fetchList} />;

  const items = data?.items ?? [];
  const pages = Math.max(1, data?.pages ?? 1);
  const currentPage = Math.min(page, pages);

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">{hero.eyebrow}</p>}
      breadcrumbs={crumbs}
      title={hero.title}
      description={hero.desc}
      actions={
        <Button variant="secondary" onClick={fetchList}>
          <RefreshCw className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
          {t("action.refresh")}
        </Button>
      }
    >
      {error && <Alert variant="danger" title="Error" description={error} />}

      {/* filter bar */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 py-4">
          <div className="relative min-w-[200px] flex-1 sm:max-w-[320px]">
            <Search
              size={16}
              strokeWidth={1.75}
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              isLabelHidden
              label="ค้นหา"
              placeholder="ค้นหา description / ผู้ใช้ / action..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Input
            label="จากวัน"
            type="date"
            value={from}
            onChange={(e) => { setFrom(e.target.value); setPage(1); }}
            className="w-full sm:w-[170px]"
          />
          <Input
            label="ถึงวัน"
            type="date"
            value={to}
            onChange={(e) => { setTo(e.target.value); setPage(1); }}
            className="w-full sm:w-[170px]"
          />
          <Select value={action} onValueChange={(v) => { setAction(v); setPage(1); }}>
            <SelectTrigger className="w-full sm:w-[200px]" aria-label="Action">
              <SelectValue placeholder="ทุก action" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">ทุก action</SelectItem>
              {options.actions.map((a) => (
                <SelectItem key={a} value={a}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={severity} onValueChange={(v) => { setSeverity(v); setPage(1); }}>
            <SelectTrigger className="w-full sm:w-[150px]" aria-label="Severity">
              <SelectValue placeholder="ทุกระดับ" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">ทุกระดับ</SelectItem>
              {options.severities.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={userId} onValueChange={(v) => { setUserId(v); setPage(1); }}>
            <SelectTrigger className="w-full sm:w-[170px]" aria-label="ผู้ใช้">
              <SelectValue placeholder="ผู้ใช้ทั้งหมด" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">ผู้ใช้ทั้งหมด</SelectItem>
              {options.users.map((u) => (
                <SelectItem key={u.user_id} value={u.user_id}>{u.user_name || `#${u.user_id}`}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={resource} onValueChange={(v) => { setResource(v); setPage(1); }}>
            <SelectTrigger className="w-full sm:w-[170px]" aria-label="ประเภท">
              <SelectValue placeholder="ทุกประเภท" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">ทุกประเภท</SelectItem>
              {options.resources.map((r) => (
                <SelectItem key={r} value={r}>{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="secondary" onClick={resetFilters}>
            <X className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
            ล้างตัวกรอง
          </Button>
        </CardContent>
      </Card>

      {/* table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-5 w-5 text-[var(--cmms-primary-hover)]" strokeWidth={1.75} aria-hidden="true" />
            <span>รายการบันทึก</span>
            {!loading && <Badge variant="primary">{data?.total ?? 0} รายการ</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded-md bg-[var(--cmms-bg-muted)]" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              ไม่พบรายการบันทึก ลองเปลี่ยนตัวกรอง
            </div>
          ) : (
            <>
              {/* desktop table */}
              <div className="hidden overflow-hidden rounded-md border md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-[var(--cmms-bg-muted)] text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2 font-semibold">เวลา (GMT+7)</th>
                      <th className="px-3 py-2 font-semibold">ผู้ใช้</th>
                      <th className="px-3 py-2 font-semibold">Action</th>
                      <th className="px-3 py-2 font-semibold">ประเภท / เลขที่</th>
                      <th className="px-3 py-2 font-semibold">คำอธิบาย</th>
                      <th className="px-3 py-2 font-semibold">ระดับ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((row) => (
                      <tr
                        key={row.id}
                        onClick={() => openDetail(row.id)}
                        className="cursor-pointer border-b last:border-0 hover:bg-[var(--cmms-bg-muted)]"
                      >
                        <td className="px-3 py-2 tabular-nums whitespace-nowrap">{fmtDateTime(row.created_at)}</td>
                        <td className="px-3 py-2">{row.user_name || "system"}</td>
                        <td className="px-3 py-2 font-medium">{row.action}</td>
                        <td className="px-3 py-2">
                          {row.resource_type || "-"}
                          {row.resource_id ? ` #${row.resource_id}` : ""}
                        </td>
                        <td className="max-w-[260px] truncate px-3 py-2 text-muted-foreground">{row.description || "-"}</td>
                        <td className="px-3 py-2">
                          <Badge variant={severityVariant[row.severity] ?? "neutral"}>{row.severity}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* mobile cards */}
              <div className="space-y-2 md:hidden">
                {items.map((row) => (
                  <button
                    key={row.id}
                    onClick={() => openDetail(row.id)}
                    className="w-full rounded-lg border text-left p-3 hover:bg-[var(--cmms-bg-muted)]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{row.action}</span>
                      <Badge variant={severityVariant[row.severity] ?? "neutral"}>{row.severity}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{row.description || "-"}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {fmtDateTime(row.created_at)} · {row.user_name || "system"}
                    </p>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* pagination */}
          {!loading && pages > 1 && (
            <div className="mt-4 flex items-center justify-between gap-3">
              <Button
                variant="secondary"
                disabled={currentPage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
                ก่อนหน้า
              </Button>
              <span className="text-sm tabular-nums text-muted-foreground">
                หน้า {currentPage} / {pages}
              </span>
              <Button
                variant="secondary"
                disabled={currentPage >= pages}
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
              >
                ถัดไป
                <ChevronRight className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* detail dialog */}
      <Dialog open={!!detail} onClose={() => setDetail(null)} title="รายละเอียดบันทึกการตรวจสอบ">
        {detailLoading && <div className="space-y-2"><div className="h-10 animate-pulse rounded-md bg-[var(--cmms-bg-muted)]" /></div>}
        {detailError && <Alert variant="danger" title="Error" description={detailError} />}
        {!detailLoading && !detailError && detail && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Time (GMT+7)</p>
                <p className="mt-0.5 text-sm tabular-nums">{fmtDateTime(String(detail.created_at ?? ""))}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Severity</p>
                <div className="mt-1">
                  <Badge variant={severityVariant[String(detail.severity)] ?? "neutral"}>{String(detail.severity ?? "-")}</Badge>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Action</p>
                <p className="mt-0.5 text-sm font-medium">{String(detail.action ?? "-")}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Resource</p>
                <p className="mt-0.5 text-sm">
                  {String(detail.resource_type ?? "-")}
                  {detail.resource_id ? ` #${String(detail.resource_id)}` : ""}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex items-start gap-2">
                <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">ผู้ใช้</p>
                  <p className="mt-0.5 text-sm">{String(detail.user_name ?? "-")}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Fingerprint className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">IP Address</p>
                  <p className="mt-0.5 text-sm tabular-nums">{String(detail.ip_address ?? "-")}</p>
                </div>
              </div>
              <div className="sm:col-span-2 flex items-start gap-2">
                <MonitorSmartphone className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">User Agent</p>
                  <p className="mt-0.5 truncate text-sm">{String(detail.user_agent ?? "-")}</p>
                </div>
              </div>
              <div className="sm:col-span-2 flex items-start gap-2">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Request ID</p>
                  <p className="mt-0.5 text-sm tabular-nums">{String(detail.request_id ?? "-")}</p>
                </div>
              </div>
            </div>

            {detail.description ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">คำอธิบาย</p>
                <p className="mt-0.5 text-sm">{String(detail.description)}</p>
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <FileJson2 className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" /> ค่าก่อนแก้ไข (old)
                </p>
                <pre className="mt-1 max-h-48 overflow-auto rounded-md bg-[var(--cmms-bg-muted)] p-3 text-xs">{fmtValue(detail.old_value)}</pre>
              </div>
              <div>
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <FileJson2 className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" /> ค่าหลังแก้ไข (new)
                </p>
                <pre className="mt-1 max-h-48 overflow-auto rounded-md bg-[var(--cmms-bg-muted)] p-3 text-xs">{fmtValue(detail.new_value)}</pre>
              </div>
            </div>
          </div>
        )}
      </Dialog>
    </PageShell>
  );
}