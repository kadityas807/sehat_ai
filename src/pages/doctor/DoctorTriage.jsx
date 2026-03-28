import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, PhoneCall, Ambulance, Clock, Activity, CheckCircle2, Video, FileText, Loader2, Plus, RefreshCw } from 'lucide-react';
import { triageService } from '@/database/triageService';
import { hospitalService } from '@/database/hospitalService';
import { useAuth } from '@/contexts/AuthContext';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

const STATUS_COLORS = {
  'Active':                { bg: 'bg-red-50', border: 'border-red-200', badge: 'bg-red-600 text-white' },
  'Requires Doctor Override': { bg: 'bg-amber-50', border: 'border-amber-200', badge: 'bg-amber-500 text-white' },
  'Pending Review':        { bg: 'bg-blue-50', border: 'border-blue-200', badge: 'bg-blue-500 text-white' },
  'Resolved':              { bg: 'bg-slate-50', border: 'border-slate-200', badge: 'bg-slate-400 text-white' },
  'Discharged':            { bg: 'bg-slate-50', border: 'border-slate-200', badge: 'bg-slate-400 text-white' },
};

const MOCK_RECORDS = [
  { id: 'm1', patient_name: 'Rajesh Kumar', patient_age: 45, type: 'Critical Vitals', description: 'Acute Respiratory Distress - SpO2 84%, HR 122.', ai_action: 'Predicted Sepsis Risk 94%. ICU Pre-alert Sent.', status: 'Active', created_at: new Date(Date.now() - 120000).toISOString() },
  { id: 'm2', patient_name: 'Anita Sharma', patient_age: 72, type: 'Inactivity Threshold', description: 'Unresponsive for 4 hours - Suspected Stroke.', ai_action: 'Neuro-Trauma Team Mobilized via Sentinel Agent.', status: 'Requires Doctor Override', created_at: new Date(Date.now() - 3600000).toISOString() },
  { id: 'm3', patient_name: 'Suresh Gupta', patient_age: 29, type: 'Surgical Escalation', description: 'Severe Abdominal Trauma - Internal Bleeding.', ai_action: 'Blood Bank notified for O-negative cross-match.', status: 'Pending Review', created_at: new Date(Date.now() - 7200000).toISOString() },
  { id: 'm4', patient_name: 'Vikram Singh', patient_age: 52, type: 'Cardiac Event', description: 'Troponin T elevated. SpO2 dropped below 90%.', ai_action: 'Logged event. Logged for Urgent Cardiology Consult.', status: 'Pending Review', created_at: new Date(Date.now() - 14400000).toISOString() },
];

function timeAgo(str) {
  const diff = (Date.now() - new Date(str).getTime()) / 60000;
  if (diff < 2) return 'Just now';
  if (diff < 60) return `${Math.floor(diff)} mins ago`;
  if (diff < 1440) return `${Math.floor(diff / 60)} hr${Math.floor(diff / 60) > 1 ? 's' : ''} ago`;
  return `${Math.floor(diff / 1440)}d ago`;
}

