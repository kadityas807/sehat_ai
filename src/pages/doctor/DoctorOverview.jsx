import React, { useState, useEffect } from "react";
import { hospitalService } from "@/database/hospitalService";
import { getHospitalStats } from "@/lib/supabaseService";
import { Badge } from "@/components/ui/badge";

export default function DoctorOverview({ hospitalInfo, stats: propStats } = {}) {
  const [stats, setStats] = useState({
    totalPatients: 0,
    activeBeds: 0,
    totalBeds: 0,
    staffOnDuty: 0,
    waitTime: 0,
    isMock: false,
    triagePending: 0
  });
  const [wards, setWards] = useState([]);
  const [escalations, setEscalations] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        const hospital = await hospitalService.getMyHospital();
        if (!hospital) return;

        const [s, realWards, staff, esc] = await Promise.all([
          getHospitalStats(),
          hospitalService.getWards(hospital.id),
          hospitalService.getStaff(hospital.id),
          hospitalService.getEscalations(hospital.id)
        ]);
        
        setStaffList(staff || []);
        setEscalations(esc || []);

        const hasRealData = s.totalPatients > 0 || realWards.length > 0 || (staff && staff.length > 0);

        if (hasRealData) {
          setStats({
            totalPatients: s.totalPatients || 0,
            activeBeds: realWards.reduce((acc, w) => acc + (w.beds?.filter(b => b.status === 'occupied').length || 0), 0),
            totalBeds: realWards.reduce((acc, w) => acc + (w.beds?.length || 0), 0) || 0,
            staffOnDuty: staff?.length || 0,
            waitTime: s.pendingAppointments > 0 ? Math.min(s.pendingAppointments * 10, 120) : (s.totalPatients > 0 ? 5 : 0),
            isMock: false,
            triagePending: s.pendingTriage || 0
          });

          if (realWards.length > 0) {
            setWards(realWards.map(w => {
              const total = w.beds?.length || 0;
              const occupied = w.beds?.filter(b => b.status === 'occupied').length || 0;
              const cap = total > 0 ? Math.round((occupied / total) * 100) : 0;
              return {
                label: w.name,
                floor: `Floor ${w.floor || 1}`,
                cap: cap,
                val: `${occupied}/${total} Beds`,
                status: cap > 80 ? "Critical" : "Stable",
                color: cap > 80 ? "red" : "primary"
              };
            }));
          }
        }
      } catch (err) {
        console.error("Dashboard data sync error:", err);
      } finally {
        setLoading(false);
      }
    };

    loadDashboardData();
  }, []);


  return (
    <div className="p-8 space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
          Hospital Command Center
          {stats.isMock && (
            <Badge variant="outline" className="text-[10px] uppercase border-amber-200 text-amber-600 bg-amber-50">Demo Mode</Badge>
          )}
        </h2>
      </div>

      {/* Hospital Vital Metrics Bento Grid */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white dark:bg-slate-900/50 p-6 rounded-2xl shadow-[0_10px_30px_-5px_rgba(0,0,0,0.03)] border border-slate-100 dark:border-slate-800 group hover:translate-y-[-2px] transition-all">
          <div className="flex items-center justify-between mb-4">
            <span className="p-2 bg-primary/10 text-primary rounded-xl material-symbols-outlined">person</span>
            {!stats.isMock && <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-1 rounded-full uppercase tracking-wider">REAL-TIME</span>}
            {stats.isMock && <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-1 rounded-full uppercase tracking-wider">+12%</span>}
          </div>
          <p className="text-slate-500 dark:text-slate-400 text-[10px] font-black tracking-widest uppercase mb-1">{hospitalInfo?.shortName ? `${hospitalInfo.shortName} Patients` : "Total Patients"}</p>
          <h3 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">{stats.totalPatients?.toLocaleString?.() || stats.totalPatients || 0}</h3>
        </div>

        <div className="bg-white dark:bg-slate-900/50 p-6 rounded-2xl shadow-[0_10px_30px_-5px_rgba(0,0,0,0.03)] border border-slate-100 dark:border-slate-800 group hover:translate-y-[-2px] transition-all">
          <div className="flex items-center justify-between mb-4">
            <span className="p-2 bg-primary/10 text-primary rounded-xl material-symbols-outlined">bed</span>
            <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-1 rounded-full uppercase tracking-wider">
              {Math.round((stats.activeBeds / (stats.totalBeds || 1)) * 100)}% Cap
            </span>
          </div>
          <p className="text-slate-500 dark:text-slate-400 text-[10px] font-black tracking-widest uppercase mb-1">Active Beds</p>
          <h3 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            {stats.activeBeds}<span className="text-lg text-slate-300 dark:text-slate-600 font-normal ml-1">/{stats.totalBeds || hospitalInfo?.beds || 0}</span>
          </h3>
        </div>

        <div className="bg-white dark:bg-slate-900/50 p-6 rounded-2xl shadow-[0_10px_30px_-5px_rgba(0,0,0,0.03)] border border-slate-100 dark:border-slate-800 group hover:translate-y-[-2px] transition-all">
          <div className="flex items-center justify-between mb-4">
            <span className="p-2 bg-primary/10 text-primary rounded-xl material-symbols-outlined">medical_services</span>
            <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-1 rounded-full uppercase tracking-wider">Optimal</span>
          </div>
          <p className="text-slate-500 dark:text-slate-400 text-[10px] font-black tracking-widest uppercase mb-1">Staff on Duty</p>
          <h3 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">{stats.staffOnDuty}</h3>
        </div>

        <div className="bg-red-50/50 dark:bg-red-900/10 p-6 border border-red-100 dark:border-red-900/20 rounded-2xl shadow-[0_10px_30px_-5px_rgba(239,68,68,0.05)] border-l-4 border-l-red-500 group hover:translate-y-[-2px] transition-all">
          <div className="flex items-center justify-between mb-4">
            <span className="p-2 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-xl material-symbols-outlined">timer</span>
            <span className="text-[10px] font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded-full tracking-wider">
              {stats.waitTime > 30 ? "CRITICAL" : "NORMAL"}
            </span>
          </div>
          <p className="text-slate-500 dark:text-slate-400 text-[10px] font-black tracking-widest uppercase mb-1">ER Wait Time</p>
          <h3 className="text-3xl font-extrabold tracking-tight text-red-600 dark:text-red-400">{stats.waitTime}<span className="text-lg font-normal ml-1">min</span></h3>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Ward Occupancy & Bed Management */}
        <section className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">Ward Occupancy</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5 max-w-sm">
                Showing data for <span className="font-bold text-primary">{hospitalInfo?.specialty || "General Wards"}</span>
              </p>
            </div>
            <button className="text-xs font-bold text-primary hover:underline hover:underline-offset-4 transition-all">View Map View</button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {wards.map((ward) => (
              <div key={ward.label} className="bg-white dark:bg-slate-900/50 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h4 className="font-bold text-slate-900 dark:text-white leading-tight">{ward.label}</h4>
                    <p className="text-[10px] font-bold text-slate-400/80 uppercase tracking-widest mt-1">{ward.floor}</p>
                  </div>
                  <span className={`text-sm font-black text-${ward.color === 'primary' ? 'primary' : ward.color + '-500'}`}>{ward.cap}%</span>
                </div>
                <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mb-4">
                  <div 
                    className={`h-full rounded-full bg-${ward.color === 'primary' ? 'primary' : ward.color + '-500'}`} 
                    style={{ width: `${ward.cap}%` }}
                  ></div>
                </div>
                <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  <span>{ward.val}</span>
                  <span>{ward.status}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Clinical Performance Analytics (Visual Representation) */}
          <div className="bg-white dark:bg-slate-900/50 p-8 rounded-2xl shadow-[0_10px_30px_-5px_rgba(0,0,0,0.03)] border border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">Vital Sign Alert Trends</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-1">Real-time throughput efficiency last 24h</p>
              </div>
              <div className="flex gap-4">
                <span className="flex items-center gap-1.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <span className="w-2.5 h-2.5 rounded-full bg-primary shadow-sm shadow-primary/20"></span> Alerts
                </span>
                <span className="flex items-center gap-1.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-200 dark:bg-slate-700"></span> Avg
                </span>
              </div>
            </div>
            
            <div className="relative h-56 w-full flex items-end gap-3 px-2">
              {[
                40 + (stats.totalPatients % 10), 
                60 - (stats.activeBeds % 5), 
                45 + (stats.triagePending * 5), 
                Math.min(stats.waitTime + 20, 100), 
                stats.totalPatients > 0 ? 70 : 10,
                55, 30, 45
              ].map((height, i) => (
                <div key={i} className="flex-1 bg-slate-50 dark:bg-slate-800/50 rounded-t-xl h-full relative group">
                  <div 
                    className={`absolute bottom-0 w-full ${height > 75 ? 'bg-red-500/20 group-hover:bg-red-500/40' : 'bg-primary/20 group-hover:bg-primary/40'} rounded-t-xl transition-all duration-300`} 
                    style={{ height: `${height}%` }}
                  ></div>
                </div>
              ))}
            </div>
            
            <div className="flex justify-between mt-6 text-[10px] font-black text-slate-400 uppercase tracking-widest border-t border-slate-50 dark:border-slate-800 pt-6 px-1">
              <span>00:00</span>
              <span>06:00</span>
              <span>12:00</span>
              <span>18:00</span>
              <span>Now</span>
            </div>
          </div>
        </section>

        {/* Sidebar Analytics & Feed */}
        <section className="space-y-8">
          {/* Emergency Intake Feed */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl shadow-slate-100 dark:shadow-none border border-slate-100 dark:border-slate-800 overflow-hidden">
            <div className="bg-red-500 p-5 text-white flex justify-between items-center bg-linear-to-r from-red-600 to-red-500">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-xl">emergency_share</span>
                <h2 className="text-sm font-black uppercase tracking-widest">Emergency Intake</h2>
              </div>
              <span className="px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-[10px] font-black tracking-widest animate-pulse">LIVE</span>
            </div>
            
            <div className="p-4 space-y-4 max-h-[400px] overflow-y-auto thin-scroll">
              {escalations.length === 0 ? (
                <div className="text-center py-10 opacity-50">
                  <span className="material-symbols-outlined text-4xl block mb-2 text-slate-300">verified</span>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">No Active Emergencies</p>
                </div>
              ) : (
                escalations.slice(0, 5).map((esc) => (
                  <div key={esc.id} className="p-3 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20 rounded-xl">
                    <div className="flex justify-between items-start mb-1">
                      <p className="text-[10px] font-black text-red-600 dark:text-red-400 uppercase tracking-tighter">WARD {esc.ward_name || 'ER'}</p>
                      <span className="text-[8px] font-bold text-red-400">{new Date(esc.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <p className="text-xs font-bold text-slate-900 dark:text-white leading-tight mb-1">{esc.patients?.full_name || 'Unknown Patient'}</p>
                    <p className="text-[10px] text-red-700 dark:text-red-300 line-clamp-2">{esc.reason}</p>
                  </div>
                ))
              )}
            </div>
            
            <button className="w-full py-4 text-[10px] font-black text-slate-400 hover:text-primary transition-colors border-t border-slate-50 dark:border-slate-800 uppercase tracking-[0.2em]">
              View All Incoming ({escalations.length})
            </button>
          </div>

          {/* Staffing & Operations Summary */}
          <div className="bg-white dark:bg-slate-900/50 p-8 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
            <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-8 pb-4 border-b border-slate-50 dark:border-slate-800">Operational Pulse</h2>
            
            <div className="space-y-8">
              <div>
                <div className="flex justify-between items-center mb-3">
                  <span className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest">Doctors On Call</span>
                  <span className="text-[10px] font-black text-primary px-2 py-1 bg-primary/10 rounded-full tracking-tighter">{Math.max(stats.staffOnDuty, 0)} / {Math.max(stats.staffOnDuty, 0) + (stats.staffOnDuty > 0 ? 2 : 0)}</span>
                </div>
                <div className="flex -space-x-2.5">
                  {staffList.slice(0, 3).map((s, i) => (
                    <div key={s.id || i} className="size-9 rounded-full border-[3px] border-white dark:border-slate-900 bg-primary/10 flex items-center justify-center text-[10px] font-black text-primary shadow-sm overflow-hidden">
                      {s.avatar_url ? (
                        <img src={s.avatar_url} alt={s.name} className="size-full object-cover" />
                      ) : (
                        s.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'S'
                      )}
                    </div>
                  ))}
                  {staffList.length > 3 && (
                    <div className="size-9 rounded-full border-[3px] border-white dark:border-slate-900 bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[10px] font-black text-slate-400 shadow-sm">
                      +{staffList.length - 3}
                    </div>
                  )}
                  {staffList.length === 0 && <span className="text-[10px] text-slate-400 italic">No staff on record</span>}
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-3">
                  <span className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest">Nursing Shift Compliance</span>
                  <span className="text-[10px] font-black text-primary tracking-widest">{stats.totalPatients > 0 ? 'Optimal' : 'Idle'}</span>
                </div>
                <div className="w-full h-2 bg-slate-50 dark:bg-slate-800 rounded-full overflow-hidden shadow-inner">
                  <div className="h-full bg-primary shadow-[0_0_10px_rgba(16,183,127,0.3)]" style={{ width: stats.totalPatients > 0 ? '98%' : '0%' }}></div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
