"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCan } from "@/lib/useCan";
import { Building2, Layers, DoorOpen, Cpu, Cable, Plus, Trash2, Save, RefreshCw, Map, Box, ChevronRight, Network, Search, AlertTriangle, CircleCheck, CircleDashed, Wrench } from "lucide-react";
import AndonBadge from "@/components/AndonBadge";

type Location = { id: number; parent_id: number | null; code: string; name: string; type: string; description: string; is_active: number };
type Asset = { id: number; code: string; name: string; status: string; location_id: number | null; location_name: string | null; location_type: string | null };
type PortRef = { scope: "room"|"cabinet"|"asset"; room_id: number; cabinet_id?: string; asset_id?: number; port_id: string };
type Port = { id: string; label: string; port_type: string; port_no: string; endpoint: string; status: string; notes: string; spec?: string; feeds?: PortRef[] };
type Cabinet = { id: string; name: string; code: string; cabinet_type: string; location_note: string; status: string; notes: string; ports: Port[] };
type FloorPlanItem = { id: string; type: "cabinet"|"asset"; ref_id: string; x: number; y: number; label?: string };
type RoomCfg = { notes: string; ports: Port[]; cabinets: Cabinet[]; floor_plan: { grid_w: number; grid_h: number; image_url: string; items: FloorPlanItem[] } };
type LayoutConfig = { version: number; updated_at?: string | null; rooms: Record<string, RoomCfg>; assets: Record<string, { ports: Port[]; notes?: string }> };

const PORT_TYPES = [
  { value: "lan", label: "LAN / Network" },
  { value: "fiber", label: "Fiber / Optical" },
  { value: "patch", label: "Patch Panel" },
  { value: "power", label: "Power / ปลั๊กไฟ" },
  { value: "electrical", label: "ไฟฟ้า / เบรกเกอร์ / วงจร" },
  { value: "control", label: "Control / PLC / Terminal" },
  { value: "io", label: "I/O / Signal" },
  { value: "sensor", label: "Sensor / Instrument" },
  { value: "pneumatic", label: "ลม / Pneumatic" },
  { value: "water", label: "น้ำ / Water" },
  { value: "steam", label: "ไอน้ำ / Steam" },
  { value: "utility", label: "Utility / สาธารณูปโภคอื่น" },
  { value: "other", label: "อื่นๆ (ระบุในหมายเหตุ/สเปก)" },
];
const PORT_STATUS = [
  { value: "active", label: "ใช้งาน" },
  { value: "spare", label: "ว่าง/สำรอง" },
  { value: "reserved", label: "จอง" },
  { value: "planned", label: "วางแผน/รอติดตั้ง" },
  { value: "faulty", label: "ชำรุด" },
  { value: "inactive", label: "ไม่ใช้งาน" },
];
const CABINET_TYPES = [
  { value: "electrical", label: "ตู้ไฟ / MDB / DB" },
  { value: "control", label: "ตู้คอนโทรล / PLC Panel" },
  { value: "mcc", label: "MCC / Motor Control" },
  { value: "network", label: "ตู้ Network / Rack" },
  { value: "instrument", label: "ตู้ Instrument / Junction Box" },
  { value: "other", label: "ตู้/แผงอื่นๆ" },
];

function defaultRoom(): RoomCfg { return { notes: "", ports: [], cabinets: [], floor_plan: { grid_w: 8, grid_h: 6, image_url: "", items: [] } }; }
function newPort(): Port { return { id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, label: "", port_type: "lan", port_no: "", endpoint: "", status: "active", notes: "", spec: "", feeds: [] }; }

