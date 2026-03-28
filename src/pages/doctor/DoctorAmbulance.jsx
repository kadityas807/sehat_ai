import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Ambulance, MapPin, Clock, AlertTriangle, PhoneCall, CheckCircle2, Loader2, Plus, RefreshCw } from 'lucide-react';
import { AmbulanceMap } from '@/components/AmbulanceMap';
import { ambulanceService } from '@/database/ambulanceService';
import { hospitalService } from '@/database/hospitalService';
import { useAuth } from '@/contexts/AuthContext';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

const MOCK_DISPATCHES = [
  { id: 'm1', patient_name: 'Eleanor Vance', location: '123 Maple St, Springfield', status: 'Dispatched', unit_number: 'Medic-42', priority: 'Critical', eta_minutes: 4, reason: 'Sustained HR > 110 bpm', dispatched_at: new Date(Date.now() - 180000).toISOString() },
  { id: 'm2', patient_name: 'Marcus Johnson', location: '45 Park Avenue, Mumbai', status: 'Completed', unit_number: 'Medic-17', priority: 'High', eta_minutes: null, reason: 'Fall injury', dispatched_at: new Date(Date.now() - 86400000).toISOString() },
];

function timeAgo(str) {
  if (!str) return '';
  const diff = (Date.now() - new Date(str).getTime()) / 60000;
  if (diff < 2) return 'Just now';
  if (diff < 60) return `${Math.floor(diff)}m ago`;
  if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
  return `${Math.floor(diff / 1440)}d ago`;
}

