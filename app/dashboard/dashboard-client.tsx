"use client";

import {
  ChartNoAxesCombined,
  CircleDollarSign,
  Database,
  Gauge,
  History,
  LineChart,
  LoaderCircle,
  LogOut,
  Menu,
  RefreshCw,
  ShieldCheck,
  WalletCards,
  X,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  ActivityView,
  DataView,
  EmptyState,
  Holdings,
  IncomeCosts,
  InstrumentDrawer,
  Overview,
  Performance,
} from "./dashboard-components";
import type {
  HistoricalInstrument,
  ImportRecord,
  InstrumentDetail,
  Mapping,
  Snapshot,
  Tab,
} from "./dashboard-types";
import { api } from "./dashboard-types";

const NAV_ITEMS: Array<{ id: Tab; label: string; icon: typeof Gauge }> = [
  { id: "overview", label: "Overview", icon: Gauge },
  { id: "performance", label: "Performance", icon: LineChart },
  { id: "holdings", label: "Holdings", icon: WalletCards },
  { id: "income", label: "Income & costs", icon: CircleDollarSign },
  { id: "activity", label: "Activity", icon: History },
  { id: "data", label: "Data & privacy", icon: Database },
];

export default function DashboardClient() {
  const [tab, setTab] = useState<Tab>("overview");
  const [mobileNav, setMobileNav] = useState(false);
  const [user, setUser] = useState<{ email: string } | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [detail, setDetail] = useState<InstrumentDetail | null>(null);
  const [mappings, setMappings] = useState<Mapping[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [me, files] = await Promise.all([
        api<{ user: { email: string } }>("/api/me"),
        api<{ imports: ImportRecord[] }>("/api/imports"),
      ]);
      setUser(me.user);
      setImports(files.imports);
      if (files.imports.length === 3) {
        const data = await api<Snapshot>("/api/portfolio");
        setSnapshot(data);
        setMappings(data.mappings);
      } else {
        const result = await api<{ instruments: Mapping[] }>("/api/mappings");
        setMappings(result.instruments);
        setSnapshot(null);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The dashboard could not be loaded");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function refreshMarket() {
    setBusy("market");
    setError(null);
    try {
      const result = await api<{ symbols: number; discovered: Mapping[]; errors: Record<string, string> }>("/api/market/refresh", { method: "POST" });
      setNotice(`Updated ${result.symbols} market series${result.discovered.length ? ` and found ${result.discovered.length} new symbol mappings` : ""}.`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Market prices could not be refreshed");
    } finally {
      setBusy(null);
    }
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const input = form.elements.namedItem("files") as HTMLInputElement;
    if (!input.files?.length) return;
    setBusy("upload");
    setError(null);
    try {
      const body = new FormData();
      [...input.files].forEach((file) => body.append("files", file));
      const result = await api<{ imported: Array<{ type: string }> }>("/api/imports", { method: "POST", body });
      setNotice(`Imported ${result.imported.map((item) => item.type).join(", ")}.`);
      form.reset();
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The files could not be imported");
    } finally {
      setBusy(null);
    }
  }

  async function saveMappings() {
    setBusy("mappings");
    setError(null);
    try {
      await api("/api/mappings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ instruments: mappings.filter((item) => item.isin && item.currency && item.symbol) }),
      });
      setNotice("Symbol mappings saved.");
      if (snapshot) await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Mappings could not be saved");
    } finally {
      setBusy(null);
    }
  }

  async function removeData() {
    if (!window.confirm("Delete all uploaded DEGIRO files, mappings, and cached market prices for this account?")) return;
    setBusy("delete");
    try {
      await api("/api/data", { method: "DELETE" });
      setNotice("All portfolio data for this account has been deleted.");
      await load();
      setTab("data");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The data could not be deleted");
    } finally {
      setBusy(null);
    }
  }

  async function openInstrument(item: HistoricalInstrument) {
    setBusy(`instrument:${item.isin}:${item.currency}:${item.exchange}`);
    setError(null);
    try {
      const query = new URLSearchParams({ isin: item.isin, currency: item.currency, exchange: item.exchange });
      setDetail(await api<InstrumentDetail>(`/api/instrument?${query}`));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Instrument history could not be loaded");
    } finally {
      setBusy(null);
    }
  }

  const activeLabel = NAV_ITEMS.find((item) => item.id === tab)?.label ?? "Overview";

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
      <div className="sidebar-top"><div className="app-logo"><ChartNoAxesCombined size={20} /><span>Stonks</span></div><button className="icon-button sidebar-close" onClick={() => setMobileNav(false)} aria-label="Close navigation"><X size={19} /></button></div>
      <nav aria-label="Main navigation">{NAV_ITEMS.map((item) => { const Icon = item.icon; return <button key={item.id} className={tab === item.id ? "nav-item active" : "nav-item"} onClick={() => { setTab(item.id); setMobileNav(false); }}><Icon size={18} /><span>{item.label}</span></button>; })}</nav>
      <div className="sidebar-account"><div className="account-avatar">{user?.email?.[0]?.toUpperCase() ?? "S"}</div><div><strong>{user?.email?.split("@")[0] ?? "Account"}</strong><span>{user?.email ?? "Loading…"}</span></div><a href="/cdn-cgi/access/logout" aria-label="Sign out"><LogOut size={17} /></a></div>
    </aside>

    <main className="dashboard-main">
      <header className="topbar"><div className="topbar-title"><button className="icon-button mobile-menu" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu size={20} /></button><div><p>Portfolio workspace</p><h1>{activeLabel}</h1></div></div><div className="topbar-actions">{snapshot?.market_updated_at && <span className="last-updated">Prices {new Date(snapshot.market_updated_at).toLocaleDateString("en-NL")}</span>}<button className="secondary-button" disabled={!!busy || !snapshot} onClick={refreshMarket}>{busy === "market" ? <LoaderCircle className="spin" size={16} /> : <RefreshCw size={16} />} Refresh prices</button></div></header>
      <div className="dashboard-content">
        {notice && <div className="notice success"><ShieldCheck size={17} /><span>{notice}</span><button onClick={() => setNotice(null)}><X size={16} /></button></div>}
        {error && <div className="notice error"><span>{error}</span><button onClick={() => setError(null)}><X size={16} /></button></div>}
        {loading ? <div className="loading-state"><LoaderCircle className="spin" size={26} /><span>Loading private portfolio…</span></div> : !snapshot && tab !== "data" ? <EmptyState onImport={() => setTab("data")} /> : <>{tab === "overview" && snapshot && <Overview snapshot={snapshot} onHoldings={() => setTab("holdings")} />}{tab === "performance" && snapshot && <Performance snapshot={snapshot} />}{tab === "holdings" && snapshot && <Holdings snapshot={snapshot} busy={busy} openInstrument={openInstrument} />}{tab === "income" && snapshot && <IncomeCosts snapshot={snapshot} />}{tab === "activity" && snapshot && <ActivityView snapshot={snapshot} />}{tab === "data" && <DataView imports={imports} mappings={mappings} setMappings={setMappings} upload={upload} saveMappings={saveMappings} removeData={removeData} busy={busy} quality={snapshot?.quality} />}</>}
      </div>
    </main>
    {mobileNav && <button className="scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
    {detail && <InstrumentDrawer detail={detail} onClose={() => setDetail(null)} />}
  </div>;
}