export default function DoctorTriage() {
  const { user } = useAuth();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isMock, setIsMock] = useState(false);
  const [hospitalId, setHospitalId] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [processing, setProcessing] = useState({});
  const [form, setForm] = useState({ patient_name: '', patient_age: '', type: '', description: '' });


  const load = useCallback(async () => {
    try {
      const h = await hospitalService.getMyHospital();
      if (!h) return;
      setHospitalId(h.id);
      
      const data = await triageService.getTriageRecords(h.id);
      
      if (data && data.length > 0) { setRecords(data); setIsMock(false); }
      else { setRecords(MOCK_RECORDS); setIsMock(true); }
    } catch (err) {
      console.error(err);
      setRecords(MOCK_RECORDS); setIsMock(true);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
    let sub;
    const setupRT = async () => {
      if (!user?.id) return;
      const h = await hospitalService.getMyHospital();
      if (!h) return;
      sub = triageService.subscribeToTriage(h.id, () => load());
    };
    setupRT();
    return () => { if (sub) sub.unsubscribe(); };
  }, [load, user]);

  const handleAddCase = async (e) => {
    e.preventDefault();
    if (isMock) {
      const fake = { id: `m${Date.now()}`, ...form, patient_age: parseInt(form.patient_age), ai_action: 'Logged by hospital staff', status: 'Active', created_at: new Date().toISOString() };
      setRecords(prev => [fake, ...prev]);
      setAddOpen(false); setForm({ patient_name: '', patient_age: '', type: '', description: '' });
      return;
    }
    setProcessing(p => ({ ...p, add: true }));
    try {
      await triageService.addTriageRecord({ ...form, patient_age: parseInt(form.patient_age), hospital_id: hospitalId, status: 'Active', ai_action: 'Logged by hospital staff' });
      await load();
      setAddOpen(false);
      setForm({ patient_name: '', patient_age: '', type: '', description: '' });
    } catch (e) { console.error(e); }
    finally { setProcessing(p => ({ ...p, add: false })); }
  };

  const handleResolve = async (rec) => {
    if (isMock) {
      setRecords(prev => prev.map(r => r.id === rec.id ? { ...r, status: 'Resolved' } : r));
      return;
    }
    setProcessing(p => ({ ...p, [rec.id]: true }));
    try {
      await triageService.updateTriageStatus(rec.id, 'Resolved');
      await load();
    } catch (e) { console.error(e); }
    finally { setProcessing(p => ({ ...p, [rec.id]: false })); }
  };

  const active = records.filter(r => r.status === 'Active' || r.status === 'Requires Doctor Override');
  const pending = records.filter(r => r.status === 'Pending Review');
  const resolved = records.filter(r => r.status === 'Resolved' || r.status === 'Discharged');

  return (
    <div className="flex-1 space-y-6 p-8 pt-6">
      <div className="flex items-center justify-between space-y-2 flex-wrap gap-4">
        <h2 className="text-3xl font-black tracking-tight text-slate-900 flex items-center uppercase gap-3">
          <AlertTriangle className="h-8 w-8 text-red-600" />
          Smart Triage
          {isMock && <span className="text-[9px] px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-600 font-black">Demo</span>}
        </h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} className="gap-1 font-black text-[10px] uppercase tracking-wide">
            <RefreshCw size={12} /> Refresh
          </Button>
          <Button onClick={() => setAddOpen(true)} className="bg-red-600 hover:bg-red-700 text-white font-black uppercase text-[10px] tracking-widest gap-2">
            <Plus size={16} /> Add Case
          </Button>
        </div>
      </div>


      {/* Stats row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white border-2 border-slate-900 rounded-2xl p-6 shadow-[8px_8px_0px_rgba(0,0,0,0.1)]">
          <div className="flex justify-between items-start mb-4">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Priority Index</span>
            <Badge className="bg-red-600 text-white border-none font-black">CRITICAL</Badge>
          </div>
          <h4 className="text-3xl font-black text-slate-900">{active.length > 0 ? (active.length * 2.5).toFixed(1) : '0.0'}/10</h4>
          <div className="mt-4 flex items-center gap-2 text-red-600">
            <span className="material-symbols-outlined text-sm">trending_up</span>
            <span className="text-[11px] font-bold">{active.length} active case{active.length !== 1 ? 's' : ''} requiring action</span>
          </div>
        </div>

        <div className="bg-indigo-600 rounded-2xl p-6 text-white shadow-xl shadow-indigo-100 relative overflow-hidden">
          <div className="absolute -right-4 -bottom-4 opacity-10 rotate-12 scale-150"><AlertTriangle size={120} /></div>
          <p className="text-[10px] font-black uppercase tracking-widest opacity-80 mb-2">Pending Review</p>
          <h4 className="text-3xl font-black">{pending.length}</h4>
          <p className="text-[11px] mt-4 opacity-90 font-medium italic">Cases awaiting doctor assessment</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-6">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Case Summary</p>
          <div className="space-y-3">
            <div className="flex justify-between items-center bg-slate-50 p-2 rounded-lg">
              <span className="text-[11px] font-black text-slate-900">Total Cases</span>
              <span className="text-[10px] font-bold text-slate-500">{records.length}</span>
            </div>
            <div className="flex justify-between items-center bg-slate-50 p-2 rounded-lg">
              <span className="text-[11px] font-black text-slate-900">Resolved Today</span>
              <span className="text-[10px] font-bold text-emerald-600">{resolved.length}</span>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 size={32} className="animate-spin text-[#00b289]" /></div>
      ) : (
        <>
          {/* Active Emergencies */}
          {active.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-xl font-semibold text-red-600 flex items-center">
                <span className="relative flex h-3 w-3 mr-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                </span>
                Active Emergencies ({active.length})
              </h3>
              <div className="grid gap-4">
                {active.map(rec => {
                  const cfg = STATUS_COLORS[rec.status] || STATUS_COLORS['Active'];
                  return (
                    <Card key={rec.id} className={`${cfg.border} shadow-sm ${cfg.bg}`}>
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge className={cfg.badge}>{rec.status}</Badge>
                            <span className="text-xs text-slate-500 flex items-center gap-1"><Clock size={10} /> {timeAgo(rec.created_at)}</span>
                          </div>
                        </div>
                        <CardTitle className="text-lg mt-2">{rec.patient_name}{rec.patient_age ? `, ${rec.patient_age}y` : ''}</CardTitle>
                        <CardDescription className="font-medium text-slate-700">{rec.type}: {rec.description}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        {rec.ai_action && (
                          <div className="flex items-center gap-2 p-2 bg-indigo-50 rounded-lg mb-3 text-xs text-indigo-800 font-medium">
                            <span className="material-symbols-outlined text-indigo-500 text-sm">psychology</span>
                            {rec.ai_action}
                          </div>
                        )}
                        <div className="flex gap-2 flex-wrap">
                          <Button className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold gap-1">
                            <PhoneCall size={12} /> Call Caregiver
                          </Button>
                          <Button variant="outline" className="text-xs font-bold border-slate-200 gap-1">
                            <Ambulance size={12} /> Dispatch
                          </Button>
                          <Button
                            onClick={() => handleResolve(rec)}
                            disabled={processing[rec.id]}
                            variant="outline"
                            className="text-xs font-bold border-emerald-200 text-emerald-600 hover:bg-emerald-50 gap-1"
                          >
                            {processing[rec.id] ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                            Resolve
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {/* Pending Review */}
          {pending.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-xl font-semibold text-blue-600 flex items-center gap-2">
                <FileText size={18} /> AI Escalations — Pending Review ({pending.length})
              </h3>
              <div className="grid gap-4">
                {pending.map(rec => (
                  <Card key={rec.id} className="border-blue-200 bg-blue-50/30">
                    <CardHeader className="pb-2">
                      <div className="flex items-center gap-2">
                        <Badge className="bg-blue-500 text-white">Pending</Badge>
                        <span className="text-xs text-slate-500 flex items-center gap-1"><Clock size={10} />{timeAgo(rec.created_at)}</span>
                      </div>
                      <CardTitle className="text-base mt-1">{rec.patient_name}{rec.patient_age ? `, ${rec.patient_age}y` : ''}</CardTitle>
                      <CardDescription className="font-medium text-slate-600">{rec.type}: {rec.description}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {rec.ai_action && (
                        <p className="text-xs text-slate-500 italic mb-3">{rec.ai_action}</p>
                      )}
                      <div className="flex gap-2">
                        <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold gap-1"><Video size={12} />Teleconsult</Button>
                        <Button
                          size="sm"
                          onClick={() => handleResolve(rec)}
                          disabled={processing[rec.id]}
                          variant="outline"
                          className="text-xs font-bold border-emerald-200 text-emerald-600 hover:bg-emerald-50 gap-1"
                        >
                          {processing[rec.id] ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                          Resolve
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {records.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 text-slate-300">
              <AlertTriangle size={48} className="mb-4" />
              <p className="font-black text-lg uppercase tracking-widest">No Triage Cases</p>
              <p className="text-sm mt-1">All clear — no active emergencies.</p>
            </div>
          )}
        </>
      )}

      {/* Add Case Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add Triage Case</DialogTitle>
            <DialogDescription>Log a new emergency or escalation case to the triage system.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddCase}>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="pname" className="text-right">Patient</Label>
                <Input id="pname" className="col-span-3" placeholder="Full name" value={form.patient_name} onChange={e => setForm({ ...form, patient_name: e.target.value })} required />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="pageAge" className="text-right">Age</Label>
                <Input id="pageAge" type="number" className="col-span-3" placeholder="e.g. 65" value={form.patient_age} onChange={e => setForm({ ...form, patient_age: e.target.value })} />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="ptype" className="text-right">Type</Label>
                <Input id="ptype" className="col-span-3" placeholder="e.g. Critical Vitals" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} required />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="pdesc" className="text-right">Description</Label>
                <Input id="pdesc" className="col-span-3" placeholder="Summary of the issue" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} required />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={processing.add} className="bg-red-600 text-white hover:bg-red-700">
                {processing.add ? <Loader2 size={14} className="animate-spin mr-2" /> : null}
                Add Triage Case
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