export default function DoctorAmbulance() {
  const { user } = useAuth();
  const [dispatches, setDispatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isMock, setIsMock] = useState(false);
  const [hospitalId, setHospitalId] = useState(null);
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [processing, setProcessing] = useState({});
  const [form, setForm] = useState({ patient_name: '', location: '', unit_number: '', priority: 'High', reason: '', eta_minutes: '' });

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const h = await hospitalService.getMyHospital();
      if (!h) return;
      setHospitalId(h.id);
      const data = await ambulanceService.getDispatches(h.id);
      if (data.length > 0) { setDispatches(data); setIsMock(false); }
      else { setDispatches(MOCK_DISPATCHES); setIsMock(true); }
    } catch {
      setDispatches(MOCK_DISPATCHES); setIsMock(true);
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
      sub = ambulanceService.subscribeToDispatches(h.id, () => load());
    };
    setupRT();
    return () => { if (sub) sub.unsubscribe(); };
  }, [load, user]);

  const handleDispatch = async (e) => {
    e.preventDefault();
    if (isMock) {
      const fake = { id: `m${Date.now()}`, ...form, status: 'Dispatched', dispatched_at: new Date().toISOString() };
      setDispatches(prev => [fake, ...prev]);
      setDispatchOpen(false); setForm({ patient_name: '', location: '', unit_number: '', priority: 'High', reason: '', eta_minutes: '' });
      return;
    }
    setProcessing(p => ({ ...p, dispatch: true }));
    try {
      await ambulanceService.createDispatch({ ...form, eta_minutes: form.eta_minutes ? parseInt(form.eta_minutes) : null, hospital_id: hospitalId });
      await load();
      setDispatchOpen(false);
      setForm({ patient_name: '', location: '', unit_number: '', priority: 'High', reason: '', eta_minutes: '' });
    } catch (e) { console.error(e); }
    finally { setProcessing(p => ({ ...p, dispatch: false })); }
  };

  const handleComplete = async (d) => {
    if (isMock) {
      setDispatches(prev => prev.map(x => x.id === d.id ? { ...x, status: 'Completed' } : x));
      return;
    }
    setProcessing(p => ({ ...p, [d.id]: true }));
    try {
      await ambulanceService.updateDispatchStatus(d.id, 'Completed');
      await load();
    } catch (e) { console.error(e); }
    finally { setProcessing(p => ({ ...p, [d.id]: false })); }
  };

  const active = dispatches.filter(d => d.status === 'Dispatched' || d.status === 'En Route');
  const history = dispatches.filter(d => d.status === 'Completed' || d.status === 'Cancelled');

  return (
    <div className="flex-1 space-y-6 p-8 pt-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h2 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
          EMS &amp; Dispatch
          {isMock && <span className="text-[9px] px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-600 font-black">Demo</span>}
        </h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} className="gap-1 font-black text-[10px] uppercase tracking-wide">
            <RefreshCw size={12} /> Refresh
          </Button>
          <Button onClick={() => setDispatchOpen(true)} className="bg-red-600 hover:bg-red-700 text-white font-black gap-1">
            <Ambulance className="h-4 w-4" /> Dispatch Ambulance
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 size={32} className="animate-spin text-red-500" /></div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            {/* Active dispatches */}
            {active.map(d => (
              <Card key={d.id} className="border-red-200 shadow-sm shadow-red-100 bg-red-50/30">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center space-x-2">
                      <Badge variant="destructive" className="animate-pulse">Active Emergency</Badge>
                      <span className="text-sm font-medium text-slate-500 flex items-center gap-1"><Clock className="h-3 w-3" /> Dispatched {timeAgo(d.dispatched_at)}</span>
                    </div>
                    <Badge variant="outline" className="text-red-600 border-red-200 bg-white"><AlertTriangle className="mr-1 h-3 w-3" />{d.priority}</Badge>
                  </div>
                  <CardTitle className="text-xl mt-2">{d.patient_name}</CardTitle>
                  <CardDescription className="text-base text-slate-700 font-medium">{d.reason || 'Emergency response'}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="bg-white p-4 rounded-lg border border-red-100 flex items-center justify-between mb-4 flex-wrap gap-4">
                    <div className="flex items-center space-x-4">
                      <div className="p-3 bg-red-100 text-red-600 rounded-full"><Ambulance className="h-6 w-6" /></div>
                      <div>
                        <h4 className="text-lg font-bold text-slate-900">{d.unit_number} is En Route</h4>
                        <p className="text-sm text-slate-600 flex items-center mt-1"><MapPin className="h-3 w-3 mr-1" />{d.location}</p>
                      </div>
                    </div>
                    {d.eta_minutes && (
                      <div className="text-right">
                        <p className="text-sm font-medium text-slate-500">ETA</p>
                        <p className="text-2xl font-bold text-red-600">{d.eta_minutes} min</p>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button className="flex-1 bg-red-600 hover:bg-red-700 text-white gap-1"><PhoneCall className="h-4 w-4" /> Contact Paramedics</Button>
                    <Button
                      onClick={() => handleComplete(d)}
                      disabled={processing[d.id]}
                      variant="outline"
                      className="flex-1 text-emerald-600 border-emerald-200 hover:bg-emerald-50 gap-1"
                    >
                      {processing[d.id] ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                      Mark Complete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}

            {active.length === 0 && (
              <Card className="border-slate-200 bg-slate-50">
                <CardContent className="flex flex-col items-center justify-center py-12 text-slate-400">
                  <Ambulance size={36} className="mb-3 opacity-30" />
                  <p className="font-black uppercase tracking-widest text-sm">No Active Dispatches</p>
                  <p className="text-xs mt-1">All units are available.</p>
                </CardContent>
              </Card>
            )}

            {/* History */}
            {history.length > 0 && (
              <Card className="border-slate-200">
                <CardHeader>
                  <CardTitle>Recent Dispatches</CardTitle>
                  <CardDescription>History from the last 30 dispatches.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {history.map(d => (
                      <div key={d.id} className="flex items-center justify-between p-3 rounded-xl border bg-slate-50 border-slate-100">
                        <div className="flex items-center space-x-3">
                          <div className="p-2 bg-slate-200 text-slate-500 rounded-full"><Ambulance className="h-4 w-4" /></div>
                          <div>
                            <h4 className="text-sm font-bold text-slate-900">{d.patient_name}</h4>
                            <p className="text-xs text-slate-500 flex items-center gap-1"><Clock className="h-3 w-3" />{timeAgo(d.dispatched_at)} • {d.unit_number}</p>
                          </div>
                        </div>
                        <Badge variant="secondary" className={d.status === 'Completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}>
                          {d.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          <Card className="border-slate-200 h-fit">
            <CardHeader>
              <CardTitle>Live Tracking Map</CardTitle>
              <CardDescription>Real-time location of active ambulance dispatches.</CardDescription>
            </CardHeader>
            <CardContent>
              <AmbulanceMap dispatches={active.map(d => ({ ...d, destY: 30, destX: 65, progress: 50 }))} />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Dispatch Dialog */}
      <Dialog open={dispatchOpen} onOpenChange={setDispatchOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600"><Ambulance size={18} /> Dispatch Ambulance</DialogTitle>
            <DialogDescription>Log a new ambulance dispatch for a patient emergency.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleDispatch}>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="dname" className="text-right">Patient</Label>
                <Input id="dname" className="col-span-3" placeholder="Patient name" value={form.patient_name} onChange={e => setForm({ ...form, patient_name: e.target.value })} required />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="dloc" className="text-right">Location</Label>
                <Input id="dloc" className="col-span-3" placeholder="Pickup address" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} required />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="dunit" className="text-right">Unit</Label>
                <Input id="dunit" className="col-span-3" placeholder="e.g. Medic-42" value={form.unit_number} onChange={e => setForm({ ...form, unit_number: e.target.value })} />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="deta" className="text-right">ETA (mins)</Label>
                <Input id="deta" type="number" className="col-span-3" placeholder="e.g. 8" value={form.eta_minutes} onChange={e => setForm({ ...form, eta_minutes: e.target.value })} />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="dreason" className="text-right">Reason</Label>
                <Input id="dreason" className="col-span-3" placeholder="Brief description" value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} required />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDispatchOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={processing.dispatch} className="bg-red-600 text-white hover:bg-red-700">
                {processing.dispatch ? <Loader2 size={14} className="animate-spin mr-2" /> : <Ambulance size={14} className="mr-2" />}
                Dispatch Now
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
