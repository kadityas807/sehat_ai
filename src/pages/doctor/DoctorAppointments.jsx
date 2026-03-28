import React, { useState, useEffect, useCallback } from 'react';
import { Calendar, Clock, User, CheckCircle2, XCircle, Loader2, RefreshCw, Search, Filter, AlertCircle } from 'lucide-react';
import { hospitalService } from '@/database/hospitalService';
import { appointmentService } from '@/database/appointmentService';
import { useAuth } from '@/contexts/AuthContext';

const STATUS_CONFIG = {
  pending:   { label: 'Pending',   color: 'amber',   bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-700',   dot: 'bg-amber-400' },
  scheduled: { label: 'Scheduled', color: 'blue',    bg: 'bg-blue-50',    border: 'border-blue-200',    text: 'text-blue-700',    dot: 'bg-blue-400' },
  completed: { label: 'Completed', color: 'emerald', bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', dot: 'bg-emerald-400' },
  cancelled: { label: 'Cancelled', color: 'slate',   bg: 'bg-slate-50',   border: 'border-slate-200',   text: 'text-slate-500',   dot: 'bg-slate-300' },
};

const MOCK_APPOINTMENTS = [
  { id: 'm1', patient_name: 'Priya Sharma', date: '2026-03-27', time: '10:00', reason: 'Routine Checkup', status: 'pending', doctor_name: null, notes: null, created_at: new Date().toISOString() },
  { id: 'm2', patient_name: 'Rahul Gupta', date: '2026-03-27', time: '11:30', reason: 'Follow-up: Hypertension', status: 'scheduled', doctor_name: 'Dr. Mehta', notes: null, created_at: new Date().toISOString() },
  { id: 'm3', patient_name: 'Ananya Patel', date: '2026-03-26', time: '09:00', reason: 'Cardiology Consult', status: 'completed', doctor_name: 'Dr. Kapoor', notes: null, created_at: new Date().toISOString() },
  { id: 'm4', patient_name: 'Vijay Nair', date: '2026-03-25', time: '14:00', reason: 'Post-op Follow-up', status: 'cancelled', doctor_name: null, notes: 'Patient rescheduled', created_at: new Date().toISOString() },
];

export default function DoctorAppointments() {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, scheduled: 0, completed: 0, cancelled: 0 });
  const [loading, setLoading] = useState(true);
  const [isMock, setIsMock] = useState(false);
  const [hospitalId, setHospitalId] = useState(null);
  const [processing, setProcessing] = useState({});
  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState(null);

  const loadData = useCallback(async () => {
    if (!user?.id) return;
    try {
      setLoading(true);
      setError(null);
      const hospital = await hospitalService.getMyHospital();
      if (!hospital) return;
      setHospitalId(hospital.id);

      const [apts, aptStats] = await Promise.all([
        appointmentService.getHospitalAppointments(hospital.id),
        appointmentService.getAppointmentStats(hospital.id),
      ]);

      if (apts.length > 0) {
        setAppointments(apts);
        setStats(aptStats);
        setIsMock(false);
      } else {
        setAppointments(MOCK_APPOINTMENTS);
        setStats({ total: 4, pending: 1, scheduled: 1, completed: 1, cancelled: 1 });
        setIsMock(true);
      }
    } catch (err) {
      console.error('Appointments load error:', err);
      setError(err.message);
      setAppointments(MOCK_APPOINTMENTS);
      setIsMock(true);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadData();
    let sub;
    const setupRealtime = async () => {
      if (!user?.id) return;
      const hospital = await hospitalService.getMyHospital();
      if (!hospital) return;
      sub = appointmentService.subscribeToAppointments(hospital.id, () => loadData());
    };
    setupRealtime();
    return () => { if (sub) sub.unsubscribe(); };
  }, [loadData, user]);

  const handleApprove = async (apt) => {
    if (isMock) {
      setAppointments(prev => prev.map(a => a.id === apt.id ? { ...a, status: 'scheduled' } : a));
      return;
    }
    setProcessing(p => ({ ...p, [apt.id]: 'approving' }));
    try {
      await appointmentService.approveAppointment(apt.id);
      await loadData();
    } catch (e) { console.error(e); }
    finally { setProcessing(p => ({ ...p, [apt.id]: null })); }
  };

  const handleReject = async (apt) => {
    if (isMock) {
      setAppointments(prev => prev.map(a => a.id === apt.id ? { ...a, status: 'cancelled' } : a));
      return;
    }
    setProcessing(p => ({ ...p, [apt.id]: 'rejecting' }));
    try {
      await appointmentService.rejectAppointment(apt.id);
      await loadData();
    } catch (e) { console.error(e); }
    finally { setProcessing(p => ({ ...p, [apt.id]: null })); }
  };

  const handleComplete = async (apt) => {
    if (isMock) {
      setAppointments(prev => prev.map(a => a.id === apt.id ? { ...a, status: 'completed' } : a));
      return;
    }
    setProcessing(p => ({ ...p, [apt.id]: 'completing' }));
    try {
      await appointmentService.completeAppointment(apt.id);
      await loadData();
    } catch (e) { console.error(e); }
    finally { setProcessing(p => ({ ...p, [apt.id]: null })); }
  };

  const filtered = appointments.filter(a => {
    const matchesFilter = filter === 'all' || a.status === filter;
    const matchesSearch = !searchQuery || (a.patient_name || '').toLowerCase().includes(searchQuery.toLowerCase()) || (a.reason || '').toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const StatCard = ({ label, value, color }) => (
    <div className={`flex-1 bg-white rounded-2xl border border-slate-100 shadow-sm p-5 min-w-[100px]`}>
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</p>
      <p className={`text-2xl font-black text-${color}-600`}>{value}</p>
    </div>
  );

  if (loading) {
    return (
      <div className="h-[60vh] flex items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-[#00b289]" />
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-6 p-8 pt-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-slate-900 flex items-center gap-3">
            Appointments
            {isMock && <span className="text-[9px] px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-600 uppercase font-black">Demo Mode</span>}
          </h2>
          <p className="text-slate-500 text-sm mt-1">Manage patient appointment requests and scheduling.</p>
        </div>
        <button
          onClick={loadData}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50 transition-all"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {/* Stats Bar */}
      <div className="flex gap-4 flex-wrap">
        <StatCard label="Total" value={stats.total} color="slate" />
        <StatCard label="Pending" value={stats.pending} color="amber" />
        <StatCard label="Scheduled" value={stats.scheduled} color="blue" />
        <StatCard label="Completed" value={stats.completed} color="emerald" />
        <StatCard label="Cancelled" value={stats.cancelled} color="slate" />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search patient or reason..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm w-64 focus:outline-none focus:ring-2 focus:ring-[#00b289]/20"
          />
        </div>
        <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
          {['all', 'pending', 'scheduled', 'completed', 'cancelled'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide transition-all ${filter === f ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700">
          <AlertCircle size={16} />
          <span>Database error: {error}. Showing demo data.</span>
        </div>
      )}

      {/* Appointment Cards */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-slate-400">
          <Calendar size={48} className="mb-4 opacity-20" />
          <p className="font-black text-lg uppercase tracking-widest">No Appointments</p>
          <p className="text-sm mt-1">No appointments match your current filter.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(apt => {
            const cfg = STATUS_CONFIG[apt.status] || STATUS_CONFIG.pending;
            const busy = processing[apt.id];
            const patientName = apt.patient_name || apt.patients?.full_name || 'Unknown Patient';
            return (
              <div
                key={apt.id}
                className={`bg-white rounded-2xl border shadow-sm p-5 ${cfg.border} transition-all hover:shadow-md`}
              >
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-start gap-4">
                    <div className={`size-11 rounded-xl flex items-center justify-center font-black text-sm ${cfg.bg} ${cfg.text}`}>
                      {patientName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-black text-slate-900">{patientName}</h3>
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${cfg.bg} ${cfg.text} border ${cfg.border}`}>
                          <span className={`size-1.5 rounded-full ${cfg.dot}`}></span>
                          {cfg.label}
                        </span>
                      </div>
                      <p className="text-sm text-slate-600 font-medium">{apt.reason || 'General Consultation'}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-slate-400 font-bold">
                        <span className="flex items-center gap-1"><Calendar size={11} />{apt.appointment_time ? new Date(apt.appointment_time).toLocaleDateString() : apt.date || 'TBD'}</span>
                        <span className="flex items-center gap-1"><Clock size={11} />{apt.appointment_time ? new Date(apt.appointment_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : apt.time}</span>
                        {apt.doctor_name && <span className="flex items-center gap-1"><User size={11} />{apt.doctor_name}</span>}
                      </div>
                      {apt.notes && (
                        <p className="text-xs text-slate-400 italic mt-1.5 border-l-2 border-slate-200 pl-2">{apt.notes}</p>
                      )}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-2 shrink-0">
                    {apt.status === 'pending' && (
                      <>
                        <button
                          disabled={!!busy}
                          onClick={() => handleApprove(apt)}
                          className="flex items-center gap-1.5 px-4 py-2 bg-[#00b289] text-white rounded-xl text-xs font-black uppercase tracking-wide hover:bg-[#00b289]/90 transition-all shadow-lg shadow-[#00b289]/20 disabled:opacity-50"
                        >
                          {busy === 'approving' ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                          Approve
                        </button>
                        <button
                          disabled={!!busy}
                          onClick={() => handleReject(apt)}
                          className="flex items-center gap-1.5 px-4 py-2 bg-white border border-red-200 text-red-600 rounded-xl text-xs font-black uppercase tracking-wide hover:bg-red-50 transition-all disabled:opacity-50"
                        >
                          {busy === 'rejecting' ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />}
                          Reject
                        </button>
                      </>
                    )}
                    {apt.status === 'scheduled' && (
                      <button
                        disabled={!!busy}
                        onClick={() => handleComplete(apt)}
                        className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-black uppercase tracking-wide hover:bg-blue-700 transition-all disabled:opacity-50"
                      >
                        {busy === 'completing' ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                        Mark Complete
                      </button>
                    )}
                    {(apt.status === 'completed' || apt.status === 'cancelled') && (
                      <span className="text-[10px] text-slate-300 font-black uppercase tracking-widest">{apt.status === 'completed' ? 'Done' : 'Closed'}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
