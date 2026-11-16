"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCan } from "@/lib/useCan";
import { Building2, Layers, DoorOpen, Cpu, Cable, Plus, Trash2, Save, RefreshCw, Map, Box, ChevronRight, Network } from "lucide-react";

type Location = { id: number; parent_id: number | null; code: string; name: string; type: string; description: string; is_active: number };
type Asset = { id: number; code: string; name: string; status: string; location_id: number | null; location_name: string | null; location_type: string | null };
type Port = { id: string; label: string; port_type: string; port_no: string; endpoint: string; status: string; notes: string };
type RoomCfg = { notes: string; ports: Port[]; floor_plan: { grid_w: number; grid_h: number; image_url: string } };
type LayoutConfig = { version: number; updated_at?: string | null; rooms: Record<string, RoomCfg>; assets: Record<string, { ports: Port[]; notes?: string }> };

const PORT_TYPES = [
  { value: "lan", label: "LAN / Network" },
  { value: "fiber", label: "Fiber / Optical" },
  { value: "patch", label: "Patch Panel" },
  { value: "power", label: "Power / Outlet" },
  { value: "io", label: "I/O / Signal" },
  { value: "sensor", label: "Sensor" },
  { value: "other", label: "อื่นๆ" },
];
const PORT_STATUS = [
  { value: "active", label: "ใช้งาน" },
  { value: "spare", label: "ว่าง/สำรอง" },
  { value: "reserved", label: "จอง" },
  { value: "faulty", label: "ชำรุด" },
  { value: "inactive", label: "ไม่ใช้งาน" },
];

function defaultRoom(): RoomCfg { return { notes: "", ports: [], floor_plan: { grid_w: 8, grid_h: 6, image_url: "" } }; }
function newPort(): Port { return { id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, label: "", port_type: "lan", port_no: "", endpoint: "", status: "active", notes: "" }; }

