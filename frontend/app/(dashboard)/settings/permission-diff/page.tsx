"use client";

import { useEffect, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { usePageHero } from "@/lib/i18n";

interface DriftItem {
  menu_key: string;
  label: string;
  module: string;
  has_api_view: boolean;
}

interface RoleDrift {
  id: number;
  name: string;
  granted_menus: number;
  drift_count: number;
  drift: DriftItem[];
}

export default function PermissionDiffPage() {
  const hero = usePageHero("settings");
  const [roles, setRoles] = useState<RoleDrift[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterRole, setFilterRole] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/permission_diff.php");
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "โหลดไม่สำเร็จ");
      setRoles(json.roles || []);
    } catch (e: any) {
      setError(e.message || "โหลดไม่สำเร็จ");
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const shown = filterRole ? roles.filter((r) => r.id === filterRole) : roles;
  const totalDrift = roles.reduce((s, r) => s + r.drift_count, 0);

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">PERMISSION DRIFT · CMMS-TOPPAN</p>}
      breadcrumbs={[
        { label: "หน้าแรก", href: "/dashboard" },
        { label: "ตั้งค่า", href: "/settings" },
        { label: "ตรวจ drift สิทธิ์เมนู" },
      ]}
      title="ตรวจความไม่ตรงกันของสิทธิ์เมนู vs API"
      description="เมนูที่ role เห็น (menu_permissions) แต่ API module ไม่มีสิทธิ์ view → ผู้ใช้จะเห็นเมนูแต่ข้อมูลเป็น 403 (ปัญหาที่เคยเกิดกับ Foreman/Officer)"
      actions={
        <Button variant="secondary" onClick={load} disabled={loading}>
          รีเฟรช
        </Button>
      }
    >
      {error && <Alert variant="danger" title="Error" description={error} />}

      {!loading && totalDrift === 0 && (
        <Alert variant="success" title="ไม่พบ drift" description="ทุกเมนูที่ role ได้รับ มีสิทธิ์ API ตรงกัน — ไม่มีเมนูที่จะเป็น 403" />
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-3" style={{ padding: 60 }}>
          <Spinner size={20} />
          <p className="text-sm text-muted-foreground">กำลังตรวจ...</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setFilterRole(null)}
              className={`rounded-full px-3 py-1 text-sm ${filterRole === null ? "bg-[var(--cmms-primary)] text-white" : "bg-[var(--cmms-bg-muted)]"}`}
            >
              ทุกบทบาท ({totalDrift})
            </button>
            {roles.map((r) => (
              <button
                key={r.id}
                onClick={() => setFilterRole(r.id)}
                className={`rounded-full px-3 py-1 text-sm ${filterRole === r.id ? "bg-[var(--cmms-primary)] text-white" : "bg-[var(--cmms-bg-muted)]"}`}
              >
                {r.name} ({r.drift_count})
              </button>
            ))}
          </div>

          {shown.map((r) => (
            <Card key={r.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{r.name} (role {r.id})</span>
                  <span className="text-sm font-normal text-muted-foreground">
                    เมนูที่ได้รับ {r.granted_menus} · drift {r.drift_count}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {r.drift.length === 0 ? (
                  <p className="text-sm text-muted-foreground">ไม่พบ drift ในบทบาทนี้</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-2">เมนู</th>
                          <th className="text-left p-2">href key</th>
                          <th className="text-left p-2">module</th>
                          <th className="text-left p-2">API view</th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.drift.map((d) => (
                          <tr key={d.menu_key} className="border-b">
                            <td className="p-2 font-medium">{d.label}</td>
                            <td className="p-2 font-mono text-xs">{d.menu_key}</td>
                            <td className="p-2">{d.module}</td>
                            <td className="p-2">
                              <Badge variant="danger">ไม่มีสิทธิ์ view</Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </PageShell>
  );
}