function portRefKey(ref: PortRef): string {
  if (ref.scope === "cabinet") return `cab:${ref.room_id}:${ref.cabinet_id || ""}:${ref.port_id}`;
  if (ref.scope === "asset") return `asset:${ref.asset_id || 0}:${ref.port_id}`;
  return `room:${ref.room_id}:${ref.port_id}`;
}
function newCabinet(): Cabinet { return { id: `cab_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, name: "", code: "", cabinet_type: "electrical", location_note: "", status: "active", notes: "", ports: [] }; }

export default function FacilityLayoutPage() {
  const canManage = useCan("settings")("manage");
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState("");
  const [config, setConfig] = useState<LayoutConfig>({ version: 1, rooms: {}, assets: {} });
  const [locations, setLocations] = useState<Location[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetHealth, setAssetHealth] = useState<Record<number, { status: string; active_repairs: number; max_priority: string | null; location_id: number | null }>>({});
  const [selectedBuilding, setSelectedBuilding] = useState<number | null>(null);
  const [selectedFloor, setSelectedFloor] = useState<number | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<"2d" | "3d">("2d");
  const [drillApplied, setDrillApplied] = useState(false);
  const [portSearch, setPortSearch] = useState("");
  const [portTypeFilter, setPortTypeFilter] = useState<string>("all");
  const [portStatusFilter, setPortStatusFilter] = useState<string>("all");
  const [focusPort, setFocusPort] = useState<{ key: string; roomId: number | null; source: "room"|"cabinet"|"asset"; cabinetId?: string; assetId?: number; label: string } | null>(null);
  const [planPlaceTarget, setPlanPlaceTarget] = useState<{ type: "cabinet"|"asset"; ref_id: string } | null>(null);
  const [selectedPlanItemId, setSelectedPlanItemId] = useState<string | null>(null);
  const planContainerRef = useRef<HTMLDivElement>(null);
  const suppressPlanClickRef = useRef(false);
  const dragStateRef = useRef<{ id: string; pointerId: number; startClientX: number; startClientY: number; origX: number; origY: number; moved: boolean } | null>(null);
  const [dragOverride, setDragOverride] = useState<{ id: string; x: number; y: number } | null>(null);
  type HealthFocusKey = "faulty" | "planned" | "cabinet" | "repair";
  const [healthFocus, setHealthFocus] = useState<HealthFocusKey[]>([]);
  const toggleHealthFocus = (k: HealthFocusKey) => setHealthFocus(prev => prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k]);
  const healthFocusActive = healthFocus.length > 0;

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [res, hres] = await Promise.all([
        fetch("/api/v1/facility_layout.php"),
        fetch("/api/v1/asset_stats.php?resource=plant_map"),
      ]);
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
      const hjson = await hres.json().catch(() => []);
      const amap: Record<number, { status: string; active_repairs: number; max_priority: string | null; location_id: number | null }> = {};
      if (Array.isArray(hjson)) {
        hjson.forEach((r: any) => {
          const id = Number(r?.id);
          if (!id) return;
          amap[id] = { status: String(r?.status || ""), active_repairs: Number(r?.active_repairs || 0), max_priority: r?.max_priority ?? null, location_id: r?.location_id != null ? Number(r.location_id) : null };
        });
      }
      setAssetHealth(amap);
    } catch (e: any) {
      setError(e.message || "โหลดข้อมูลไม่สำเร็จ");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (drillApplied || locations.length === 0) return;
    const roomParam = searchParams.get("room") || searchParams.get("location_id") || searchParams.get("location");
    const bParam = searchParams.get("building");
    const fParam = searchParams.get("floor");
    if (!roomParam && !bParam && !fParam) { setDrillApplied(true); return; }
    const byId: Record<number, Location> = {};
    for (const l of locations) byId[l.id] = l;
    const chain = (id: number): number[] => {
      const out: number[] = [];
      let cur: number | null = id;
      let guard = 0;
      while (cur && byId[cur] && guard < 20) { out.unshift(cur); cur = byId[cur].parent_id; guard++; }
      return out;
    };
    if (roomParam) {
      const rid = Number(roomParam);
      if (rid && byId[rid]) {
        const c = chain(rid);
        if (c.length >= 3) { setSelectedBuilding(c[0]); setSelectedFloor(c[1]); setSelectedRoom(c[c.length - 1]); }
        else if (c.length === 2) { setSelectedBuilding(c[0]); setSelectedFloor(c[1]); setSelectedRoom(c[1]); }
        else if (c.length === 1) { setSelectedBuilding(c[0]); setSelectedRoom(c[0]); }
        else { setSelectedRoom(rid); }
      }
    }
    if (bParam) { const bid = Number(bParam); if (bid && byId[bid]) setSelectedBuilding(bid); }
    if (fParam) { const fid = Number(fParam); if (fid && byId[fid]) setSelectedFloor(fid); }
    setDrillApplied(true);
  }, [locations, searchParams, drillApplied]);

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
  const roomCfg: RoomCfg = useMemo(() => {
    if (!effectiveRoomId) return defaultRoom();
    const r = config.rooms[String(effectiveRoomId)];
    if (!r) return defaultRoom();
    const fp = { ...defaultRoom().floor_plan, ...(r.floor_plan || {}) } as any;
    fp.items = Array.isArray(fp.items) ? fp.items : [];
    return { ...defaultRoom(), ...r, ports: r.ports || [], cabinets: (r as any).cabinets || [], floor_plan: fp };
  }, [config, effectiveRoomId]);

  useEffect(() => {
    setSelectedPlanItemId(null);
    setPlanPlaceTarget(null);
    setDragOverride(null);
    dragStateRef.current = null;
  }, [effectiveRoomId]);

  const updateRoom = (rid: number, patch: Partial<RoomCfg>) => {
    setConfig(c => {
      const prev = (c.rooms[String(rid)] || {}) as any;
      return {
        ...c,
        rooms: {
          ...c.rooms,
          [String(rid)]: {
            ...defaultRoom(),
            ...prev,
            cabinets: prev.cabinets || [],
            ...patch,
          } as RoomCfg,
        },
      };
    });
  };
  const updateRoomPorts = (rid: number, ports: Port[]) => updateRoom(rid, { ports });
  const updateRoomCabinets = (rid: number, cabinets: Cabinet[]) => updateRoom(rid, { cabinets });
  const removePlanItem = (itemId: string) => {
    if (!effectiveRoomId) return;
    const items = (roomCfg.floor_plan?.items || []).filter(i => i.id !== itemId);
    updateRoom(effectiveRoomId, { floor_plan: { ...roomCfg.floor_plan, items } as any });
    setSelectedPlanItemId(prev => (prev === itemId ? null : prev));
  };

  const selectRoomById = (rid: number | null) => {
    if (!rid) { setSelectedRoom(null); return; }
    const byId: Record<number, Location> = {};
    for (const l of locations) byId[l.id] = l;
    const chain: number[] = [];
    let cur: number | null = rid; let guard = 0;
    while (cur && byId[cur] && guard < 20) { chain.unshift(cur); cur = byId[cur].parent_id; guard++; }
    if (chain.length >= 3) { setSelectedBuilding(chain[0]); setSelectedFloor(chain[1]); setSelectedRoom(chain[chain.length - 1]); }
    else if (chain.length === 2) { setSelectedBuilding(chain[0]); setSelectedFloor(chain[1]); setSelectedRoom(chain[1]); }
    else if (chain.length === 1) { setSelectedBuilding(chain[0]); setSelectedRoom(chain[0]); }
    else { setSelectedRoom(rid); }
  };
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
    let total = 0, active = 0, spare = 0, faulty = 0, reserved = 0, planned = 0, inactive = 0, cabinets = 0;
    const scan = (ports: Port[]) => {
      for (const p of (ports||[])) {
        total++;
        if (p.status==='active') active++;
        else if (p.status==='spare') spare++;
        else if (p.status==='faulty') faulty++;
        else if (p.status==='reserved') reserved++;
        else if (p.status==='planned') planned++;
        else if (p.status==='inactive') inactive++;
        else active++; // unknown -> count as active-ish bucket fallback? better count as other not needed
      }
    };
    Object.values(config.rooms).forEach(r => {
      scan((r as any)?.ports||[]);
      const cabs = ((r as any)?.cabinets||[]) as Cabinet[];
      cabinets += cabs.length;
      cabs.forEach(c => scan(c?.ports||[]));
    });
    Object.values(config.assets).forEach(a => scan((a as any)?.ports||[]));
    return { total, active, spare, faulty, reserved, planned, inactive, cabinets };
  }, [config]);

  const flatPorts = useMemo(() => {
    const locById: Record<number, Location> = {};
    for (const l of locations) locById[l.id] = l;
    const assetById: Record<number, Asset> = {};
    for (const a of assets) assetById[a.id] = a;
    const rows: Array<{ key: string; roomId: number | null; roomName: string; roomCode: string; source: "room"|"cabinet"|"asset"; sourceName: string; cabinetId?: string; cabinetCode?: string; cabinetLocation?: string; assetId?: number; port: Port }> = [];
    const roomNameOf = (rid: number) => {
      const l = locById[rid];
      return l ? `${l.name}${l.code ? ` (${l.code})` : ""}` : `ห้อง #${rid}`;
    };
    // room + cabinet ports
    Object.entries(config.rooms || {}).forEach(([ridStr, r]: any) => {
      const rid = Number(ridStr);
      const rn = roomNameOf(rid);
      const rcode = locById[rid]?.code || "";
      (r?.ports || []).forEach((p: Port) => rows.push({ key: `room-${rid}-${p.id}`, roomId: rid, roomName: rn, roomCode: rcode, source: "room", sourceName: "พอร์ตห้อง", port: p }));
      (r?.cabinets || []).forEach((cab: Cabinet) => {
        const cName = cab?.name || cab?.code || "ตู้/แผง";
        (cab?.ports || []).forEach((p: Port) => rows.push({ key: `cab-${rid}-${cab.id}-${p.id}`, roomId: rid, roomName: rn, roomCode: rcode, source: "cabinet", sourceName: `ตู้: ${cName}${cab?.code && cab.code !== cName ? ` (${cab.code})` : ""}`, cabinetId: cab.id, cabinetCode: cab?.code || "", cabinetLocation: cab?.location_note || "", port: p }));
      });
    });
    // asset ports
    Object.entries(config.assets || {}).forEach(([aidStr, a]: any) => {
      const aid = Number(aidStr);
      const asset = assetById[aid];
      const an = asset ? `${asset.code} · ${asset.name}` : `เครื่อง #${aid}`;
      const rid = asset?.location_id ?? null;
      const rn = rid ? roomNameOf(rid) : "ไม่ระบุห้อง";
      const rcode = rid ? (locById[rid]?.code || "") : "";
      (a?.ports || []).forEach((p: Port) => rows.push({ key: `asset-${aid}-${p.id}`, roomId: rid, roomName: rn, roomCode: rcode, source: "asset", sourceName: `เครื่อง: ${an}`, assetId: aid, port: p }));
    });
    return rows;
  }, [config, locations, assets]);

  const filteredPorts = useMemo(() => {
    const q = portSearch.trim().toLowerCase();
    return flatPorts.filter(r => {
      const p = r.port || ({} as Port);
      if (portTypeFilter !== "all" && p.port_type !== portTypeFilter) return false;
      if (portStatusFilter !== "all" && p.status !== portStatusFilter) return false;
      if (!q) return true;
      const hay = [r.roomName, r.roomCode, r.sourceName, r.cabinetCode, r.cabinetLocation, p.label, p.port_type, p.port_no, p.endpoint, p.status, p.notes, p.spec].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [flatPorts, portSearch, portTypeFilter, portStatusFilter]);

  const portIndex = useMemo(() => {
    const map: Record<string, { ref: PortRef; label: string; context: string; status: string; roomId: number | null; cabinetId?: string; assetId?: number; port: Port; sourceName: string; roomName: string }> = {};
    const locById: Record<number, Location> = {};
    for (const l of locations) locById[l.id] = l;
    const assetById: Record<number, Asset> = {};
    for (const a of assets) assetById[a.id] = a;
    const roomLabel = (rid: number) => { const l = locById[rid]; return l ? `${l.name}${l.code ? ` (${l.code})` : ""}` : `ห้อง #${rid}`; };
    Object.entries(config.rooms || {}).forEach(([ridStr, r]: any) => {
      const rid = Number(ridStr);
      const rn = roomLabel(rid);
      (r?.ports || []).forEach((p: Port) => {
        const ref: PortRef = { scope: "room", room_id: rid, port_id: p.id };
        map[portRefKey(ref)] = { ref, label: p.label || p.id, context: `${rn} · พอร์ตห้อง`, status: p.status || "active", roomId: rid, port: p, sourceName: "พอร์ตห้อง", roomName: rn };
      });
      (r?.cabinets || []).forEach((cab: Cabinet) => {
        const cn = cab?.name || cab?.code || "ตู้/แผง";
        (cab?.ports || []).forEach((p: Port) => {
          const ref: PortRef = { scope: "cabinet", room_id: rid, cabinet_id: cab.id, port_id: p.id };
          map[portRefKey(ref)] = { ref, label: p.label || p.id, context: `${rn} · ตู้ ${cn}${p.port_no ? ` #${p.port_no}` : ""}`, status: p.status || "active", roomId: rid, cabinetId: cab.id, port: p, sourceName: `ตู้: ${cn}`, roomName: rn };
        });
      });
    });
    Object.entries(config.assets || {}).forEach(([aidStr, a]: any) => {
      const aid = Number(aidStr);
      const asset = assetById[aid];
      const an = asset ? `${asset.code} · ${asset.name}` : `เครื่อง #${aid}`;
      const rid = asset?.location_id ?? null;
      const rn = rid ? roomLabel(rid) : "ไม่ระบุห้อง";
      (a?.ports || []).forEach((p: Port) => {
        const ref: PortRef = { scope: "asset", room_id: rid || 0, asset_id: aid, port_id: p.id };
        map[portRefKey(ref)] = { ref, label: p.label || p.id, context: `${rn} · เครื่อง ${an}`, status: p.status || "active", roomId: rid, assetId: aid, port: p, sourceName: `เครื่อง: ${an}`, roomName: rn };
      });
    });
    return map;
  }, [config, locations, assets]);

  const describePortRef = useCallback((ref: PortRef) => {
    const info = portIndex[portRefKey(ref)];
    if (!info) return "ปลายทางไม่พบ (อาจถูกลบ)";
    return `${info.label}${info.port.port_no ? ` [${info.port.port_no}]` : ""} — ${info.context}`;
  }, [portIndex]);

  const impactInfo = useMemo(() => {
    // build adjacency: source key -> downstream keys, and reverse upstreams
    const downstream: Record<string, string[]> = {};
    const upstreamOf: Record<string, string[]> = {};
    const allKeys = Object.keys(portIndex);
    allKeys.forEach(k => { downstream[k] = []; upstreamOf[k] = []; });
    allKeys.forEach(k => {
      const feeds = portIndex[k]?.port?.feeds || [];
      feeds.forEach((ref: PortRef) => {
        const tk = portRefKey(ref);
        if (!portIndex[tk]) return;
        downstream[k].push(tk);
        upstreamOf[tk].push(k);
      });
    });
    // sources causing impact: faulty/inactive ports; also ports inside faulty/inactive cabinets
    const badSources = new Set<string>();
    allKeys.forEach(k => {
      const st = portIndex[k]?.status;
      if (st === "faulty" || st === "inactive") badSources.add(k);
    });
    // cabinets with issue propagate to their ports as sources
    Object.entries(config.rooms || {}).forEach(([ridStr, r]: any) => {
      const rid = Number(ridStr);
      (r?.cabinets || []).forEach((cab: Cabinet) => {
        if (cab?.status === "faulty" || cab?.status === "inactive" || cab?.status === "maintenance") {
          (cab?.ports || []).forEach((p: Port) => {
            const k = portRefKey({ scope: "cabinet", room_id: rid, cabinet_id: cab.id, port_id: p.id });
            if (portIndex[k]) badSources.add(k);
          });
        }
      });
    });
    // propagate downstream from bad sources
    const affected = new Set<string>();
    const causeOf: Record<string, string> = {};
    const q: string[] = Array.from(badSources);
    q.forEach(s => { affected.add(s); causeOf[s] = s; });
    for (let i = 0; i < q.length; i++) {
      const cur = q[i];
      (downstream[cur] || []).forEach(nk => {
        if (affected.has(nk)) return;
        affected.add(nk);
        causeOf[nk] = causeOf[cur] || cur;
        q.push(nk);
      });
    }
    const impactedAssets = new Set<number>();
    affected.forEach(k => { const aid = portIndex[k]?.assetId; if (aid) impactedAssets.add(aid); });
    // edges for display
    const edges: Array<{ from: string; to: string }> = [];
    allKeys.forEach(k => (downstream[k] || []).forEach(tk => edges.push({ from: k, to: tk })));
    return { downstream, upstreamOf, badSources, affected, causeOf, impactedAssets, edges };
  }, [portIndex, config]);

  const allPortOptions = useMemo(() => {
    return Object.values(portIndex).sort((a,b)=> (a.roomName+a.context+a.label).localeCompare(b.roomName+b.context+b.label, "th"));
  }, [portIndex]);

  const roomHealthMap = useMemo(() => {
    const map: Record<number, { faultyPorts: number; plannedPorts: number; issueCabinets: number; totalPorts: number; assets: number; assetsWithActiveRepairs: number; activeRepairs: number; criticalRepairs: number }> = {};
    const ensure = (rid: number) => {
      if (!map[rid]) map[rid] = { faultyPorts: 0, plannedPorts: 0, issueCabinets: 0, totalPorts: 0, assets: 0, assetsWithActiveRepairs: 0, activeRepairs: 0, criticalRepairs: 0 };
      return map[rid];
    };
    Object.entries(config.rooms || {}).forEach(([ridStr, r]: any) => {
      const rid = Number(ridStr); if (!rid) return;
      const h = ensure(rid);
      const scanPorts = (arr: any[]) => (arr||[]).forEach((p:any) => {
        h.totalPorts++;
        if (p?.status === "faulty") h.faultyPorts++;
        if (p?.status === "planned") h.plannedPorts++;
      });
      scanPorts(r?.ports || []);
      (r?.cabinets || []).forEach((cab: any) => {
        if (["faulty","inactive","maintenance"].includes(cab?.status)) h.issueCabinets++;
        scanPorts(cab?.ports || []);
      });
    });
    assets.forEach(a => {
      const rid = a.location_id;
      if (!rid) return;
      const h = ensure(Number(rid));
      h.assets++;
      const ah = assetHealth[a.id];
      const ar = ah ? Number(ah.active_repairs || 0) : 0;
      if (ar > 0) { h.assetsWithActiveRepairs++; h.activeRepairs += ar; }
      const mp = String(ah?.max_priority || "").toLowerCase();
      if (mp === "critical" || mp === "high") h.criticalRepairs += ar || 1;
    });
    return map;
  }, [config, assets, assetHealth]);

  const healthSummary = useMemo(() => {
    let faultyPorts = 0, plannedPorts = 0, issueCabinets = 0, roomsWithIssues = 0, assetsWithActiveRepairs = 0, activeRepairs = 0;
    Object.values(roomHealthMap).forEach(h => {
      faultyPorts += h.faultyPorts; plannedPorts += h.plannedPorts; issueCabinets += h.issueCabinets;
      assetsWithActiveRepairs += h.assetsWithActiveRepairs; activeRepairs += h.activeRepairs;
      if (h.faultyPorts > 0 || h.issueCabinets > 0 || h.assetsWithActiveRepairs > 0 || h.plannedPorts > 0) roomsWithIssues++;
    });
    // also count assets with repairs even if room not in map (no location)
    return { faultyPorts, plannedPorts, issueCabinets, roomsWithIssues, assetsWithActiveRepairs, activeRepairs };
  }, [roomHealthMap]);

  const roomMatchesHealthFocus = (rid: number) => {
    if (!healthFocusActive) return true;
    const h = roomHealthMap[rid] || { faultyPorts: 0, plannedPorts: 0, issueCabinets: 0, assetsWithActiveRepairs: 0 };
    return (healthFocus.includes("faulty") && (h.faultyPorts || 0) > 0)
      || (healthFocus.includes("planned") && (h.plannedPorts || 0) > 0)
      || (healthFocus.includes("cabinet") && (h.issueCabinets || 0) > 0)
      || (healthFocus.includes("repair") && (h.assetsWithActiveRepairs || 0) > 0);
  };
  const cabinetMatchesHealthFocus = (cab: Cabinet) => {
    if (!healthFocusActive) return true;
    const portCabFilters = healthFocus.some(k => k === "faulty" || k === "planned" || k === "cabinet");
    if (!portCabFilters) return true;
    const hasFaulty = (cab.ports || []).some(p => p.status === "faulty");
    const hasPlanned = (cab.ports || []).some(p => p.status === "planned");
    const issue = ["faulty", "inactive", "maintenance"].includes(cab.status);
    return (healthFocus.includes("faulty") && hasFaulty)
      || (healthFocus.includes("planned") && hasPlanned)
      || (healthFocus.includes("cabinet") && issue);
  };
  const assetMatchesHealthFocus = (assetId: number) => {
    if (!healthFocusActive) return true;
    if (!healthFocus.includes("repair")) return true;
    const ar = assetHealth[assetId]?.active_repairs || 0;
    return ar > 0;
  };

  const jumpToPort = (r: typeof flatPorts[number]) => {
    if (r.roomId) selectRoomById(r.roomId);
    const label = `${r.port?.label || "พอร์ต"}${r.port?.port_no ? ` #${r.port.port_no}` : ""}`;
    setFocusPort({ key: r.key, roomId: r.roomId, source: r.source, cabinetId: r.cabinetId, assetId: r.assetId, label });
    setTimeout(() => {
      let targetId = r.roomId ? `room-ports-card` : "";
      if (r.source === "cabinet" && r.cabinetId) targetId = `cabinet-card-${r.cabinetId}`;
      if (r.source === "asset" && r.assetId) targetId = `asset-card-${r.assetId}`;
      const el = targetId ? document.getElementById(targetId) : null;
      if (el) {
        if (r.source === "cabinet") {
          const details = el.querySelector("details");
          if (details) (details as HTMLDetailsElement).open = true;
        }
        if (r.source === "asset") {
          const details = el.querySelector("details");
          if (details) (details as HTMLDetailsElement).open = true;
        }
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      } else {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    }, 60);
  };

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">FACILITY & LAYOUT</p>}
      breadcrumbs={[{ label: "แดชบอร์ด", href: "/dashboard" }, { label: "ผังอาคารและพอร์ต" }]}
      title="ผังอาคาร / ชั้น / ห้อง และพอร์ต"
      description="กำหนดโครงสร้างอาคาร ผูกเครื่องจักรกับห้อง จัดการตู้ไฟ/ตู้ควบคุม และทะเบียนพอร์ตทุกรูปแบบ (LAN/ไฟฟ้า/เบรกเกอร์/I-O/Sensor/Utility ฯลฯ) — กรอกข้อมูลภายหลังได้ พร้อมมุมมอง 2D/3D"
      actions={
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={fetchData}><RefreshCw className="w-4 h-4" /> รีเฟรช</Button>
          {canManage && <Button onClick={save} disabled={saving}><Save className="w-4 h-4" /> {saving?"กำลังบันทึก...":"บันทึกผัง/พอร์ต"}</Button>}
        </div>
      }
    >
      {error && <Alert variant="danger">{error}</Alert>}
      {savedMsg && <Alert variant="success">{savedMsg}</Alert>}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">อาคาร/ตำแหน่ง</div><div className="text-2xl font-bold">{locations.length}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">เครื่องจักร</div><div className="text-2xl font-bold">{assets.length}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">ตู้ไฟ/ตู้ควบคุม</div><div className="text-2xl font-bold">{portSummary.cabinets || 0}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">พอร์ต/จุดทั้งหมด</div><div className="text-2xl font-bold">{portSummary.total}</div></CardContent></Card>
        <Card className={portSummary.faulty > 0 ? "border-red-300 bg-red-50" : ""}><CardContent className="p-4"><div className="text-xs text-muted-foreground flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5 text-red-600"/>ชำรุด (ต้องตรวจสอบ)</div><div className="text-2xl font-bold text-red-700">{portSummary.faulty}</div></CardContent></Card>
        <Card className={portSummary.spare > 0 ? "border-emerald-300 bg-emerald-50" : ""}><CardContent className="p-4"><div className="text-xs text-muted-foreground flex items-center gap-1"><CircleDashed className="w-3.5 h-3.5 text-emerald-700"/>ว่าง/สำรอง</div><div className="text-2xl font-bold text-emerald-700">{portSummary.spare}</div></CardContent></Card>
      </div>
      <div className="flex flex-wrap gap-2 text-sm items-center">
        <AndonBadge tone="ok">ใช้งาน {portSummary.active}</AndonBadge>
        <Badge variant="neutral">จอง {portSummary.reserved}</Badge>
        <Badge variant="info">วางแผน/รอติดตั้ง {portSummary.planned}</Badge>
        <Badge variant="neutral">ไม่ใช้งาน {portSummary.inactive}</Badge>
        {portSummary.faulty > 0 && <AndonBadge tone="down">ชำรุด {portSummary.faulty} จุด — ตรวจสอบด่วน</AndonBadge>}
        {healthSummary.assetsWithActiveRepairs > 0 && <AndonBadge tone="warn">เครื่องมีใบแจ้งซ่อมเปิด/กำลังดำเนินการ {healthSummary.assetsWithActiveRepairs} เครื่อง ({healthSummary.activeRepairs} ใบงาน)</AndonBadge>}
        {healthSummary.roomsWithIssues > 0 && <Badge variant="info">ห้อง/จุดที่ต้องติดตาม {healthSummary.roomsWithIssues} แห่ง</Badge>}
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
                <div className="text-muted-foreground">เครื่องจักร {roomAssets.length} เครื่อง · ตู้ไฟ/ตู้ควบคุม {(roomCfg.cabinets||[]).length} ตู้ · พอร์ต/จุด {(roomCfg.ports||[]).length} จุด</div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card id="room-ports-card" className={`lg:col-span-2 ${focusPort && effectiveRoomId && focusPort.roomId===effectiveRoomId && focusPort.source==="room" ? "ring-2 ring-primary border-primary" : ""}`}>
          <CardHeader className="flex flex-row items-center justify-between"><CardTitle className="text-base flex items-center gap-2"><Cable className="w-4 h-4"/>ทะเบียนพอร์ต/จุดเชื่อมต่อของห้อง (ทุกรูปแบบ)</CardTitle>
            {canManage && effectiveRoomId && <Button size="sm" variant="outline" onClick={()=> updateRoomPorts(effectiveRoomId, [...(roomCfg.ports||[]), newPort()])}><Plus className="w-4 h-4"/>เพิ่มพอร์ต</Button>}
          </CardHeader>
          <CardContent className="space-y-3">
            {!effectiveRoomId ? <p className="text-sm text-muted-foreground">เลือกห้องเพื่อจัดการพอร์ตและจุดเชื่อมต่อ</p> : (
              <>
                <p className="text-xs text-muted-foreground">รองรับทุกรูปแบบ (LAN/ไฟฟ้า/เบรกเกอร์/I-O/Sensor/ลม/น้ำ/Utility ฯลฯ) — ใส่ข้อมูลภายหลังได้ ระบุสเปก/แรงดัน/ขนาดในช่อง “สเปก” หรือ “หมายเหตุ”</p>
                {(roomCfg.ports||[]).length === 0 ? <p className="text-sm text-muted-foreground">ยังไม่มีพอร์ตในห้องนี้ — กด “เพิ่มพอร์ต” เพื่อบันทึกจุดเชื่อมต่อ</p> : (
                  <div className="space-y-2">
                    {(roomCfg.ports||[]).map((p, idx) => {
                      const selfKey = portRefKey({ scope: "room", room_id: effectiveRoomId, port_id: p.id });
                      const feeds = p.feeds || [];
                      const isBad = p.status === "faulty" || p.status === "inactive";
                      const isAffected = impactInfo.affected.has(selfKey) && !impactInfo.badSources.has(selfKey);
                      return (
                      <div key={p.id} className={`rounded-lg border p-2 space-y-2 ${impactInfo.badSources.has(selfKey) ? "border-red-300 bg-red-50/40" : isAffected ? "border-amber-300 bg-amber-50/40" : ""}`}>
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
                          <div className="md:col-span-2"><Label className="text-xs">ชื่อ/Label</Label><Input value={p.label} onChange={e=>{ const np=[...roomCfg.ports]; np[idx]={...p,label:e.target.value}; updateRoomPorts(effectiveRoomId,np); }} placeholder="LAN-01, CB-01" /></div>
                          <div className="md:col-span-2"><Label className="text-xs">ประเภท</Label>
                            <select className="w-full h-10 rounded-md border bg-background px-2 text-sm" value={p.port_type} onChange={e=>{ const np=[...roomCfg.ports]; np[idx]={...p,port_type:e.target.value}; updateRoomPorts(effectiveRoomId,np); }}>
                              {PORT_TYPES.map(t=> <option key={t.value} value={t.value}>{t.label}</option>)}
                            </select>
                          </div>
                          <div className="md:col-span-2"><Label className="text-xs">Port/ช่อง/วงจร</Label><Input value={p.port_no} onChange={e=>{ const np=[...roomCfg.ports]; np[idx]={...p,port_no:e.target.value}; updateRoomPorts(effectiveRoomId,np); }} placeholder="SW1-P24, DB1-12" /></div>
                          <div className="md:col-span-2"><Label className="text-xs">สเปก (V/A/ชนิด)</Label><Input value={p.spec || ""} onChange={e=>{ const np=[...roomCfg.ports]; np[idx]={...p,spec:e.target.value}; updateRoomPorts(effectiveRoomId,np); }} placeholder="220V 16A, Cat6" /></div>
                          <div className="md:col-span-2"><Label className="text-xs">ปลายทาง (ข้อความ)</Label><Input value={p.endpoint} onChange={e=>{ const np=[...roomCfg.ports]; np[idx]={...p,endpoint:e.target.value}; updateRoomPorts(effectiveRoomId,np); }} placeholder="เครื่อง/ตู้ไฟ/อุปกรณ์" /></div>
                          <div className="md:col-span-1"><Label className="text-xs">สถานะ</Label>
                            <select className="w-full h-10 rounded-md border bg-background px-2 text-sm" value={p.status} onChange={e=>{ const np=[...roomCfg.ports]; np[idx]={...p,status:e.target.value}; updateRoomPorts(effectiveRoomId,np); }}>
                              {PORT_STATUS.map(s=> <option key={s.value} value={s.value}>{s.label}</option>)}
                            </select>
                          </div>
                          <div className="md:col-span-1 flex justify-end">{canManage && <Button variant="ghost" size="sm" onClick={()=> updateRoomPorts(effectiveRoomId, roomCfg.ports.filter((_,i)=>i!==idx))}><Trash2 className="w-4 h-4 text-red-500"/></Button>}</div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          {impactInfo.badSources.has(selfKey) && <AndonBadge tone="down">ต้นทางมีปัญหา/ตัดการจ่าย</AndonBadge>}
                          {isAffected && <AndonBadge tone="warn">ได้รับผลกระทบจาก {describePortRef(portIndex[impactInfo.causeOf[selfKey]]?.ref || {scope:"room",room_id:effectiveRoomId,port_id:""})}</AndonBadge>}
                          {(impactInfo.upstreamOf[selfKey]||[]).length > 0 && <span className="text-muted-foreground">รับจาก: {(impactInfo.upstreamOf[selfKey]||[]).map(k=>portIndex[k]?.label||k).join(", ")}</span>}
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">ความเชื่อมโยงปลายทาง (จ่ายไปยังพอร์ต/เครื่อง)</Label>
                          <div className="flex flex-wrap gap-1">
                            {feeds.length === 0 ? <span className="text-xs text-muted-foreground">ยังไม่กำหนดปลายทางโครงสร้าง</span> : feeds.map((ref, fi) => (
                              <span key={fi} className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs bg-background">
                                → {describePortRef(ref)}
                                {canManage && <button className="text-red-600 ml-1" onClick={()=>{ const nf=feeds.filter((_,i)=>i!==fi); const np=[...roomCfg.ports]; np[idx]={...p,feeds:nf}; updateRoomPorts(effectiveRoomId,np); }}>×</button>}
                              </span>
                            ))}
                          </div>
                          {canManage && (
                            <div className="flex items-center gap-2">
                              <select className="flex-1 h-9 rounded-md border bg-background px-2 text-xs" defaultValue="" onChange={e=>{
                                const key = e.target.value; if (!key) return;
                                const target = portIndex[key]; if (!target) return;
                                const ref = target.ref;
                                if (portRefKey(ref) === selfKey) { e.target.value = ""; return; }
                                if (feeds.some(f=>portRefKey(f)===portRefKey(ref))) { e.target.value = ""; return; }
                                const np=[...roomCfg.ports]; np[idx]={...p,feeds:[...feeds, ref]}; updateRoomPorts(effectiveRoomId,np);
                                e.target.value = "";
                              }}>
                                <option value="">+ เพิ่มปลายทาง (พอร์ต/จุด/เครื่อง)...</option>
                                {allPortOptions.filter(o=>portRefKey(o.ref)!==selfKey).map(o => (
                                  <option key={portRefKey(o.ref)} value={portRefKey(o.ref)}>{o.label}{o.port.port_no?` [${o.port.port_no}]`:""} — {o.context}</option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>
                      </div>
                    );})}
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
        <CardHeader className="flex flex-row items-center justify-between"><CardTitle className="text-base flex items-center gap-2"><Box className="w-4 h-4"/>ตู้ไฟ / ตู้ควบคุม / แผงวงจรในห้อง</CardTitle>
          {canManage && effectiveRoomId && <Button size="sm" variant="outline" onClick={()=> updateRoomCabinets(effectiveRoomId, [...(roomCfg.cabinets||[]), newCabinet()])}><Plus className="w-4 h-4"/>เพิ่มตู้/แผง</Button>}
        </CardHeader>
        <CardContent className="space-y-3">
          {!effectiveRoomId ? <p className="text-sm text-muted-foreground">เลือกห้องเพื่อจัดการตู้ไฟและตู้ควบคุม</p> : (
            <>
              <p className="text-xs text-muted-foreground">เพิ่มตู้ MDB/DB/MCC/ตู้คอนโทรล/Network rack ฯลฯ และบันทึกพอร์ต/เบรกเกอร์/เทอร์มินัลภายในตู้ (ข้อมูลใส่ทีหลังได้)</p>
              {(() => {
                const allCabs = roomCfg.cabinets || [];
                const visibleCabEntries = allCabs.map((cab, cidx) => ({ cab, cidx })).filter(({ cab }) => cabinetMatchesHealthFocus(cab));
                if (allCabs.length === 0) return <p className="text-sm text-muted-foreground">ยังไม่มีตู้ในห้องนี้ — กด “เพิ่มตู้/แผง”</p>;
                if (visibleCabEntries.length === 0) return <p className="text-sm text-muted-foreground">ไม่พบตู้/แผงที่ตรงกับตัวกรองสุขภาพที่เลือกในห้องนี้</p>;
                return (
                <div className="space-y-3">
                  {visibleCabEntries.map(({ cab, cidx }) => (
                    <div key={cab.id} id={`cabinet-card-${cab.id}`} className={`rounded-lg border p-3 space-y-2 ${focusPort?.source==="cabinet" && focusPort?.cabinetId===cab.id ? "ring-2 ring-primary border-primary bg-primary/5" : ""}`}>
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
                        <div className="md:col-span-3"><Label className="text-xs">ชื่อตู้/แผง</Label><Input value={cab.name} onChange={e=>{ const nc=[...roomCfg.cabinets]; nc[cidx]={...cab,name:e.target.value}; updateRoomCabinets(effectiveRoomId,nc); }} placeholder="เช่น MDB-1, DB-F1, PLC Panel" /></div>
                        <div className="md:col-span-2"><Label className="text-xs">รหัส/Code</Label><Input value={cab.code} onChange={e=>{ const nc=[...roomCfg.cabinets]; nc[cidx]={...cab,code:e.target.value}; updateRoomCabinets(effectiveRoomId,nc); }} placeholder="รหัสตู้" /></div>
                        <div className="md:col-span-2"><Label className="text-xs">ประเภทตู้</Label>
                          <select className="w-full h-10 rounded-md border bg-background px-2 text-sm" value={cab.cabinet_type} onChange={e=>{ const nc=[...roomCfg.cabinets]; nc[cidx]={...cab,cabinet_type:e.target.value}; updateRoomCabinets(effectiveRoomId,nc); }}>
                            {CABINET_TYPES.map(t=> <option key={t.value} value={t.value}>{t.label}</option>)}
                          </select>
                        </div>
                        <div className="md:col-span-3"><Label className="text-xs">ตำแหน่ง/จุดติดตั้ง</Label><Input value={cab.location_note} onChange={e=>{ const nc=[...roomCfg.cabinets]; nc[cidx]={...cab,location_note:e.target.value}; updateRoomCabinets(effectiveRoomId,nc); }} placeholder="ผนังด้านเหนือ, ใต้บันได" /></div>
                        <div className="md:col-span-1"><Label className="text-xs">สถานะ</Label>
                          <select className="w-full h-10 rounded-md border bg-background px-2 text-sm" value={cab.status} onChange={e=>{ const nc=[...roomCfg.cabinets]; nc[cidx]={...cab,status:e.target.value}; updateRoomCabinets(effectiveRoomId,nc); }}>
                            {PORT_STATUS.filter(s=>s.value!=="spare"&&s.value!=="reserved").map(s=> <option key={s.value} value={s.value}>{s.label}</option>)}
                          </select>
                        </div>
                        <div className="md:col-span-1 flex justify-end">{canManage && <Button variant="ghost" size="sm" onClick={()=> updateRoomCabinets(effectiveRoomId, roomCfg.cabinets.filter((_,i)=>i!==cidx))}><Trash2 className="w-4 h-4 text-red-500"/></Button>}</div>
                      </div>
                      <div><Label className="text-xs">หมายเหตุ/รายละเอียดตู้</Label><Input value={cab.notes||""} onChange={e=>{ const nc=[...roomCfg.cabinets]; nc[cidx]={...cab,notes:e.target.value}; updateRoomCabinets(effectiveRoomId,nc); }} placeholder="โหลดรวม, ระบบจ่ายไฟ, ผู้รับผิดชอบ" /></div>
                      <details className="text-xs rounded border bg-muted/20 p-2">
                        <summary className="cursor-pointer font-medium">พอร์ต/เบรกเกอร์/วงจรในตู้ ({(cab.ports||[]).length} จุด)</summary>
                        <CabinetPortEditor roomId={effectiveRoomId} cabinetIndex={cidx} config={config} setConfig={setConfig} portIndex={portIndex} impactInfo={impactInfo} describePortRef={describePortRef} allPortOptions={allPortOptions} canManage={canManage} />
                      </details>
                    </div>
                  ))}
                </div>
                );
              })()}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Map className="w-4 h-4"/>แปลนจริงของห้อง/ชั้น และหมุดตำแหน่ง</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {!effectiveRoomId ? <p className="text-sm text-muted-foreground">เลือกห้องเพื่อแนบแปลนจริงและวางตำแหน่งตู้/เครื่อง</p> : (
            <>
              <p className="text-xs text-muted-foreground">แนบ URL รูปแปลนจริงของห้อง แล้ววางหมุดตู้ไฟ/ตู้ควบคุมหรือเครื่องจักรบนรูป (เก็บพิกัดใน <code>facility_layout_config</code>) — คลิกหมุดเพื่อดูรายละเอียด พอร์ต/สถานะ/งานซ่อม จากตำแหน่งบนแปลน</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
                <div className="md:col-span-2">
                  <Label className="text-xs">URL รูปแปลนจริง (ห้อง/ชั้น)</Label>
                  <Input value={roomCfg.floor_plan?.image_url || ""} onChange={e=> updateRoom(effectiveRoomId, { floor_plan: { ...roomCfg.floor_plan, image_url: e.target.value } as any })} placeholder="https://.../floorplan.jpg หรือ path รูปที่เข้าถึงได้" />
                </div>
                <div className="flex gap-2">
                  {roomCfg.floor_plan?.image_url ? <Button size="sm" variant="outline" onClick={()=> { updateRoom(effectiveRoomId, { floor_plan: { ...roomCfg.floor_plan, image_url: "" } as any }); setSelectedPlanItemId(null); }}>ลบรูป</Button> : null}
                  {(roomCfg.floor_plan?.items||[]).length > 0 && canManage ? <Button size="sm" variant="outline" onClick={()=> { updateRoom(effectiveRoomId, { floor_plan: { ...roomCfg.floor_plan, items: [] } as any }); setSelectedPlanItemId(null); }}>ล้างหมุดทั้งหมด</Button> : null}
                </div>
              </div>
              {canManage && (
                <div className="flex flex-wrap gap-2 items-center">
                  <Label className="text-xs">วางหมุด:</Label>
                  <select className="h-9 rounded-md border bg-background px-2 text-xs min-w-[220px]" value={planPlaceTarget ? `${planPlaceTarget.type}:${planPlaceTarget.ref_id}` : ""} onChange={e=>{
                    const v = e.target.value;
                    if (!v) { setPlanPlaceTarget(null); return; }
                    const [type, ref_id] = v.split(":");
                    if (type === "cabinet" || type === "asset") setPlanPlaceTarget({ type, ref_id });
                  }}>
                    <option value="">-- เลือกตู้/เครื่องเพื่อวางหมุด --</option>
                    <optgroup label="ตู้ไฟ/ตู้ควบคุมในห้อง">
                      {(roomCfg.cabinets||[]).map(c => <option key={c.id} value={`cabinet:${c.id}`}>{c.name || c.code || c.id}</option>)}
                    </optgroup>
                    <optgroup label="เครื่องจักรในห้อง">
                      {roomAssets.map(a => <option key={a.id} value={`asset:${a.id}`}>{a.code} · {a.name}</option>)}
                    </optgroup>
                  </select>
                  {planPlaceTarget && <Badge variant="info">โหมดวางหมุด: คลิกบนรูปเพื่อวางตำแหน่ง</Badge>}
                  {planPlaceTarget && <Button size="sm" variant="ghost" onClick={()=>setPlanPlaceTarget(null)}>ยกเลิก</Button>}
                </div>
              )}
              {roomCfg.floor_plan?.image_url ? (
                <div className="space-y-2">
                  <div
                    ref={planContainerRef}
                    className={`relative w-full overflow-hidden rounded-lg border bg-slate-100 ${planPlaceTarget ? "cursor-crosshair" : "cursor-default"}`}
                    style={{ minHeight: 320 }}
                    onClick={(e)=>{
                      if (suppressPlanClickRef.current) { suppressPlanClickRef.current = false; return; }
                      if (!canManage || !planPlaceTarget || !effectiveRoomId) return;
                      const targetExists = planPlaceTarget.type === "cabinet"
                        ? (roomCfg.cabinets || []).some(c => String(c.id) === String(planPlaceTarget.ref_id))
                        : roomAssets.some(a => String(a.id) === String(planPlaceTarget.ref_id));
                      if (!targetExists) { setPlanPlaceTarget(null); return; }
                      const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                      if (rect.width <= 0 || rect.height <= 0) return;
                      const x = ((e.clientX - rect.left) / rect.width) * 100;
                      const y = ((e.clientY - rect.top) / rect.height) * 100;
                      if (x < 0 || x > 100 || y < 0 || y > 100) return;
                      const items = [...(roomCfg.floor_plan?.items || [])];
                      const existingIdx = items.findIndex(it => it.type === planPlaceTarget.type && String(it.ref_id) === String(planPlaceTarget.ref_id));
                      const px = Math.round(x * 1000) / 1000;
                      const py = Math.round(y * 1000) / 1000;
                      const newItem: FloorPlanItem = existingIdx >= 0
                        ? { ...items[existingIdx], x: px, y: py }
                        : { id: `m_${Date.now()}_${Math.random().toString(36).slice(2,6)}`, type: planPlaceTarget.type, ref_id: planPlaceTarget.ref_id, x: px, y: py };
                      if (existingIdx >= 0) items[existingIdx] = newItem; else items.push(newItem);
                      updateRoom(effectiveRoomId, { floor_plan: { ...roomCfg.floor_plan, items } as any });
                      setSelectedPlanItemId(newItem.id);
                      setPlanPlaceTarget(null);
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={roomCfg.floor_plan.image_url} alt="Floor plan" className="w-full h-auto block select-none pointer-events-none" />
                    {(roomCfg.floor_plan?.items || []).map((it) => {
                      const isCab = it.type === "cabinet";
                      const cab = isCab ? (roomCfg.cabinets||[]).find(c => String(c.id) === String(it.ref_id)) : null;
                      const ast = !isCab ? assets.find(a => String(a.id) === String(it.ref_id)) : null;
                      const label = isCab ? (cab?.name || cab?.code || "ตู้") : (ast ? `${ast.code}` : "เครื่อง");
                      const cabBad = isCab && cab && ["faulty","inactive","maintenance"].includes(cab.status);
                      const cabFaultyPorts = isCab && cab ? (cab.ports||[]).filter(p=>p.status==='faulty').length : 0;
                      const ar = !isCab && ast ? (assetHealth[ast.id]?.active_repairs || 0) : 0;
                      const bad = cabBad || cabFaultyPorts>0 || ar>0;
                      const planned = isCab && cab ? (cab.ports||[]).some(p=>p.status==='planned') : false;
                      const color = bad ? "bg-red-600 border-red-800" : planned ? "bg-amber-500 border-amber-700" : isCab ? "bg-indigo-600 border-indigo-800" : "bg-emerald-600 border-emerald-800";
                      const selected = selectedPlanItemId === it.id;
                      const pos = dragOverride && dragOverride.id === it.id ? { x: dragOverride.x, y: dragOverride.y } : { x: it.x, y: it.y };
                      const dragging = dragOverride?.id === it.id;
                      const cursorCls = canManage ? (dragging ? "cursor-grabbing" : "cursor-grab") : "cursor-pointer";
                      return (
                        <button
                          key={it.id}
                          type="button"
                          className={`absolute -translate-x-1/2 -translate-y-full flex flex-col items-center group touch-none ${cursorCls} ${selected ? "z-20" : "z-10"}`}
                          style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                          title={canManage ? `${label} — ลากเพื่อย้ายตำแหน่ง` : label}
                          onPointerDown={(ev) => {
                            ev.stopPropagation();
                            if (!canManage || !effectiveRoomId) { setSelectedPlanItemId(it.id); return; }
                            if (ev.button !== 0) return;
                            const rect = planContainerRef.current?.getBoundingClientRect();
                            if (!rect || rect.width <= 0 || rect.height <= 0) return;
                            try { (ev.currentTarget as HTMLButtonElement).setPointerCapture(ev.pointerId); } catch { /* ignore */ }
                            dragStateRef.current = { id: it.id, pointerId: ev.pointerId, startClientX: ev.clientX, startClientY: ev.clientY, origX: it.x, origY: it.y, moved: false };
                            setDragOverride({ id: it.id, x: it.x, y: it.y });
                          }}
                          onPointerMove={(ev) => {
                            const ds = dragStateRef.current;
                            if (!ds || ds.id !== it.id || ds.pointerId !== ev.pointerId) return;
                            const rect = planContainerRef.current?.getBoundingClientRect();
                            if (!rect || rect.width <= 0 || rect.height <= 0) return;
                            const dxPx = ev.clientX - ds.startClientX;
                            const dyPx = ev.clientY - ds.startClientY;
                            if (!ds.moved && Math.hypot(dxPx, dyPx) > 4) ds.moved = true;
                            const nx = Math.min(100, Math.max(0, ds.origX + (dxPx / rect.width) * 100));
                            const ny = Math.min(100, Math.max(0, ds.origY + (dyPx / rect.height) * 100));
                            setDragOverride({ id: it.id, x: Math.round(nx * 1000) / 1000, y: Math.round(ny * 1000) / 1000 });
                          }}
                          onPointerUp={(ev) => {
                            const ds = dragStateRef.current;
                            if (!ds || ds.id !== it.id || ds.pointerId !== ev.pointerId) return;
                            try { (ev.currentTarget as HTMLButtonElement).releasePointerCapture(ev.pointerId); } catch { /* ignore */ }
                            dragStateRef.current = null;
                            const finalPos = dragOverride && dragOverride.id === it.id ? { x: dragOverride.x, y: dragOverride.y } : { x: it.x, y: it.y };
                            setDragOverride(null);
                            if (ds.moved) {
                              suppressPlanClickRef.current = true;
                              if (effectiveRoomId) {
                                const items = (roomCfg.floor_plan?.items || []).map(p => p.id === it.id ? { ...p, x: finalPos.x, y: finalPos.y } : p);
                                updateRoom(effectiveRoomId, { floor_plan: { ...roomCfg.floor_plan, items } as any });
                              }
                              setSelectedPlanItemId(it.id);
                            } else {
                              setSelectedPlanItemId(it.id);
                            }
                          }}
                          onPointerCancel={(ev) => {
                            const ds = dragStateRef.current;
                            if (!ds || ds.id !== it.id) return;
                            try { (ev.currentTarget as HTMLButtonElement).releasePointerCapture(ev.pointerId); } catch { /* ignore */ }
                            dragStateRef.current = null;
                            setDragOverride(null);
                          }}
                          onClick={(ev) => { ev.stopPropagation(); }}
                        >
                          <span className={`px-1.5 py-0.5 rounded text-[10px] text-white whitespace-nowrap shadow ${color} ${selected?"ring-2 ring-white":""}`}>{isCab?"ตู้":"เครื่อง"}: {label}{bad?" !":""}</span>
                          <span className={`w-0 h-0 border-l-[6px] border-r-[6px] border-t-[8px] border-l-transparent border-r-transparent ${bad?"border-t-red-700":planned?"border-t-amber-700":isCab?"border-t-indigo-800":"border-t-emerald-800"}`}></span>
                        </button>
                      );
                    })}
                  </div>
                  {selectedPlanItemId && (() => {
                    const it = (roomCfg.floor_plan?.items || []).find(i => i.id === selectedPlanItemId);
                    if (!it) return null;
                    const isCab = it.type === "cabinet";
                    const cab = isCab ? (roomCfg.cabinets||[]).find(c => String(c.id) === String(it.ref_id)) : null;
                    const ast = !isCab ? assets.find(a => String(a.id) === String(it.ref_id)) : null;
                    if (isCab && !cab) return <div className="text-xs text-muted-foreground">ไม่พบตู้ที่อ้างอิง (อาจถูกลบ) {canManage && <Button size="sm" variant="ghost" onClick={() => removePlanItem(it.id)}>ลบหมุด</Button>}</div>;
                    if (!isCab && !ast) return <div className="text-xs text-muted-foreground">ไม่พบเครื่องที่อ้างอิง (อาจถูกลบ/ย้ายห้อง) {canManage && <Button size="sm" variant="ghost" onClick={() => removePlanItem(it.id)}>ลบหมุด</Button>}</div>;
                    const ar = ast ? (assetHealth[ast.id]?.active_repairs || 0) : 0;
                    const faultyPorts = isCab && cab ? (cab.ports||[]).filter(p=>p.status==='faulty').length : 0;
                    return (
                      <div className="rounded-lg border p-3 space-y-2 bg-background">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="font-semibold flex items-center gap-2">{isCab ? <><Box className="w-4 h-4"/>ตู้/แผง: {cab?.name || cab?.code}</> : <><Cpu className="w-4 h-4"/>เครื่อง: {ast?.code} · {ast?.name}</>}</div>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={()=>{ if (isCab && cab) { setFocusPort({ key: `cabinet:${cab.id}`, roomId: effectiveRoomId, source: "cabinet", cabinetId: cab.id, label: cab.name||cab.code||"ตู้" }); setTimeout(()=>{ const el=document.getElementById(`cabinet-card-${cab.id}`); const d=el?.querySelector('details'); if(d)(d as HTMLDetailsElement).open=true; el?.scrollIntoView({behavior:'smooth',block:'center'}); },50); } else if (ast) { setFocusPort({ key: `asset:${ast.id}:*`, roomId: effectiveRoomId, source: "asset", assetId: ast.id, label: ast.code }); setTimeout(()=>{ const el=document.getElementById(`asset-card-${ast.id}`); const d=el?.querySelector('details'); if(d)(d as HTMLDetailsElement).open=true; el?.scrollIntoView({behavior:'smooth',block:'center'}); },50); } }}>ไปที่รายละเอียด/พอร์ต</Button>
                            {canManage && <Button size="sm" variant="ghost" className="text-red-600" onClick={() => removePlanItem(it.id)}>ลบหมุด</Button>}
                          </div>
                        </div>
                        {isCab && cab && (
                          <div className="text-sm space-y-1">
                            <div className="text-xs text-muted-foreground">{cab.cabinet_type} · {cab.location_note || "-"} · สถานะ: {cab.status}</div>
                            <div className="flex flex-wrap gap-1">{faultyPorts>0 && <AndonBadge tone="down">พอร์ตชำรุด {faultyPorts}</AndonBadge>} {(cab.ports||[]).some(p=>p.status==='planned') && <Badge variant="info">มีพอร์ตวางแผน</Badge>} <Badge variant="neutral">พอร์ต/วงจร {(cab.ports||[]).length}</Badge></div>
                            {(cab.ports||[]).length > 0 && <div className="text-xs text-muted-foreground">ตัวอย่างพอร์ต: {(cab.ports||[]).slice(0,4).map(p=>`${p.label}${p.port_no?` #${p.port_no}`:''}`).join(', ')}{(cab.ports||[]).length>4?' …':''}</div>}
                          </div>
                        )}
                        {!isCab && ast && (
                          <div className="text-sm space-y-1">
                            <div className="text-xs text-muted-foreground">สถานะเครื่อง: {ast.status || '-'}{ast.location_name ? ` · ${ast.location_name}` : ''}</div>
                            <div className="flex flex-wrap gap-1 items-center">
                              {ar>0 ? <AndonBadge tone={String(assetHealth[ast.id]?.max_priority||'').toLowerCase()==='critical'?'down':'warn'}>ใบแจ้งซ่อมเปิด/กำลังดำเนินการ {ar}</AndonBadge> : <Badge variant="neutral">ไม่มีงานซ่อมเปิด</Badge>}
                              <Badge variant="neutral">พอร์ตเครื่อง {(config.assets[String(ast.id)]?.ports||[]).length}</Badge>
                              {ar>0 && (
                                <Link href={`/repair?q=${encodeURIComponent(ast.code || ast.name || String(ast.id))}`} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline" title="เปิดรายการใบแจ้งซ่อมที่เกี่ยวข้องกับเครื่องนี้">
                                  <Wrench className="w-3 h-3" aria-hidden="true" />ดูใบแจ้งซ่อม
                                </Link>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  <div className="text-xs text-muted-foreground">หมุดทั้งหมด {(roomCfg.floor_plan?.items||[]).length} จุด — สีแดง: มีปัญหา/งานซ่อมเปิด, เหลือง: มีรายการวางแผน, น้ำเงิน: ตู้, เขียว: เครื่อง {canManage?"(เลือกตู้/เครื่องแล้วคลิกบนรูปเพื่อวางหมุดใหม่, ลากหมุดที่มีอยู่เพื่อย้ายตำแหน่ง)":"(โหมดดูอย่างเดียว)"}</div>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">ยังไม่มีรูปแปลนจริง — ใส่ URL รูปแปลนของห้อง/ชั้นด้านบนเพื่อเริ่มวางหมุดตำแหน่งตู้และเครื่องจักร</div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Cpu className="w-4 h-4"/>เครื่องจักรในห้องที่เลือก</CardTitle></CardHeader>
        <CardContent>
          {!effectiveRoomId ? <p className="text-sm text-muted-foreground">เลือกห้องเพื่อดูเครื่องจักรที่ผูกกับตำแหน่งนี้</p> : (() => {
            if (roomAssets.length === 0) return <p className="text-sm text-muted-foreground">ยังไม่มีเครื่องจักรผูกกับห้องนี้ — กำหนด location ของ asset ให้ชี้มาที่ห้องนี้ (ผ่านทะเบียนเครื่องจักร/asset) เพื่อให้ปรากฏในผัง</p>;
            const visibleRoomAssets = roomAssets.filter(a => assetMatchesHealthFocus(a.id));
            if (visibleRoomAssets.length === 0) return <p className="text-sm text-muted-foreground">ไม่พบเครื่องจักรที่ตรงกับตัวกรองสุขภาพที่เลือกในห้องนี้</p>;
            return (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {visibleRoomAssets.map(a => {
                const ah = assetHealth[a.id];
                const activeRepairs = ah ? Number(ah.active_repairs || 0) : 0;
                const maxP = String(ah?.max_priority || "").toLowerCase();
                const repairTone = activeRepairs > 0 ? (maxP === "critical" || maxP === "high" ? "down" : "warn") : null;
                return (
                <div key={a.id} id={`asset-card-${a.id}`} className={`rounded-lg border p-3 space-y-1 ${focusPort?.source==="asset" && focusPort?.assetId===a.id ? "ring-2 ring-primary border-primary bg-primary/5" : activeRepairs > 0 ? "border-amber-300 bg-amber-50/30" : ""}`}>
                  <div className="flex items-center justify-between gap-2"><span className="font-mono text-xs font-bold">{a.code}</span><Badge variant="neutral">{a.status || "-"}</Badge></div>
                  <div className="font-semibold text-sm">{a.name}</div>
                  {activeRepairs > 0 && (
                    <div className="flex flex-wrap gap-1 items-center">
                      <AndonBadge tone={repairTone === "down" ? "down" : "warn"}>ใบแจ้งซ่อมเปิด/กำลังดำเนินการ {activeRepairs}</AndonBadge>
                      {ah?.max_priority ? <Badge variant="neutral">Priority: {String(ah.max_priority)}</Badge> : null}
                      <Link href={`/repair?q=${encodeURIComponent(a.code || a.name || String(a.id))}`} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline" title="เปิดรายการใบแจ้งซ่อมที่เกี่ยวข้องกับเครื่องนี้">
                        <Wrench className="w-3 h-3" aria-hidden="true" />ดูใบแจ้งซ่อม
                      </Link>
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground flex items-center gap-1"><Network className="w-3 h-3"/>พอร์ตเครื่อง: {(config.assets[String(a.id)]?.ports||[]).length} จุด</div>
                  {canManage && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-primary">จัดการพอร์ตเครื่อง</summary>
                      <AssetPortEditor assetId={a.id} config={config} setConfig={setConfig} portIndex={portIndex} impactInfo={impactInfo} describePortRef={describePortRef} allPortOptions={allPortOptions} canManage={canManage} />
                    </details>
                  )}
                </div>
              );})}
            </div>
            );
          })()}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Search className="w-4 h-4"/>ค้นหา/กรองทะเบียนพอร์ต</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">ค้นหาและกรองพอร์ต/จุดเชื่อมต่อทั้งหมดจากข้อมูล config เดิม — ค้นหาได้จากเลขเบรกเกอร์/ช่อง-เทอร์มินัล, ชื่อพอร์ต, สเปก, ปลายทาง, หมายเหตุ รวมถึงห้อง/ตู้/เครื่อง แล้วกด “ไปที่ตำแหน่ง” เพื่อกระโดดไปยัง อาคาร/ชั้น/ห้อง/ตู้/เครื่อง ที่เกี่ยวข้องพร้อมไฮไลต์บริบท</p>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <div className="md:col-span-2">
              <Label className="text-xs">ค้นหา (ชื่อ/เลขพอร์ต/ปลายทาง/สเปก/ห้อง/ตู้)</Label>
              <Input value={portSearch} onChange={e=>setPortSearch(e.target.value)} placeholder="เช่น เลขเบรกเกอร์ DB1-12, ชื่อพอร์ต, ช่อง/เทอร์มินัล, สเปก 220V/Cat6, ปลายทาง/เครื่อง..." />
            </div>
            <div>
              <Label className="text-xs">ประเภทพอร์ต</Label>
              <select className="w-full h-10 rounded-md border bg-background px-2 text-sm" value={portTypeFilter} onChange={e=>setPortTypeFilter(e.target.value)}>
                <option value="all">ทุกประเภท</option>
                {PORT_TYPES.map(t=> <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs">สถานะ</Label>
              <select className="w-full h-10 rounded-md border bg-background px-2 text-sm" value={portStatusFilter} onChange={e=>setPortStatusFilter(e.target.value)}>
                <option value="all">ทุกสถานะ</option>
                {PORT_STATUS.map(s=> <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <div className="text-muted-foreground">พบ {filteredPorts.length} รายการ จากทั้งหมด {flatPorts.length} จุด</div>
            <div className="flex items-center gap-2">
              {(portSearch || portTypeFilter!=="all" || portStatusFilter!=="all") && (
                <Button size="sm" variant="ghost" onClick={()=>{ setPortSearch(""); setPortTypeFilter("all"); setPortStatusFilter("all"); }}>ล้างตัวกรอง</Button>
              )}
              {focusPort && <Button size="sm" variant="ghost" onClick={()=>setFocusPort(null)}>ล้างการไฮไลต์ตำแหน่ง</Button>}
            </div>
          </div>
          {focusPort && (
            <div className="rounded-md border border-primary/40 bg-primary/5 p-2 text-sm flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="font-medium">กำลังแสดงตำแหน่ง:</span> {focusPort.label} · {focusPort.source==="cabinet"?"ตู้/แผง":focusPort.source==="asset"?"เครื่องจักร":"พอร์ตห้อง"} {focusPort.roomId ? `(ห้องที่เลือกแล้ว)` : ""}
              </div>
              <span className="text-xs text-muted-foreground">ระบบเลือก อาคาร/ชั้น/ห้อง ให้ตามผลการค้นหา และไฮไลต์ส่วนที่เกี่ยวข้อง</span>
            </div>
          )}
          {filteredPorts.length === 0 ? (
            <p className="text-sm text-muted-foreground">ไม่พบพอร์ตที่ตรงกับเงื่อนไข</p>
          ) : (
            <div className="space-y-2 max-h-[420px] overflow-auto pr-1">
              {filteredPorts.slice(0, 200).map(r => {
                const p = r.port;
                const typeLabel = PORT_TYPES.find(t=>t.value===p.port_type)?.label || p.port_type || "-";
                const statusLabel = PORT_STATUS.find(s=>s.value===p.status)?.label || p.status || "-";
                const statusCls = p.status==="faulty" ? "border-red-200 bg-red-50" : p.status==="spare" ? "border-emerald-200 bg-emerald-50/40" : p.status==="planned" ? "border-sky-200 bg-sky-50/40" : "";
                return (
                  <div key={r.key} className={`rounded-lg border p-2 text-sm ${statusCls}`}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="space-y-0.5">
                        <div className="font-semibold flex flex-wrap items-center gap-2">
                          <span>{p.label || "(ไม่ระบุชื่อ)"}</span>
                          {p.status === "faulty" ? <AndonBadge tone="down">{statusLabel}</AndonBadge>
                            : p.status === "active" ? <AndonBadge tone="ok">{statusLabel}</AndonBadge>
                            : p.status === "spare" ? <AndonBadge tone="idle">{statusLabel}</AndonBadge>
                            : p.status === "planned" ? <AndonBadge tone="warn">{statusLabel}</AndonBadge>
                            : <Badge variant="neutral">{statusLabel}</Badge>}
                          <Badge variant="neutral">{typeLabel}</Badge>
                          {p.port_no ? <span className="text-xs font-mono text-muted-foreground">#{p.port_no}</span> : null}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          <span className="font-medium text-foreground/80">{r.roomName}</span> · {r.sourceName}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          ปลายทาง: <span className="text-foreground/80">{p.endpoint || "-"}</span>
                          {p.spec ? <> · สเปก: <span className="text-foreground/80">{p.spec}</span></> : null}
                          {p.notes ? <> · หมายเหตุ: {p.notes}</> : null}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {(() => { const selfKey = r.key; const feeds = r.port?.feeds || []; const aff = impactInfo.affected.has(selfKey) && !impactInfo.badSources.has(selfKey); const bad = impactInfo.badSources.has(selfKey); return (<>
                          {bad && <AndonBadge tone="down">ต้นทางมีปัญหา/ตัดการจ่าย</AndonBadge>}
                          {aff && <AndonBadge tone="warn">ได้รับผลกระทบ</AndonBadge>}
                          {feeds.length > 0 && <Badge variant="info">จ่ายไป {feeds.length} ปลายทาง</Badge>}
                          {(impactInfo.upstreamOf[selfKey]||[]).length > 0 && <Badge variant="neutral">รับจาก {(impactInfo.upstreamOf[selfKey]||[]).length}</Badge>}
                        </>); })()}
                        {r.roomId ? (
                          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={()=> jumpToPort(r)}>
                            ไปที่ตำแหน่ง
                          </Button>
                        ) : <span className="text-xs text-muted-foreground">ไม่ระบุห้อง</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
              {filteredPorts.length > 200 && <p className="text-xs text-muted-foreground">แสดง 200 รายการแรก — ปรับตัวกรองให้แคบลงเพื่อดูรายการที่ต้องการ</p>}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="w-4 h-4"/>สรุปสถานะสุขภาพบนผัง (ห้อง/ตู้/เครื่อง)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-xs text-muted-foreground">ซ้อนทับสถานะจากข้อมูลที่มีอยู่: สถานะพอร์ต/ตู้ใน <code>facility_layout_config</code> (ชำรุด, วางแผน ฯลฯ) และข้อมูลใบแจ้งซ่อม/สถานะเครื่องจากระบบซ่อม (active repairs) ผูกกับตำแหน่ง/เครื่องจักร — แสดงบนผัง 2D/3D และสรุปรายห้อง/ตู้/เครื่อง</p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">โฟกัสจุดที่ต้องดูแล:</span>
            <Button size="sm" variant={healthFocus.includes("faulty") ? "primary" : "outline"} className="h-8 text-xs" onClick={() => toggleHealthFocus("faulty")}>พอร์ตชำรุด</Button>
            <Button size="sm" variant={healthFocus.includes("planned") ? "primary" : "outline"} className="h-8 text-xs" onClick={() => toggleHealthFocus("planned")}>พอร์ตวางแผน</Button>
            <Button size="sm" variant={healthFocus.includes("cabinet") ? "primary" : "outline"} className="h-8 text-xs" onClick={() => toggleHealthFocus("cabinet")}>ตู้มีปัญหา</Button>
            <Button size="sm" variant={healthFocus.includes("repair") ? "primary" : "outline"} className="h-8 text-xs" onClick={() => toggleHealthFocus("repair")}>ใบแจ้งซ่อมเปิด/กำลังดำเนินการ</Button>
            {healthFocusActive && <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setHealthFocus([])}>ล้างตัวกรอง</Button>}
            {healthFocusActive && <Badge variant="info">กำลังกรองมุมมองสุขภาพ</Badge>}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div className={`rounded border p-2 ${healthSummary.faultyPorts>0?"border-red-300 bg-red-50":""}`}><div className="text-xs text-muted-foreground">พอร์ต/จุดชำรุด</div><div className="text-xl font-semibold text-red-700">{healthSummary.faultyPorts}</div></div>
            <div className={`rounded border p-2 ${healthSummary.plannedPorts>0?"border-sky-300 bg-sky-50":""}`}><div className="text-xs text-muted-foreground">พอร์ต/จุดวางแผน</div><div className="text-xl font-semibold">{healthSummary.plannedPorts}</div></div>
            <div className={`rounded border p-2 ${healthSummary.issueCabinets>0?"border-red-300 bg-red-50":""}`}><div className="text-xs text-muted-foreground">ตู้/แผงมีปัญหา</div><div className="text-xl font-semibold">{healthSummary.issueCabinets}</div></div>
            <div className={`rounded border p-2 ${healthSummary.assetsWithActiveRepairs>0?"border-amber-300 bg-amber-50":""}`}><div className="text-xs text-muted-foreground">เครื่องมีใบแจ้งซ่อมเปิด/กำลังดำเนินการ</div><div className="text-xl font-semibold">{healthSummary.assetsWithActiveRepairs}</div><div className="text-[11px] text-muted-foreground">{healthSummary.activeRepairs} ใบงาน</div></div>
          </div>
          {(() => {
            const byId: Record<number, Location> = {}; locations.forEach(l => { byId[l.id] = l; });
            const roomRows = Object.entries(roomHealthMap).map(([ridStr, h]) => {
              const rid = Number(ridStr); const loc = byId[rid];
              const has = healthFocusActive ? roomMatchesHealthFocus(rid) : (h.faultyPorts>0 || h.plannedPorts>0 || h.issueCabinets>0 || h.assetsWithActiveRepairs>0);
              return { rid, name: loc ? `${loc.name}${loc.code?` (${loc.code})`:''}` : `ห้อง #${rid}`, has, ...h };
            }).filter(r => r.has).sort((a,b)=> (b.faultyPorts+b.assetsWithActiveRepairs*10) - (a.faultyPorts+a.assetsWithActiveRepairs*10));
            const repairAssets = assets.map(a => ({ a, ah: assetHealth[a.id], ar: assetHealth[a.id]?.active_repairs || 0 })).filter(x => {
              if (x.ar <= 0) return false;
              return !healthFocusActive || healthFocus.includes("repair");
            }).sort((x,y)=> (y.ar - x.ar));
            return (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div className="rounded border p-2 space-y-2">
                  <div className="font-medium">ห้อง/จุดที่ต้องติดตาม ({roomRows.length}){healthFocusActive ? " · ตามตัวกรอง" : ""}</div>
                  {roomRows.length === 0 ? <div className="text-xs text-muted-foreground">{healthFocusActive ? "ไม่พบห้องที่ตรงกับตัวกรองสุขภาพที่เลือก" : "ไม่พบห้องที่มีพอร์ตชำรุด/วางแผน ตู้มีปัญหา หรือเครื่องที่มีใบแจ้งซ่อมเปิด"}</div> : (
                    <div className="space-y-1 max-h-64 overflow-auto pr-1">
                      {roomRows.slice(0, 40).map(r => (
                        <div key={r.rid} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2">
                          <div className="min-w-0">
                            <div className="font-medium truncate">{r.name}</div>
                            <div className="text-[11px] text-muted-foreground flex flex-wrap gap-1 mt-0.5">
                              {r.faultyPorts>0 && <span className="text-red-700">พอร์ตชำรุด {r.faultyPorts}</span>}
                              {r.plannedPorts>0 && <span className="text-sky-700">วางแผน {r.plannedPorts}</span>}
                              {r.issueCabinets>0 && <span className="text-red-700">ตู้มีปัญหา {r.issueCabinets}</span>}
                              {r.assetsWithActiveRepairs>0 && <span className="text-amber-800">เครื่องเปิดซ่อม {r.assetsWithActiveRepairs} ({r.activeRepairs} ใบงาน)</span>}
                            </div>
                          </div>
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={()=> selectRoomById(r.rid)}>ไปที่ห้อง</Button>
                        </div>
                      ))}
                      {roomRows.length > 40 && <div className="text-xs text-muted-foreground">แสดง 40 รายการแรก</div>}
                    </div>
                  )}
                </div>
                <div className="rounded border p-2 space-y-2">
                  <div className="font-medium">เครื่องจักรที่มีใบแจ้งซ่อมเปิด/กำลังดำเนินการ ({repairAssets.length}){healthFocusActive && !healthFocus.includes("repair") ? " · ซ่อนตามตัวกรอง" : ""}</div>
                  {repairAssets.length === 0 ? <div className="text-xs text-muted-foreground">{healthFocusActive && !healthFocus.includes("repair") ? "เลือกตัวกรอง “ใบแจ้งซ่อมเปิด/กำลังดำเนินการ” เพื่อแสดงรายการเครื่องที่มีงานซ่อม" : "ไม่พบเครื่องที่มีใบแจ้งซ่อมเปิด/กำลังดำเนินการ (จากข้อมูลซ่อมที่มีอยู่)"}</div> : (
                    <div className="space-y-1 max-h-64 overflow-auto pr-1">
                      {repairAssets.slice(0, 40).map(({a, ah, ar}) => {
                        const loc = a.location_id ? byId[a.location_id] : null;
                        const mp = String(ah?.max_priority || "");
                        return (
                          <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2">
                            <div className="min-w-0">
                              <div className="font-medium truncate"><span className="font-mono text-xs mr-1">{a.code}</span>{a.name}</div>
                              <div className="text-[11px] text-muted-foreground flex flex-wrap gap-1 mt-0.5">
                                <AndonBadge tone={mp.toLowerCase()==='critical'||mp.toLowerCase()==='high' ? 'down' : 'warn'}>เปิด/กำลังดำเนินการ {ar}</AndonBadge>
                                {mp && <span>Priority: {mp}</span>}
                                {loc ? <span>· {loc.name}</span> : <span>· ไม่ระบุตำแหน่ง</span>}
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-1">
                              <Link href={`/repair?q=${encodeURIComponent(a.code || a.name || String(a.id))}`} className="inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs font-medium text-primary hover:bg-primary/5" title="เปิดรายการใบแจ้งซ่อมที่เกี่ยวข้องกับเครื่องนี้">
                                <Wrench className="w-3 h-3" aria-hidden="true" />ดูใบแจ้งซ่อม
                              </Link>
                              {a.location_id ? <Button size="sm" variant="outline" className="h-7 text-xs" onClick={()=> { selectRoomById(a.location_id as number); setFocusPort({ key: `asset:${a.id}:*`, roomId: a.location_id as number, source: "asset", assetId: a.id, label: a.code }); setTimeout(()=>{ const el=document.getElementById(`asset-card-${a.id}`); if(el) el.scrollIntoView({behavior:"smooth", block:"center"}); }, 80); }}>ไปที่เครื่อง</Button> : null}
                            </div>
                          </div>
                        );
                      })}
                      {repairAssets.length > 40 && <div className="text-xs text-muted-foreground">แสดง 40 รายการแรก</div>}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Network className="w-4 h-4"/>ความเชื่อมโยงต้นทาง-ปลายทาง และผลกระทบ</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-xs text-muted-foreground">บันทึกความเชื่อมโยงโครงสร้างใน <code>facility_layout_config</code> เดิม (ฟิลด์ <code>feeds</code> ของพอร์ต) เพื่อแสดงสายการจ่าย เช่น ตู้/เบรกเกอร์ → จุด/พอร์ต → เครื่อง และคำนวณผลกระทบเมื่อจุดต้นทางมีปัญหา/ถูกตัดการจ่าย (สถานะชำรุด/ไม่ใช้งาน หรือสถานะตู้มีปัญหา)</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div className="rounded border p-2"><div className="text-xs text-muted-foreground">ความเชื่อมโยงที่กำหนด</div><div className="text-xl font-semibold">{impactInfo.edges.length}</div></div>
            <div className={`rounded border p-2 ${impactInfo.badSources.size>0?"border-red-300 bg-red-50":""}`}><div className="text-xs text-muted-foreground">ต้นทางมีปัญหา/ตัดการจ่าย</div><div className="text-xl font-semibold text-red-700">{impactInfo.badSources.size}</div></div>
            <div className={`rounded border p-2 ${impactInfo.affected.size>impactInfo.badSources.size?"border-amber-300 bg-amber-50":""}`}><div className="text-xs text-muted-foreground">จุด/พอร์ตที่ได้รับผลกระทบ</div><div className="text-xl font-semibold">{impactInfo.affected.size}</div></div>
            <div className={`rounded border p-2 ${impactInfo.impactedAssets.size>0?"border-amber-300 bg-amber-50":""}`}><div className="text-xs text-muted-foreground">เครื่องจักรที่ได้รับผลกระทบ</div><div className="text-xl font-semibold">{impactInfo.impactedAssets.size}</div></div>
          </div>
          {impactInfo.badSources.size === 0 ? (
            <div className="text-xs text-muted-foreground">ไม่พบต้นทางที่มีสถานะชำรุด/ไม่ใช้งาน/ตู้มีปัญหาในขณะนี้ (หากกำหนดความเชื่อมโยงไว้ ระบบจะแสดงผลกระทบปลายทางอัตโนมัติเมื่อมีปัญหา)</div>
          ) : (
            <div className="space-y-2">
              <div className="font-medium">ต้นทางที่มีปัญหา/ตัดการจ่าย และผลกระทบปลายทาง</div>
              <div className="space-y-2 max-h-80 overflow-auto pr-1">
                {Array.from(impactInfo.badSources).slice(0, 60).map((sk) => {
                  const src = portIndex[sk]; if (!src) return null;
                  const downs = Object.entries(impactInfo.causeOf).filter(([,c]) => c === sk && sk !== ("" as string));
                  const downKeys = Object.keys(impactInfo.causeOf).filter(k => impactInfo.causeOf[k] === sk && k !== sk);
                  const downAssets = Array.from(new Set(downKeys.map(k=>portIndex[k]?.assetId).filter(Boolean))) as number[];
                  return (
                    <div key={sk} className="rounded border border-red-200 bg-red-50/30 p-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <AndonBadge tone="down">ต้นทาง</AndonBadge>
                        <span className="font-medium">{src.label}{src.port.port_no?` [${src.port.port_no}]`:""}</span>
                        <span className="text-xs text-muted-foreground">{src.context} · สถานะ: {src.status}</span>
                        {src.roomId ? <Button size="sm" variant="outline" className="h-7 text-xs" onClick={()=> jumpToPort({ key: sk, roomId: src.roomId, roomName: src.roomName, roomCode: "", sourceName: src.sourceName, cabinetCode: "", cabinetLocation: "", port: src.port, source: src.ref.scope as any, cabinetId: src.cabinetId, assetId: src.assetId })}>ไปที่ตำแหน่ง</Button> : null}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">ส่งผลกระทบไปยัง {downKeys.length} จุด/พอร์ต {downAssets.length>0 ? `· เครื่องที่เกี่ยวข้อง ${downAssets.length} เครื่อง` : ""}</div>
                      {downKeys.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {downKeys.slice(0, 12).map(dk => {
                            const d = portIndex[dk]; if (!d) return null;
                            return <span key={dk} className="inline-flex items-center rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[11px]">→ {d.label} ({d.sourceName}{d.assetId ? " · เครื่อง" : ""})</span>;
                          })}
                          {downKeys.length > 12 && <span className="text-[11px] text-muted-foreground">+{downKeys.length - 12} จุด</span>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {impactInfo.edges.length > 0 && (
            <details className="rounded border p-2">
              <summary className="cursor-pointer text-sm font-medium">รายการความเชื่อมโยงที่บันทึกไว้ ({impactInfo.edges.length} เส้นทาง)</summary>
              <div className="mt-2 space-y-1 max-h-64 overflow-auto pr-1">
                {impactInfo.edges.slice(0, 120).map((e: any, i: number) => {
                  const from = portIndex[e.from]; const to = portIndex[e.to];
                  if (!from || !to) return null;
                  const hit = impactInfo.affected.has(e.from) || impactInfo.affected.has(e.to);
                  return (
                    <div key={i} className={`text-xs rounded px-2 py-1 border ${hit?"border-amber-300 bg-amber-50/40":"border-transparent"}`}>
                      <span className="font-medium">{from.label}</span> <span className="text-muted-foreground">({from.context})</span> → <span className="font-medium">{to.label}</span> <span className="text-muted-foreground">({to.context})</span>
                      {hit && <span className="ml-2 text-amber-700">· อยู่ในเส้นทางผลกระทบ</span>}
                    </div>
                  );
                })}
                {impactInfo.edges.length > 120 && <div className="text-xs text-muted-foreground">แสดง 120 รายการแรก</div>}
              </div>
            </details>
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
            <Layout2D buildings={buildings} floors={floors} rooms={rooms} byParent={byParent} assets={assets} config={config} selectedBuilding={selectedBuilding} selectedFloor={selectedFloor} selectedRoom={effectiveRoomId} assetHealth={assetHealth} roomHealthMap={roomHealthMap} healthFocus={healthFocus} />
          ) : (
            <Layout3D buildings={buildings} floors={floors} rooms={rooms} byParent={byParent} assets={assets} config={config} selectedBuilding={selectedBuilding} selectedFloor={selectedFloor} assetHealth={assetHealth} roomHealthMap={roomHealthMap} healthFocus={healthFocus} />
          )}
          <p className="text-xs text-muted-foreground mt-3">หมายเหตุ: ผัง 2D/3D สร้างจากโครงสร้างอาคาร (locations), ตู้ไฟ/ตู้ควบคุม และพอร์ต/จุดเชื่อมต่อทุกรูปแบบที่บันทึกไว้ — ข้อมูลพอร์ต/ตู้ไฟสามารถใส่ทีหลังได้เสมอ และรองรับการแนบรูป floor plan จริง/ขยายเป็นผังตามพิกัดเมื่อมีแบบแปลน</p>
        </CardContent>
      </Card>
    </PageShell>
  );
}

function CabinetPortEditor({ roomId, cabinetIndex, config, setConfig, portIndex, impactInfo, describePortRef, allPortOptions, canManage }: { roomId: number; cabinetIndex: number; config: LayoutConfig; setConfig: (c: any)=>void; portIndex: any; impactInfo: any; describePortRef: (r: PortRef)=>string; allPortOptions: any[]; canManage: boolean }) {
  const rkey = String(roomId);
  const room = { ...defaultRoom(), ...(config.rooms[rkey] || {}) } as RoomCfg;
  const cabinets = [...(room.cabinets || [])];
  const cab = cabinets[cabinetIndex] || newCabinet();
  const ports: Port[] = cab.ports || [];
  const update = (np: Port[]) => {
    cabinets[cabinetIndex] = { ...cab, ports: np };
    setConfig((c: LayoutConfig) => ({ ...c, rooms: { ...c.rooms, [rkey]: { ...(defaultRoom()), ...(c.rooms[rkey] || {}), cabinets } } }));
  };
  return (
    <div className="mt-2 space-y-2 border-t pt-2">
      {ports.map((p, idx) => {
        const selfKey = portRefKey({ scope: "cabinet", room_id: roomId, cabinet_id: cab.id, port_id: p.id });
        const feeds = p.feeds || [];
        const isAffected = impactInfo?.affected?.has(selfKey) && !impactInfo?.badSources?.has(selfKey);
        return (
        <div key={p.id} className={`rounded border p-2 space-y-1 ${impactInfo?.badSources?.has(selfKey) ? "border-red-300 bg-red-50/40" : isAffected ? "border-amber-300 bg-amber-50/40" : ""}`}>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-1 items-end">
            <div className="md:col-span-2"><Input value={p.label} onChange={e=>{ const n=[...ports]; n[idx]={...p,label:e.target.value}; update(n); }} placeholder="Label/เบรกเกอร์/เทอร์มินัล" className="h-8 text-xs" /></div>
            <div className="md:col-span-2">
              <select className="w-full h-8 rounded-md border bg-background px-2 text-xs" value={p.port_type} onChange={e=>{ const n=[...ports]; n[idx]={...p,port_type:e.target.value}; update(n); }}>
                {PORT_TYPES.map(t=> <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="md:col-span-1"><Input value={p.port_no} onChange={e=>{ const n=[...ports]; n[idx]={...p,port_no:e.target.value}; update(n); }} placeholder="ช่อง/วงจร" className="h-8 text-xs" /></div>
            <div className="md:col-span-2"><Input value={p.spec || ""} onChange={e=>{ const n=[...ports]; n[idx]={...p,spec:e.target.value}; update(n); }} placeholder="สเปก (V/A)" className="h-8 text-xs" /></div>
            <div className="md:col-span-2"><Input value={p.endpoint} onChange={e=>{ const n=[...ports]; n[idx]={...p,endpoint:e.target.value}; update(n); }} placeholder="ปลายทาง (ข้อความ)" className="h-8 text-xs" /></div>
            <div className="md:col-span-2">
              <select className="w-full h-8 rounded-md border bg-background px-2 text-xs" value={p.status} onChange={e=>{ const n=[...ports]; n[idx]={...p,status:e.target.value}; update(n); }}>
                {PORT_STATUS.map(s=> <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div className="md:col-span-1 flex justify-end">{canManage && <Button variant="ghost" size="sm" className="h-8 px-2" onClick={()=>update(ports.filter((_,i)=>i!==idx))}><Trash2 className="w-3 h-3"/></Button>}</div>
          </div>
          <div className="flex flex-wrap items-center gap-1 text-[11px]">
            {impactInfo?.badSources?.has(selfKey) && <AndonBadge tone="down">ต้นทางมีปัญหา/ตัดการจ่าย</AndonBadge>}
            {isAffected && <AndonBadge tone="warn">ได้รับผลกระทบ</AndonBadge>}
            {(impactInfo?.upstreamOf?.[selfKey]||[]).length > 0 && <span className="text-muted-foreground">รับจาก: {(impactInfo.upstreamOf[selfKey]||[]).map((k:string)=>portIndex[k]?.label||k).join(", ")}</span>}
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap gap-1">
              {feeds.length === 0 ? <span className="text-[11px] text-muted-foreground">ยังไม่กำหนดปลายทางโครงสร้าง</span> : feeds.map((ref, fi) => (
                <span key={fi} className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] bg-background">→ {describePortRef(ref)}{canManage && <button className="text-red-600 ml-1" onClick={()=>{ const nf=feeds.filter((_,i)=>i!==fi); const n=[...ports]; n[idx]={...p,feeds:nf}; update(n); }}>×</button>}</span>
              ))}
            </div>
            {canManage && (
              <select className="w-full h-8 rounded-md border bg-background px-2 text-[11px]" defaultValue="" onChange={e=>{
                const v = e.target.value; if (!v) return; const target = portIndex[v]; if (!target) return; const ref = target.ref;
                if (portRefKey(ref) === selfKey || feeds.some(f=>portRefKey(f)===portRefKey(ref))) { e.target.value=""; return; }
                const n=[...ports]; n[idx]={...p,feeds:[...feeds, ref]}; update(n); e.target.value="";
              }}>
                <option value="">+ เพิ่มปลายทาง (จ่ายไปยังพอร์ต/จุด/เครื่อง)...</option>
                {(allPortOptions||[]).filter(o=>portRefKey(o.ref)!==selfKey).map(o => (
                  <option key={portRefKey(o.ref)} value={portRefKey(o.ref)}>{o.label}{o.port.port_no?` [${o.port.port_no}]`:""} — {o.context}</option>
                ))}
              </select>
            )}
          </div>
        </div>
      );})}
      {canManage && <Button size="sm" variant="outline" className="h-8 text-xs" onClick={()=>update([...ports, { ...newPort(), port_type: "electrical" }])}><Plus className="w-3 h-3 mr-1"/>เพิ่มพอร์ต/เบรกเกอร์</Button>}
    </div>
  );
}

function AssetPortEditor({ assetId, config, setConfig, portIndex, impactInfo, describePortRef, allPortOptions, canManage }: { assetId: number; config: LayoutConfig; setConfig: (c: any)=>void; portIndex: any; impactInfo: any; describePortRef: (r: PortRef)=>string; allPortOptions: any[]; canManage: boolean }) {
  const key = String(assetId);
  const entry = config.assets[key] || { ports: [], notes: "" };
  const ports: Port[] = (entry as any).ports || [];
  const roomId = ((Object.values(portIndex || {}) as any[]).find((v: any) => v?.assetId === assetId)?.roomId as number) || 0;
  const update = (np: Port[]) => setConfig((c: LayoutConfig) => ({ ...c, assets: { ...c.assets, [key]: { ...(c.assets[key]||{notes:""}), ports: np } } }));
  return (
    <div className="mt-2 space-y-2 border-t pt-2">
      {ports.map((p, idx) => {
        const selfKey = portRefKey({ scope: "asset", room_id: roomId, asset_id: assetId, port_id: p.id });
        const feeds = p.feeds || [];
        const isAffected = impactInfo?.affected?.has(selfKey) && !impactInfo?.badSources?.has(selfKey);
        return (
        <div key={p.id} className={`rounded border p-2 space-y-1 ${impactInfo?.badSources?.has(selfKey) ? "border-red-300 bg-red-50/40" : isAffected ? "border-amber-300 bg-amber-50/40" : ""}`}>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-1 items-end">
            <div className="md:col-span-3"><Input value={p.label} onChange={e=>{ const n=[...ports]; n[idx]={...p,label:e.target.value}; update(n); }} placeholder="Label/Port" className="h-8 text-xs" /></div>
            <div className="md:col-span-2"><Input value={p.port_no} onChange={e=>{ const n=[...ports]; n[idx]={...p,port_no:e.target.value}; update(n); }} placeholder="ช่อง/เทอร์มินัล" className="h-8 text-xs" /></div>
            <div className="md:col-span-2"><Input value={p.spec || ""} onChange={e=>{ const n=[...ports]; n[idx]={...p,spec:e.target.value}; update(n); }} placeholder="สเปก" className="h-8 text-xs" /></div>
            <div className="md:col-span-2"><Input value={p.endpoint} onChange={e=>{ const n=[...ports]; n[idx]={...p,endpoint:e.target.value}; update(n); }} placeholder="ปลายทาง (ข้อความ)" className="h-8 text-xs" /></div>
            <div className="md:col-span-2">
              <select className="w-full h-8 rounded-md border bg-background px-2 text-xs" value={p.status} onChange={e=>{ const n=[...ports]; n[idx]={...p,status:e.target.value}; update(n); }}>
                {PORT_STATUS.map(s=> <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div className="md:col-span-1 flex justify-end">{canManage && <Button variant="ghost" size="sm" className="h-8 px-2" onClick={()=>update(ports.filter((_,i)=>i!==idx))}><Trash2 className="w-3 h-3"/></Button>}</div>
          </div>
          <div className="flex flex-wrap items-center gap-1 text-[11px]">
            {impactInfo?.badSources?.has(selfKey) && <AndonBadge tone="down">ต้นทางมีปัญหา/ตัดการจ่าย</AndonBadge>}
            {isAffected && <AndonBadge tone="warn">ได้รับผลกระทบ</AndonBadge>}
            {(impactInfo?.upstreamOf?.[selfKey]||[]).length > 0 && <span className="text-muted-foreground">รับจาก: {(impactInfo.upstreamOf[selfKey]||[]).map((k:string)=>portIndex[k]?.label||k).join(", ")}</span>}
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap gap-1">
              {feeds.length === 0 ? <span className="text-[11px] text-muted-foreground">ยังไม่กำหนดปลายทางโครงสร้าง</span> : feeds.map((ref, fi) => (
                <span key={fi} className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] bg-background">→ {describePortRef(ref)}{canManage && <button className="text-red-600 ml-1" onClick={()=>{ const nf=feeds.filter((_,i)=>i!==fi); const n=[...ports]; n[idx]={...p,feeds:nf}; update(n); }}>×</button>}</span>
              ))}
            </div>
            {canManage && (
              <select className="w-full h-8 rounded-md border bg-background px-2 text-[11px]" defaultValue="" onChange={e=>{
                const v = e.target.value; if (!v) return; const target = portIndex[v]; if (!target) return; const ref = target.ref;
                if (portRefKey(ref) === selfKey || feeds.some(f=>portRefKey(f)===portRefKey(ref))) { e.target.value=""; return; }
                const n=[...ports]; n[idx]={...p,feeds:[...feeds, ref]}; update(n); e.target.value="";
              }}>
                <option value="">+ เพิ่มปลายทาง (จ่ายไปยังพอร์ต/จุด/เครื่อง)...</option>
                {(allPortOptions||[]).filter(o=>portRefKey(o.ref)!==selfKey).map(o => (
                  <option key={portRefKey(o.ref)} value={portRefKey(o.ref)}>{o.label}{o.port.port_no?` [${o.port.port_no}]`:""} — {o.context}</option>
                ))}
              </select>
            )}
          </div>
        </div>
      );})}
      {canManage && <Button size="sm" variant="outline" className="h-8 text-xs" onClick={()=>update([...ports, newPort()])}><Plus className="w-3 h-3 mr-1"/>เพิ่มพอร์ตเครื่อง</Button>}
    </div>
  );
}

function Layout2D({ buildings, floors, rooms, byParent, assets, config, selectedBuilding, selectedFloor, selectedRoom, assetHealth, roomHealthMap, healthFocus }: any) {
  const focusArr: string[] = Array.isArray(healthFocus) ? healthFocus : [];
  const focusActive = focusArr.length > 0;
  const roomMatches = (rid: number) => {
    if (!focusActive) return true;
    const h = (roomHealthMap || {})[rid] || { faultyPorts: 0, plannedPorts: 0, issueCabinets: 0, assetsWithActiveRepairs: 0 };
    return (focusArr.includes("faulty") && (h.faultyPorts || 0) > 0)
      || (focusArr.includes("planned") && (h.plannedPorts || 0) > 0)
      || (focusArr.includes("cabinet") && (h.issueCabinets || 0) > 0)
      || (focusArr.includes("repair") && (h.assetsWithActiveRepairs || 0) > 0);
  };
  const showBuildings = !selectedBuilding ? buildings : [];
  const showFloors = selectedBuilding && !selectedFloor ? floors : [];
  const baseRooms = selectedFloor ? rooms : (selectedBuilding && floors.length===0 ? (byParent[selectedBuilding]||[]) : []);
  const showRooms = (baseRooms || []).filter((r: Location) => roomMatches(r.id));
  return (
    <div className="space-y-4">
      {showBuildings.length > 0 && (
        <div>
          <div className="text-sm font-semibold mb-2 flex items-center gap-2"><Building2 className="w-4 h-4"/>อาคารทั้งหมด</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {showBuildings.map((b: Location) => {
              const childFloors = byParent[b.id] || [];
              let assetCount = 0; let portCount = 0;
              const walk = (id:number) => {
                assetCount += assets.filter((a:Asset)=>a.location_id===id).length;
                const ro: any = config.rooms[String(id)] || {};
                const cabs: any[] = ro.cabinets || [];
                portCount += (ro.ports||[]).length + cabs.reduce((s,c)=>s+((c?.ports||[]).length),0);
                (byParent[id]||[]).forEach((c: Location)=>walk(c.id));
              };
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
              rs.forEach((r: any) => {
                assetCount += assets.filter((a:Asset)=>a.location_id===r.id).length;
                const ro: any = config.rooms[String(r.id)] || {};
                const cabs: any[] = ro.cabinets || [];
                portCount += (ro.ports||[]).length + cabs.reduce((s,c)=>s+((c?.ports||[]).length),0);
              });
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
          <div className="text-sm font-semibold mb-2 flex items-center gap-2"><DoorOpen className="w-4 h-4"/>ผังห้อง (2D){focusActive ? <Badge variant="info" className="ml-1">กรองตามสุขภาพ</Badge> : null}</div>
          {showRooms.length === 0 ? <p className="text-sm text-muted-foreground">{focusActive ? "ไม่พบห้องที่ตรงกับตัวกรองสุขภาพที่เลือกในชั้น/บริบทนี้" : "ไม่มีห้องให้แสดง"}</p> : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {showRooms.map((r: Location) => {
              const ra = assets.filter((a:Asset)=>a.location_id===r.id);
              const roomObj = (config.rooms[String(r.id)] || {}) as any;
              const rp = (roomObj.ports||[]) as Port[];
              const cabs = (roomObj.cabinets||[]) as Cabinet[];
              const cabPorts = cabs.flatMap((c: any) => c?.ports || []);
              const allPorts = [...rp, ...cabPorts];
              const faulty = allPorts.filter(p=>p.status==='faulty').length;
              const planned = allPorts.filter(p=>p.status==='planned').length;
              const issueCabs = cabs.filter((c:any)=>['faulty','inactive','maintenance'].includes(c?.status)).length;
              const rh = (roomHealthMap || {})[r.id] || { assetsWithActiveRepairs: 0, activeRepairs: 0 };
              const assetsRepair = ra.filter((a:Asset)=> (assetHealth?.[a.id]?.active_repairs || 0) > 0).length;
              const hasIssue = faulty>0 || issueCabs>0 || assetsRepair>0;
              const hasWarn = !hasIssue && (planned>0);
              const active = selectedRoom === r.id;
              const borderCls = active ? "border-emerald-500 bg-emerald-50" : hasIssue ? "border-red-300 bg-red-50/40" : hasWarn ? "border-amber-300 bg-amber-50/30" : "border-slate-200 bg-white";
              return (
                <div key={r.id} className={`rounded-xl border-2 p-3 ${borderCls}`}>
                  <div className="font-semibold text-sm flex items-center justify-between gap-2"><span className="truncate">{r.name}</span>
                    <div className="flex flex-wrap gap-1 justify-end">
                      {faulty>0 && <Badge variant="danger">ชำรุด {faulty}</Badge>}
                      {issueCabs>0 && <Badge variant="danger">ตู้มีปัญหา {issueCabs}</Badge>}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">{r.code || `#${r.id}`}</div>
                  <div className="mt-2 text-xs space-y-1">
                    <div className="flex items-center gap-1"><Cpu className="w-3 h-3"/>{ra.length} เครื่อง{assetsRepair>0 ? <span className="text-red-700 font-medium"> · เปิดซ่อม {assetsRepair}</span> : ""}</div>
                    <div className="flex items-center gap-1"><Box className="w-3 h-3"/>{cabs.length} ตู้/แผง</div>
                    <div className="flex items-center gap-1"><Cable className="w-3 h-3"/>{allPorts.length} พอร์ต/จุด (ใช้งาน {allPorts.filter(p=>p.status==='active').length} / ว่าง {allPorts.filter(p=>p.status==='spare').length}{planned>0?` / วางแผน ${planned}`:""})</div>
                  </div>
                  {(assetsRepair>0 || planned>0) && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {assetsRepair>0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 border border-amber-300 text-amber-900">ใบแจ้งซ่อมเปิด/กำลังดำเนินการ {rh.activeRepairs || assetsRepair}</span>}
                      {planned>0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-50 border border-sky-200 text-sky-800">พอร์ตวางแผน {planned}</span>}
                    </div>
                  )}
                  {ra.length>0 && <div className="mt-2 flex flex-wrap gap-1">{ra.slice(0,4).map((a:Asset)=>{ const ar = assetHealth?.[a.id]?.active_repairs || 0; const chip = <span className={`text-[10px] px-1.5 py-0.5 rounded border ${ar>0?"bg-red-50 border-red-300 text-red-800 hover:bg-red-100":"bg-slate-100"}`} title={ar>0?`มีใบแจ้งซ่อมเปิด ${ar} — คลิกเพื่อดูรายการซ่อม`:undefined}>{a.code}{ar>0?" !":""}</span>; return ar>0 ? <Link key={a.id} href={`/repair?q=${encodeURIComponent(a.code || a.name || String(a.id))}`}>{chip}</Link> : <span key={a.id}>{chip}</span>; })}{ra.length>4 && <span className="text-[10px] text-muted-foreground">+{ra.length-4}</span>}</div>}
                  {cabs.length>0 && <div className="mt-1 flex flex-wrap gap-1">{cabs.slice(0,3).map((c:Cabinet)=>{ const bad=["faulty","inactive","maintenance"].includes(c.status); return <span key={c.id} className={`text-[10px] px-1.5 py-0.5 rounded border ${bad?"bg-red-50 border-red-300 text-red-800":"bg-amber-50 border-amber-200"}`}>{c.name||c.code||"ตู้"}{bad?" !":""}</span>; })}{cabs.length>3 && <span className="text-[10px] text-muted-foreground">+{cabs.length-3}</span>}</div>}
                </div>
              );
            })}
          </div>
          )}
          {!focusActive && (rooms||[]).length===0 && <p className="text-sm text-muted-foreground">ชั้นนี้ยังไม่มีห้องย่อยใน locations — เพิ่มห้อง (parent = ชั้นนี้) เพื่อแสดงผังห้อง</p>}
        </div>
      )}
      {!selectedBuilding && buildings.length===0 && <p className="text-sm text-muted-foreground">ยังไม่มีโครงสร้างอาคารใน Locations — เพิ่ม location ระดับอาคาร (ไม่มี parent) แล้วเพิ่มชั้นและห้องเป็นลูกตามลำดับ</p>}
    </div>
  );
}

function Layout3D({ buildings, floors, rooms, byParent, assets, config, selectedBuilding, selectedFloor, assetHealth, roomHealthMap, healthFocus }: any) {
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
              const ro: any = config.rooms[String(r.id)] || {};
              const cabs: any[] = ro.cabinets || [];
              const allP = [...(ro.ports||[]), ...cabs.flatMap((c:any)=>c?.ports||[])];
              const faulty = allP.filter((p:any)=>p?.status==='faulty').length + cabs.filter((c:any)=>['faulty','inactive','maintenance'].includes(c?.status)).length;
              const planned = allP.filter((p:any)=>p?.status==='planned').length;
              const arCount = assets.filter((a:any)=>a.location_id===r.id).reduce((s:number,a:any)=>s + (assetHealth?.[a.id]?.active_repairs || 0), 0);
              const pc = allP.length;
              const cc = cabs.length;
              const mh = 0.18 + Math.min(0.4, ac*0.05 + pc*0.015 + cc*0.06);
              let top='rgb(226,232,240)', side='rgb(203,213,225)', front='rgb(148,163,184)', stroke='rgb(100,116,139)';
              if (faulty>0 || arCount>0) { top='rgb(252,165,165)'; side='rgb(248,113,113)'; front='rgb(239,68,68)'; stroke='rgb(185,28,28)'; }
              else if (planned>0) { top='rgb(253,230,138)'; side='rgb(251,191,36)'; front='rgb(245,158,11)'; stroke='rgb(180,83,9)'; }
              else if (ac>0) { top='rgb(110,231,183)'; side='rgb(52,211,153)'; front='rgb(16,185,129)'; stroke='rgb(4,120,87)'; }
              else if (cc>0) { top='rgb(253,230,138)'; side='rgb(251,191,36)'; front='rgb(245,158,11)'; stroke='rgb(180,83,9)'; }
              drawBox(rx, ry, z + h*0.85, 0.5, 0.45, mh, top, side, front, stroke);
            });
          });
        }
        bx += 3.6;
      });
      if (blds.length===0) { ctx.fillStyle='rgb(100,116,139)'; ctx.font='14px sans-serif'; ctx.textAlign='center'; ctx.fillText('ยังไม่มีข้อมูลอาคาร/ชั้น/ห้อง ให้เพิ่มใน Locations', W()/2, H()/2); }
      ctx.fillStyle='rgb(51,65,85)'; ctx.font='12px sans-serif'; ctx.textAlign='left'; ctx.fillText('3D Isometric — ซ้อนทับสถานะสุขภาพ: แดง=ชำรุด/ซ่อมเปิด, เหลือง=วางแผน, เขียว=มีเครื่อง', 12, 20);
      raf = requestAnimationFrame(draw);
    };
    draw();
    window.addEventListener('resize', resize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, [buildings,floors,rooms,byParent,assets,config,selectedBuilding,selectedFloor,assetHealth,roomHealthMap]);
  return <div className="w-full h-[420px] rounded-xl border overflow-hidden bg-slate-50"><canvas ref={canvasRef} className="w-full h-full block" /></div>;
}