export default function FacilityLayoutPage() {
  const canManage = useCan("settings")("manage");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState("");
  const [config, setConfig] = useState<LayoutConfig>({ version: 1, rooms: {}, assets: {} });
  const [locations, setLocations] = useState<Location[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selectedBuilding, setSelectedBuilding] = useState<number | null>(null);
  const [selectedFloor, setSelectedFloor] = useState<number | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<"2d" | "3d">("2d");

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/v1/facility_layout.php");
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error || "โหลดข้อมูลไม่สำเร็จ");
      setConfig({
        version: json.config?.version ?? 1,
        updated_at: json.config?.updated_at ?? null,
        rooms: json.config?.rooms ?? {},
        assets: json.config?.assets ?? {},
      });
      setLocations(Array.isArray(json.locations) ? json.locations : []);
      setAssets(Array.isArray(json.assets) ? json.assets : []);
    } catch (e: any) {
      setError(e.message || "โหลดข้อมูลไม่สำเร็จ");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const byParent = useMemo(() => {
    const m: Record<number, Location[]> = {};
    for (const l of locations) {
      const p = l.parent_id ?? 0;
      if (!m[p]) m[p] = [];
      m[p].push(l);
    }
    for (const arr of Object.values(m)) arr.sort((a,b)=> (a.code||"").localeCompare(b.code||"") || a.name.localeCompare(b.name));
    return m;
  }, [locations]);
  const roots = byParent[0] || [];
  const buildings = roots.length ? roots : locations.filter(l => !l.parent_id);
  const floors = selectedBuilding ? (byParent[selectedBuilding] || []) : [];
  const rooms = selectedFloor ? (byParent[selectedFloor] || []) : (selectedBuilding ? [] : []);
  const effectiveRoomId = selectedRoom ?? (rooms[0]?.id ?? null);
  const roomAssets = useMemo(() => assets.filter(a => a.location_id === effectiveRoomId), [assets, effectiveRoomId]);
  const roomCfg: RoomCfg = useMemo(() => (effectiveRoomId ? (config.rooms[String(effectiveRoomId)] || defaultRoom()) : defaultRoom()), [config, effectiveRoomId]);

  const updateRoom = (rid: number, patch: Partial<RoomCfg>) => {
    setConfig(c => ({ ...c, rooms: { ...c.rooms, [String(rid)]: { ...(c.rooms[String(rid)] || defaultRoom()), ...patch } } }));
  };
  const updateRoomPorts = (rid: number, ports: Port[]) => updateRoom(rid, { ports });
  const save = async () => {
    setSaving(true); setError(null); setSavedMsg("");
    try {
      const res = await fetch("/api/v1/facility_layout.php", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ config }) });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error || "บันทึกไม่สำเร็จ");
      setConfig(json.config || config);
      setSavedMsg("บันทึกผังอาคาร/พอร์ตเรียบร้อย");
      setTimeout(()=>setSavedMsg(""), 4000);
    } catch (e: any) { setError(e.message || "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  const allRoomIds = useMemo(() => {
    // rooms are leaves or nodes at depth >= 2; include selected subtree leaves
    const ids: number[] = [];
    const walk = (pid: number) => {
      for (const c of (byParent[pid] || [])) { ids.push(c.id); walk(c.id); }
    };
    if (selectedFloor) walk(selectedFloor); else if (selectedBuilding) walk(selectedBuilding);
    return ids;
  }, [byParent, selectedBuilding, selectedFloor]);

  const portSummary = useMemo(() => {
    let total = 0, active = 0, spare = 0, faulty = 0;
    const scan = (ports: Port[]) => { for (const p of ports) { total++; if (p.status==='active') active++; if (p.status==='spare') spare++; if (p.status==='faulty') faulty++; } };
    Object.values(config.rooms).forEach(r => scan(r?.ports||[]));
    Object.values(config.assets).forEach(a => scan((a as any)?.ports||[]));
    return { total, active, spare, faulty };
  }, [config]);

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">FACILITY & LAYOUT</p>}
      breadcrumbs={[{ label: "แดชบอร์ด", href: "/dashboard" }, { label: "ผังอาคารและพอร์ต" }]}
      title="ผังอาคาร / ชั้น / ห้อง และพอร์ต"
      description="กำหนดโครงสร้างอาคาร ผูกเครื่องจักรกับห้อง และจัดการทะเบียนพอร์ต (LAN/Power/I/O/Sensor) แบบครบวงจร — พร้อมมุมมอง 2D/3D"
      actions={
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={fetchData}><RefreshCw className="w-4 h-4" /> รีเฟรช</Button>
          {canManage && <Button onClick={save} disabled={saving}><Save className="w-4 h-4" /> {saving?"กำลังบันทึก...":"บันทึกผัง/พอร์ต"}</Button>}
        </div>
      }
    >
      {error && <Alert variant="danger">{error}</Alert>}
      {savedMsg && <Alert variant="success">{savedMsg}</Alert>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">อาคาร/ตำแหน่ง</div><div className="text-2xl font-bold">{locations.length}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">เครื่องจักร</div><div className="text-2xl font-bold">{assets.length}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">พอร์ตทั้งหมด</div><div className="text-2xl font-bold">{portSummary.total}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">ใช้งาน / ว่าง / ชำรุด</div><div className="text-lg font-bold">{portSummary.active} / {portSummary.spare} / <span className="text-red-600">{portSummary.faulty}</span></div></CardContent></Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-1">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Building2 className="w-4 h-4"/>โครงสร้างอาคาร</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">ใช้ข้อมูลจาก Master Data: Locations (รองรับ parent_id/type เป็น อาคาร→ชั้น→ห้อง). จัดการโครงสร้างได้ที่ Settings &gt; ข้อมูลหลัก (locations)</p>
            <div>
              <Label>อาคาร / ไซต์</Label>
              <Select value={selectedBuilding ? String(selectedBuilding) : "__none__"} onValueChange={(v)=>{ const id=v==="__none__"?null:Number(v); setSelectedBuilding(id); setSelectedFloor(null); setSelectedRoom(null); }}>
                <SelectTrigger><SelectValue placeholder="เลือกอาคาร" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">-- เลือกอาคาร --</SelectItem>
                  {buildings.map(b => <SelectItem key={b.id} value={String(b.id)}>{b.code ? `${b.code} · ` : ""}{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>ชั้น / โซน</Label>
              <Select value={selectedFloor ? String(selectedFloor) : "__none__"} onValueChange={(v)=>{ const id=v==="__none__"?null:Number(v); setSelectedFloor(id); setSelectedRoom(null); }}>
                <SelectTrigger><SelectValue placeholder="เลือกชั้น" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">-- เลือกชั้น --</SelectItem>
                  {floors.map(f => <SelectItem key={f.id} value={String(f.id)}>{f.code ? `${f.code} · ` : ""}{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>ห้อง / จุดติดตั้ง</Label>
              <Select value={effectiveRoomId ? String(effectiveRoomId) : "__none__"} onValueChange={(v)=> setSelectedRoom(v==="__none__"?null:Number(v))}>
                <SelectTrigger><SelectValue placeholder="เลือกห้อง" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">-- เลือกห้อง --</SelectItem>
                  {rooms.map(r => <SelectItem key={r.id} value={String(r.id)}>{r.code ? `${r.code} · ` : ""}{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {effectiveRoomId && (
              <div className="rounded-lg border p-3 text-sm space-y-1 bg-muted/30">
                <div className="font-semibold flex items-center gap-2"><DoorOpen className="w-4 h-4"/>ห้องที่เลือก</div>
                <div>{locations.find(l=>l.id===effectiveRoomId)?.name} <span className="text-muted-foreground">({locations.find(l=>l.id===effectiveRoomId)?.code || `#${effectiveRoomId}`})</span></div>
                <div className="text-muted-foreground">เครื่องจักร {roomAssets.length} เครื่อง · พอร์ตห้อง {(roomCfg.ports||[]).length} จุด</div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between"><CardTitle className="text-base flex items-center gap-2"><Cable className="w-4 h-4"/>ทะเบียนพอร์ตของห้อง (Network/Power/I/O)</CardTitle>
            {canManage && effectiveRoomId && <Button size="sm" variant="outline" onClick={()=> updateRoomPorts(effectiveRoomId, [...(roomCfg.ports||[]), newPort()])}><Plus className="w-4 h-4"/>เพิ่มพอร์ต</Button>}
          </CardHeader>
          <CardContent className="space-y-3">
            {!effectiveRoomId ? <p className="text-sm text-muted-foreground">เลือกห้องเพื่อจัดการพอร์ต</p> : (
              <>
                {(roomCfg.ports||[]).length === 0 ? <p className="text-sm text-muted-foreground">ยังไม่มีพอร์ตในห้องนี้ — กด “เพิ่มพอร์ต” เพื่อบันทึกจุด LAN/Power/I-O/Sensor</p> : (
                  <div className="space-y-2">
                    {(roomCfg.ports||[]).map((p, idx) => (
                      <div key={p.id} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end rounded-lg border p-2">
                        <div className="md:col-span-3"><Label className="text-xs">ชื่อ/Label</Label><Input value={p.label} onChange={e=>{ const np=[...roomCfg.ports]; np[idx]={...p,label:e.target.value}; updateRoomPorts(effectiveRoomId,np); }} placeholder="เช่น LAN-01, Outlet-A" /></div>
                        <div className="md:col-span-2"><Label className="text-xs">ประเภท</Label>
                          <select className="w-full h-10 rounded-md border bg-background px-2 text-sm" value={p.port_type} onChange={e=>{ const np=[...roomCfg.ports]; np[idx]={...p,port_type:e.target.value}; updateRoomPorts(effectiveRoomId,np); }}>
                            {PORT_TYPES.map(t=> <option key={t.value} value={t.value}>{t.label}</option>)}
                          </select>
                        </div>
                        <div className="md:col-span-2"><Label className="text-xs">Port/ช่อง</Label><Input value={p.port_no} onChange={e=>{ const np=[...roomCfg.ports]; np[idx]={...p,port_no:e.target.value}; updateRoomPorts(effectiveRoomId,np); }} placeholder="SW1-P24" /></div>
                        <div className="md:col-span-3"><Label className="text-xs">ปลายทาง/เชื่อมกับ</Label><Input value={p.endpoint} onChange={e=>{ const np=[...roomCfg.ports]; np[idx]={...p,endpoint:e.target.value}; updateRoomPorts(effectiveRoomId,np); }} placeholder="เครื่อง/Panel/อุปกรณ์" /></div>
                        <div className="md:col-span-1"><Label className="text-xs">สถานะ</Label>
                          <select className="w-full h-10 rounded-md border bg-background px-2 text-sm" value={p.status} onChange={e=>{ const np=[...roomCfg.ports]; np[idx]={...p,status:e.target.value}; updateRoomPorts(effectiveRoomId,np); }}>
                            {PORT_STATUS.map(s=> <option key={s.value} value={s.value}>{s.label}</option>)}
                          </select>
                        </div>
                        <div className="md:col-span-1 flex justify-end">{canManage && <Button variant="ghost" size="sm" onClick={()=> updateRoomPorts(effectiveRoomId, roomCfg.ports.filter((_,i)=>i!==idx))}><Trash2 className="w-4 h-4 text-red-500"/></Button>}</div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="pt-2">
                  <Label>บันทึก/รายละเอียดห้อง</Label>
                  <Input value={roomCfg.notes||""} onChange={e=>updateRoom(effectiveRoomId,{notes:e.target.value})} placeholder="หมายเหตุของห้อง, จุดสังเกต, รหัสแผงวงจร ฯลฯ" />
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Cpu className="w-4 h-4"/>เครื่องจักรในห้องที่เลือก</CardTitle></CardHeader>
        <CardContent>
          {!effectiveRoomId ? <p className="text-sm text-muted-foreground">เลือกห้องเพื่อดูเครื่องจักรที่ผูกกับตำแหน่งนี้</p> : roomAssets.length === 0 ? (
            <p className="text-sm text-muted-foreground">ยังไม่มีเครื่องจักรผูกกับห้องนี้ — กำหนด location ของ asset ให้ชี้มาที่ห้องนี้ (ผ่านทะเบียนเครื่องจักร/asset) เพื่อให้ปรากฏในผัง</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {roomAssets.map(a => (
                <div key={a.id} className="rounded-lg border p-3 space-y-1">
                  <div className="flex items-center justify-between"><span className="font-mono text-xs font-bold">{a.code}</span><Badge variant="neutral">{a.status || "-"}</Badge></div>
                  <div className="font-semibold text-sm">{a.name}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1"><Network className="w-3 h-3"/>พอร์ตเครื่อง: {(config.assets[String(a.id)]?.ports||[]).length} จุด</div>
                  {canManage && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-primary">จัดการพอร์ตเครื่อง</summary>
                      <AssetPortEditor assetId={a.id} config={config} setConfig={setConfig} />
                    </details>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><Map className="w-4 h-4"/>มุมมองผัง (2D / 3D)</CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant={viewMode==="2d"?"primary":"outline"} onClick={()=>setViewMode("2d")}><Map className="w-4 h-4"/>2D</Button>
            <Button size="sm" variant={viewMode==="3d"?"primary":"outline"} onClick={()=>setViewMode("3d")}><Box className="w-4 h-4"/>3D</Button>
          </div>
        </CardHeader>
        <CardContent>
          {viewMode === "2d" ? (
            <Layout2D buildings={buildings} floors={floors} rooms={rooms} byParent={byParent} assets={assets} config={config} selectedBuilding={selectedBuilding} selectedFloor={selectedFloor} selectedRoom={effectiveRoomId} />
          ) : (
            <Layout3D buildings={buildings} floors={floors} rooms={rooms} byParent={byParent} assets={assets} config={config} selectedBuilding={selectedBuilding} selectedFloor={selectedFloor} />
          )}
          <p className="text-xs text-muted-foreground mt-3">หมายเหตุ: ผัง 2D/3D นี้สร้างจากโครงสร้างอาคาร (locations) และข้อมูลพอร์ตที่บันทึกไว้ สามารถแนบรูป floor plan จริงเพิ่มเติมทีหลังได้ในรายละเอียดห้อง (รองรับการขยายเป็นผังตามพิกัด)</p>
        </CardContent>
      </Card>
    </PageShell>
  );
}

function AssetPortEditor({ assetId, config, setConfig }: { assetId: number; config: LayoutConfig; setConfig: (c: any)=>void }) {
  const key = String(assetId);
  const entry = config.assets[key] || { ports: [], notes: "" };
  const ports: Port[] = (entry as any).ports || [];
  const update = (np: Port[]) => setConfig((c: LayoutConfig) => ({ ...c, assets: { ...c.assets, [key]: { ...(c.assets[key]||{notes:""}), ports: np } } }));
  return (
    <div className="mt-2 space-y-2 border-t pt-2">
      {ports.map((p, idx) => (
        <div key={p.id} className="grid grid-cols-2 gap-1">
          <Input value={p.label} onChange={e=>{ const n=[...ports]; n[idx]={...p,label:e.target.value}; update(n); }} placeholder="Label/Port" className="h-8 text-xs" />
          <div className="flex gap-1">
            <Input value={p.endpoint} onChange={e=>{ const n=[...ports]; n[idx]={...p,endpoint:e.target.value}; update(n); }} placeholder="เชื่อมกับ" className="h-8 text-xs" />
            <Button variant="ghost" size="sm" className="h-8 px-2" onClick={()=>update(ports.filter((_,i)=>i!==idx))}><Trash2 className="w-3 h-3"/></Button>
          </div>
        </div>
      ))}
      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={()=>update([...ports, newPort()])}><Plus className="w-3 h-3 mr-1"/>เพิ่มพอร์ตเครื่อง</Button>
    </div>
  );
}

function Layout2D({ buildings, floors, rooms, byParent, assets, config, selectedBuilding, selectedFloor, selectedRoom }: any) {
  const showBuildings = !selectedBuilding ? buildings : [];
  const showFloors = selectedBuilding && !selectedFloor ? floors : [];
  const showRooms = selectedFloor ? rooms : (selectedBuilding && floors.length===0 ? (byParent[selectedBuilding]||[]) : []);
  return (
    <div className="space-y-4">
      {showBuildings.length > 0 && (
        <div>
          <div className="text-sm font-semibold mb-2 flex items-center gap-2"><Building2 className="w-4 h-4"/>อาคารทั้งหมด</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {showBuildings.map((b: Location) => {
              const childFloors = byParent[b.id] || [];
              let assetCount = 0; let portCount = 0;
              const walk = (id:number) => { assetCount += assets.filter((a:Asset)=>a.location_id===id).length; portCount += (config.rooms[String(id)]?.ports||[]).length; (byParent[id]||[]).forEach((c: Location)=>walk(c.id)); };
              walk(b.id);
              return (
                <div key={b.id} className="rounded-xl border-2 border-sky-200 bg-sky-50 p-4">
                  <div className="font-bold">{b.name}</div>
                  <div className="text-xs text-muted-foreground">{b.code || `#${b.id}`}</div>
                  <div className="mt-2 text-xs">{childFloors.length} ชั้น/โซน · {assetCount} เครื่อง · {portCount} พอร์ต</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {showFloors.length > 0 && (
        <div>
          <div className="text-sm font-semibold mb-2 flex items-center gap-2"><Layers className="w-4 h-4"/>ชั้น/โซน ในอาคาร</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {showFloors.map((f: Location) => {
              const rs = byParent[f.id] || [];
              let assetCount = 0; let portCount = 0;
              rs.forEach((r: any) => { assetCount += assets.filter((a:Asset)=>a.location_id===r.id).length; portCount += (config.rooms[String(r.id)]?.ports||[]).length; });
              return (
                <div key={f.id} className="rounded-xl border-2 border-indigo-200 bg-indigo-50 p-4">
                  <div className="font-bold">{f.name}</div>
                  <div className="text-xs text-muted-foreground">{f.code || `#${f.id}`}</div>
                  <div className="mt-2 text-xs">{rs.length} ห้อง · {assetCount} เครื่อง · {portCount} พอร์ต</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {selectedFloor && (
        <div>
          <div className="text-sm font-semibold mb-2 flex items-center gap-2"><DoorOpen className="w-4 h-4"/>ผังห้อง (2D)</div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {(rooms||[]).map((r: Location) => {
              const ra = assets.filter((a:Asset)=>a.location_id===r.id);
              const rp = (config.rooms[String(r.id)]?.ports||[]) as Port[];
              const faulty = rp.filter(p=>p.status==='faulty').length;
              const active = selectedRoom === r.id;
              return (
                <div key={r.id} className={`rounded-xl border-2 p-3 ${active?"border-emerald-500 bg-emerald-50":"border-slate-200 bg-white"}`}>
                  <div className="font-semibold text-sm flex items-center justify-between"><span>{r.name}</span>{faulty>0 && <Badge variant="danger">พอร์ตชำรุด {faulty}</Badge>}</div>
                  <div className="text-xs text-muted-foreground">{r.code || `#${r.id}`}</div>
                  <div className="mt-2 text-xs space-y-1">
                    <div className="flex items-center gap-1"><Cpu className="w-3 h-3"/>{ra.length} เครื่อง</div>
                    <div className="flex items-center gap-1"><Cable className="w-3 h-3"/>{rp.length} พอร์ต (ใช้งาน {rp.filter(p=>p.status==='active').length} / ว่าง {rp.filter(p=>p.status==='spare').length})</div>
                  </div>
                  {ra.length>0 && <div className="mt-2 flex flex-wrap gap-1">{ra.slice(0,4).map((a:Asset)=><span key={a.id} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 border">{a.code}</span>)}{ra.length>4 && <span className="text-[10px] text-muted-foreground">+{ra.length-4}</span>}</div>}
                </div>
              );
            })}
          </div>
          {(rooms||[]).length===0 && <p className="text-sm text-muted-foreground">ชั้นนี้ยังไม่มีห้องย่อยใน locations — เพิ่มห้อง (parent = ชั้นนี้) เพื่อแสดงผังห้อง</p>}
        </div>
      )}
      {!selectedBuilding && buildings.length===0 && <p className="text-sm text-muted-foreground">ยังไม่มีโครงสร้างอาคารใน Locations — เพิ่ม location ระดับอาคาร (ไม่มี parent) แล้วเพิ่มชั้นและห้องเป็นลูกตามลำดับ</p>}
    </div>
  );
}

function Layout3D({ buildings, floors, rooms, byParent, assets, config, selectedBuilding, selectedFloor }: any) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio||1, 2);
    const resize = () => { const w=canvas.clientWidth, h=canvas.clientHeight; canvas.width=Math.max(1,w*dpr); canvas.height=Math.max(1,h*dpr); ctx.setTransform(dpr,0,0,dpr,0,0); };
    resize();
    const W = () => canvas.clientWidth, H = () => canvas.clientHeight;
    let t = 0, raf = 0;
    const iso = (x:number,y:number,z:number) => {
      const cx=W()/2, cy=H()*0.72; const s=0.9;
      return { x: cx + (x - y) * 28*s, y: cy + (x + y) * 14*s - z * 22*s };
    };
    const drawBox = (x:number,y:number,z:number,w:number,d:number,h:number,top:string,side:string,front:string,stroke:string,label?:string) => {
      const p1=iso(x,y,z+h), p2=iso(x+w,y,z+h), p3=iso(x+w,y+d,z+h), p4=iso(x,y+d,z+h);
      const b1=iso(x,y,z), b2=iso(x+w,y,z), b3=iso(x+w,y+d,z), b4=iso(x,y+d,z);
      ctx.beginPath(); ctx.moveTo(p4.x,p4.y); ctx.lineTo(p3.x,p3.y); ctx.lineTo(b3.x,b3.y); ctx.lineTo(b4.x,b4.y); ctx.closePath(); ctx.fillStyle=front; ctx.fill(); ctx.strokeStyle=stroke; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p2.x,p2.y); ctx.lineTo(p3.x,p3.y); ctx.lineTo(b3.x,b3.y); ctx.lineTo(b2.x,b2.y); ctx.closePath(); ctx.fillStyle=side; ctx.fill(); ctx.strokeStyle=stroke; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p1.x,p1.y); ctx.lineTo(p2.x,p2.y); ctx.lineTo(p3.x,p3.y); ctx.lineTo(p4.x,p4.y); ctx.closePath(); ctx.fillStyle=top; ctx.fill(); ctx.strokeStyle=stroke; ctx.stroke();
      if (label) { ctx.fillStyle="rgb(15,23,42)"; ctx.font="11px sans-serif"; ctx.textAlign="center"; ctx.fillText(label, (p1.x+p3.x)/2, (p1.y+p3.y)/2+4); }
    };
    const draw = () => {
      t+=0.01;
      ctx.clearRect(0,0,W(),H());
      const g = ctx.createLinearGradient(0,0,0,H()); g.addColorStop(0,'rgb(224,242,254)'); g.addColorStop(1,'rgb(248,250,252)'); ctx.fillStyle=g; ctx.fillRect(0,0,W(),H());
      const blds = selectedBuilding ? buildings.filter((b:any)=>b.id===selectedBuilding) : buildings.slice(0,6);
      let bx = -blds.length*1.8;
      blds.forEach((b:any, bi:number) => {
        const fls = (selectedBuilding ? floors : (byParent[b.id]||[])).slice(0,6);
        const baseZ = 0;
        if (fls.length === 0) {
          const bob = Math.sin(t+bi)*0.05;
          drawBox(bx, bi*0.2, baseZ+bob, 2.4, 2.0, 1.2, 'rgb(125,211,252)', 'rgb(56,189,248)', 'rgb(14,165,233)', 'rgb(3,105,161)', b.name.slice(0,10));
        } else {
          fls.forEach((f:any, fi:number) => {
            const rs = (selectedFloor && f.id!==selectedFloor) ? [] : (byParent[f.id]||[]).slice(0,8);
            const h = 0.9;
            const z = baseZ + fi*h + Math.sin(t*0.5+fi)*0.02;
            drawBox(bx, bi*0.2, z, 2.6, 2.2, h*0.85, fi%2?'rgb(165,180,252)':'rgb(199,210,254)', 'rgb(129,140,248)', 'rgb(99,102,241)', 'rgb(67,56,202)', fi===0?b.name.slice(0,8):undefined);
            // rooms/machines as small blocks on floor
            rs.slice(0,6).forEach((r:any, ri:number) => {
              const rx = bx + 0.2 + (ri%3)*0.75;
              const ry = bi*0.2 + 0.2 + Math.floor(ri/3)*0.8;
              const ac = assets.filter((a:any)=>a.location_id===r.id).length;
              const pc = (config.rooms[String(r.id)]?.ports||[]).length;
              const mh = 0.18 + Math.min(0.35, ac*0.05 + pc*0.02);
              drawBox(rx, ry, z + h*0.85, 0.5, 0.45, mh, ac>0?'rgb(110,231,183)':'rgb(226,232,240)', 'rgb(52,211,153)', 'rgb(16,185,129)', 'rgb(4,120,87)');
            });
          });
        }
        bx += 3.6;
      });
      if (blds.length===0) { ctx.fillStyle='rgb(100,116,139)'; ctx.font='14px sans-serif'; ctx.textAlign='center'; ctx.fillText('ยังไม่มีข้อมูลอาคาร/ชั้น/ห้อง ให้เพิ่มใน Locations', W()/2, H()/2); }
      ctx.fillStyle='rgb(51,65,85)'; ctx.font='12px sans-serif'; ctx.textAlign='left'; ctx.fillText('3D Isometric View — อาคาร/ชั้น/ห้อง และจุดเครื่องจักร-พอร์ต', 12, 20);
      raf = requestAnimationFrame(draw);
    };
    draw();
    window.addEventListener('resize', resize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, [buildings,floors,rooms,byParent,assets,config,selectedBuilding,selectedFloor]);
  return <div className="w-full h-[420px] rounded-xl border overflow-hidden bg-slate-50"><canvas ref={canvasRef} className="w-full h-full block" /></div>;
}
