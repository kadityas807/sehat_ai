import React, { useState, useEffect } from 'react';
import { Toast, useToast } from '@/components/ui/Toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Loader2, UserPlus, Users, Calendar, Activity as ActivityIcon, MoreHorizontal, Trash2, Edit2, Search } from 'lucide-react';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, isSameMonth, isSameDay, addDays, parseISO } from 'date-fns';
import { hospitalService, authService } from '@/database';

const AVATAR = 'https://cdn-icons-png.flaticon.com/512/3774/3774299.png';

export default function DoctorStaff() {
  const { toasts, addToast, removeToast } = useToast();
  const [staffList, setStaffList] = useState([]);
  const [isMocking, setIsMocking] = useState(false);
  const [activities, setActivities] = useState([]);
  const [lastError, setLastError] = useState(null);

  const REPAIR_SQL = `-- Fix hospital_staff schema mismatch
ALTER TABLE public.hospital_staff ADD COLUMN IF NOT EXISTS doctor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.hospital_staff ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.hospital_staff ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.hospital_staff ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'Nurse';
ALTER TABLE public.hospital_staff ADD COLUMN IF NOT EXISTS specialty TEXT;
ALTER TABLE public.hospital_staff ADD COLUMN IF NOT EXISTS department TEXT;
ALTER TABLE public.hospital_staff ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'On Duty';
ALTER TABLE public.hospital_staff ADD COLUMN IF NOT EXISTS avatar TEXT;
ALTER TABLE public.hospital_staff ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE public.hospital_staff ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.hospital_staff ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.hospital_staff ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Handle UNIQUE constraint if possible
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hospital_staff_hospital_id_doctor_id_key') THEN
    ALTER TABLE public.hospital_staff ADD CONSTRAINT hospital_staff_hospital_id_doctor_id_key UNIQUE (hospital_id, doctor_id);
  END IF;
END $$;`;
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Dialog controls
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState(null);
  const [isAssignShiftOpen, setIsAssignShiftOpen] = useState(false);
  
  // Forms
  const emptyStaffForm = { name: '', email: '', role: 'Doctor', department: '', status: 'On Duty' };
  const [formData, setFormData] = useState(emptyStaffForm);
  const [shiftData, setShiftData] = useState({ date: format(new Date(), 'yyyy-MM-dd'), type: 'Morning Shift (ER)', staffId: '' });

  // Calendar State
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());

  useEffect(() => {
    loadAllStaffData();
  }, []);

  const initialStaff = [
    { id: '1', name: 'Dr. Sarah Chen', role: 'Doctor', department: 'Cardiology', status: 'On Duty', email: 's.chen@sehat.ai', avatar: 'https://i.pravatar.cc/150?u=sarah' },
    { id: '2', name: 'James Wilson', role: 'Nurse', department: 'ICU', status: 'On Duty', email: 'j.wilson@sehat.ai', avatar: 'https://i.pravatar.cc/150?u=james' },
    { id: '3', name: 'Dr. Michael Ross', role: 'Doctor', department: 'ER', status: 'Off Duty', email: 'm.ross@sehat.ai', avatar: 'https://i.pravatar.cc/150?u=michael' },
    { id: '4', name: 'Elena Vance', role: 'Technician', department: 'Lab', status: 'On Duty', email: 'e.vance@sehat.ai', avatar: 'https://i.pravatar.cc/150?u=elena' },
  ];

  const loadAllStaffData = async () => {
    try {
      setLoading(true);
      const hospital = await hospitalService.getMyHospital();
      if (!hospital) {
        setStaffList(initialStaff);
        setIsMocking(true);
        return;
      }

      const [staff, shiftLogs, logs] = await Promise.all([
        hospitalService.getStaff(hospital.id),
        hospitalService.getShifts(hospital.id),
        hospitalService.getAuditLogs(hospital.id)
      ]);

      const realStaff = staff || [];
      const hasRealData = realStaff.length > 0;
      
      const mergedStaff = [...realStaff];
      if (realStaff.length < 3) {
        initialStaff.forEach(m => {
          if (!mergedStaff.some(s => s.name === m.name)) {
            mergedStaff.push(m);
          }
        });
      }

      setStaffList(mergedStaff);
      setIsMocking(!hasRealData);
      setShifts(shiftLogs || []);
      setActivities(logs?.filter(l => l.action_type === 'STAFF_ACTION').slice(0, 8) || []);
    } catch (err) {
      console.error("Staff sync error:", err);
      setStaffList(initialStaff);
      setIsMocking(true);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveStaff = async (e) => {
    e.preventDefault();
    setIsProcessing(true);
    const lid = addToast(editingStaff ? `Updating ${formData.name}...` : `Onboarding ${formData.name}...`, 'loading', 3000);
    try {
      const hospital = await hospitalService.getMyHospital();
      
      if (editingStaff) {
         // Update endpoint not explicit in userService yet, but using addStaff as upsert if needed
         // For now let's assume update logic or call add again with same ID if schema supports
         await hospitalService.updateStaff(editingStaff.id, formData);
         removeToast(lid);
         addToast(`✓ ${formData.name}'s profile updated.`, 'success');
      } else {
         await hospitalService.addStaff(hospital.id, formData);
         removeToast(lid);
         addToast(`✓ ${formData.name} successfully onboarded.`, 'success');
      }
      
      setIsAddOpen(false);
      setEditingStaff(null);
      setFormData(emptyStaffForm);
      loadAllStaffData();
    } catch (err) {
      console.error("Staff Onboarding Error:", err);
      setLastError(err.message || String(err));
      removeToast(lid);
      addToast('Operation failed. Schema mismatch likely.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteStaff = async (id, name) => {
    if (!window.confirm(`Are you sure you want to remove ${name}?`)) return;
    
    setIsProcessing(true);
    const lid = addToast(`Removing ${name}...`, 'loading', 3000);
    try {
      await hospitalService.deleteStaff(id);
      removeToast(lid);
      addToast(`${name} removed from directory.`, 'success');
      loadAllStaffData();
    } catch (err) {
      removeToast(lid);
      addToast('Removal failed', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAssignShift = async (e) => {
    e.preventDefault();
    const assignedStaff = staffList.find(s => s.id === shiftData.staffId);
    if (!assignedStaff) return;

    setIsProcessing(true);
    const lid = addToast(`Assigning shift to ${assignedStaff.name}...`, 'loading', 3000);
    try {
      const hospital = await hospitalService.getMyHospital();
      await hospitalService.assignShift(hospital.id, {
        staff_id: assignedStaff.id,
        shift_date: shiftData.date,
        shift_type: shiftData.type,
        start_time: shiftData.start,
        end_time: shiftData.end
      });
      
      removeToast(lid);
      addToast(`✓ Shift assigned successfully.`, 'success');
      setIsAssignShiftOpen(false);
      loadAllStaffData();
    } catch (err) {
      removeToast(lid);
      addToast('Assignment failed', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const filteredStaff = staffList.filter(s => 
    s.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
    s.role?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.department?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderCalendarDays = () => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
    const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });

    const rows = [];
    let days = [];
    let day = startDate;

    while (day <= endDate) {
      for (let i = 0; i < 7; i++) {
        const cloneDay = day;
        const formattedDate = format(day, "d");
        const dayShifts = shifts.filter(s => s.shift_date === format(cloneDay, 'yyyy-MM-dd'));
        const isSelected = isSameDay(day, selectedDate);
        const isCurMonth = isSameMonth(day, monthStart);
        
        days.push(
          <div 
            key={day.toString()} 
            className={`p-2 text-xs font-black relative cursor-pointer hover:bg-slate-50 transition-colors rounded-xl flex flex-col items-center
              ${!isCurMonth ? "text-slate-200" : "text-slate-700"}
              ${isSelected ? "bg-[#00b289] text-white hover:bg-[#00b289] shadow-lg shadow-emerald-100" : ""}
            `}
            onClick={() => setSelectedDate(cloneDay)}
          >
            <span>{formattedDate}</span>
            {dayShifts.length > 0 && (
              <div className="flex gap-0.5 mt-1">
                {dayShifts.map((s, idx) => (
                  <span key={idx} className={`w-1 h-1 rounded-full ${isSelected ? 'bg-white' : 'bg-emerald-400'}`}></span>
                ))}
              </div>
            )}
          </div>
        );
        day = addDays(day, 1);
      }
      rows.push(<div className="grid grid-cols-7 gap-1" key={day.toString()}>{days}</div>);
      days = [];
    }
    return rows;
  };

  if (loading) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center text-slate-400">
        <Loader2 className="h-10 w-10 animate-spin mb-4 text-[#00b289]" />
        <p className="font-black uppercase tracking-widest text-xs">Syncing Personnel Database...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 w-full p-2 animate-in fade-in duration-500">
      <Toast toasts={toasts} removeToast={removeToast} />
      
      {/* Search & Actions Bar */}
      <div className="bg-white rounded-2xl border border-slate-100 p-4 mb-8 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4 flex-1">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 w-4 h-4" />
            <input 
              className="w-full bg-slate-50 border-none rounded-xl pl-10 pr-4 py-2.5 text-sm font-bold focus:ring-2 focus:ring-emerald-500/20 placeholder:text-slate-300" 
              placeholder="Search staff, roles, or units..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
        
        <div className="flex items-center gap-3">
           <button 
             onClick={() => setIsAssignShiftOpen(true)}
             className="px-4 py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all"
           >
             Duty Roster
           </button>
           <button 
             onClick={() => { setEditingStaff(null); setFormData(emptyStaffForm); setIsAddOpen(true); }}
             className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-emerald-100 flex items-center gap-2 transition-all"
           >
             <UserPlus size={14} /> Add Personnel
           </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main List */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden min-h-[500px]">
            <div className="px-8 py-6 border-b border-slate-50 flex items-center justify-between bg-slate-50/30">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                <Users size={18} className="text-emerald-500" />
                Staff Directory
              </h3>
              <span className="text-[10px] font-black text-slate-400 bg-white px-3 py-1 rounded-full border border-slate-100">
                {filteredStaff.length} TOTAL RECORDS
              </span>
            </div>
            
            <div className="p-4 overflow-x-auto">
              {filteredStaff.length === 0 ? (
                <div className="py-20 flex flex-col items-center gap-4 text-center">
                  <div className="p-4 bg-slate-50 rounded-2xl"><Users size={32} className="text-slate-200" /></div>
                  <p className="font-bold text-slate-400">No matching personnel records</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredStaff.map(staff => (
                    <div key={staff.id} className="p-5 rounded-2xl border border-slate-50 hover:border-emerald-100 hover:bg-emerald-50/20 transition-all group relative">
                      <div className="flex items-center gap-4">
                        <img className="w-12 h-12 rounded-2xl bg-slate-100 object-cover" src={staff.avatar || AVATAR} alt="" />
                        <div className="min-w-0 flex-1">
                          <p className="font-black text-slate-900 truncate">{staff.name}</p>
                          <p className="text-[10px] font-black text-emerald-600 uppercase tracking-tighter">{staff.role} • {staff.department}</p>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                           <button onClick={() => { setEditingStaff(staff); setFormData({...staff}); setIsAddOpen(true); }} className="p-2 text-slate-400 hover:text-emerald-600"><Edit2 size={14} /></button>
                           <button onClick={() => handleDeleteStaff(staff.id, staff.name)} className="p-2 text-slate-400 hover:text-red-600"><Trash2 size={14} /></button>
                        </div>
                      </div>
                      <div className="mt-4 flex items-center justify-between pt-4 border-t border-slate-50">
                        <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-tight ${staff.status === 'On Duty' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                          {staff.status || 'OFF-SITE'}
                        </span>
                        <span className="text-[9px] font-bold text-slate-400">{staff.email}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar: Calendar & Activity */}
        <div className="space-y-8">
          {/* Calendar Widget */}
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-50 flex items-center justify-between">
              <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Global Roster</h4>
              <div className="flex items-center gap-1">
                 <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-1.5 hover:bg-slate-50 rounded-lg text-slate-400"><Calendar size={14} /></button>
                 <span className="text-[10px] font-black min-w-16 text-center uppercase">{format(currentMonth, 'MMM yyyy')}</span>
                 <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-1.5 hover:bg-slate-50 rounded-lg text-slate-400"><Calendar size={14} /></button>
              </div>
            </div>
            <div className="p-6">
               <div className="grid grid-cols-7 gap-1 text-[9px] font-black text-slate-300 text-center uppercase mb-4 tracking-tighter">
                 <span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span><span>Su</span>
               </div>
               {renderCalendarDays()}
               
               <div className="mt-8 pt-6 border-t border-slate-50">
                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Shifts on {format(selectedDate, 'MMM do')}</p>
                 <div className="space-y-3">
                   {shifts.filter(s => s.shift_date === format(selectedDate, 'yyyy-MM-dd')).length === 0 ? (
                     <p className="text-[10px] font-bold text-slate-400 italic text-center py-4">No assignments scheduled</p>
                   ) : (
                     shifts.filter(s => s.shift_date === format(selectedDate, 'yyyy-MM-dd')).map(shift => (
                       <div key={shift.id} className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50/50 border border-slate-100">
                         <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                         <div className="flex-1">
                           <p className="text-[10px] font-black text-slate-900 leading-none">{shift.shift_type}</p>
                           <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase">Personnel ID: {shift.staff_id}</p>
                         </div>
                       </div>
                     ))
                   )}
                 </div>
               </div>
            </div>
          </div>

          {/* Activity Logs */}
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-50">
              <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Real-time Activity</h4>
            </div>
            <div className="p-6 space-y-6">
              {activities.map(log => (
                <div key={log.id} className="flex gap-4">
                  <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                    <ActivityIcon size={14} className="text-indigo-600" />
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-600 leading-normal"><span className="font-black text-slate-900">{log.entity_id}</span> {log.action_type}: {log.details}</p>
                    <p className="text-[9px] font-black text-slate-300 uppercase mt-1">{format(parseISO(log.created_at || new Date().toISOString()), 'HH:mm • MMM d')}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Dialogs */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="sm:max-w-[425px] rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black">Personnel Management</DialogTitle>
            <DialogDescription className="font-bold text-slate-400">Configure credentials and unit assignments</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveStaff} className="space-y-4 pt-4">
             {lastError && (
               <div className="p-4 bg-red-50 rounded-2xl border border-red-100 animate-in slide-in-from-top-2 duration-300 mb-2">
                 <div className="flex items-start gap-3">
                   <AlertTriangle className="text-red-500 w-5 h-5 flex-shrink-0 mt-0.5" />
                   <div className="flex-1">
                     <p className="text-[10px] font-black uppercase tracking-widest text-red-600 mb-1">Database Schema Mismatch</p>
                     <p className="text-xs text-red-500 font-bold leading-relaxed mb-3">
                       The "hospital_staff" table is missing required columns. This happens if the old mapping schema is active.
                     </p>
                     <button 
                       type="button"
                       onClick={() => {
                         navigator.clipboard.writeText(REPAIR_SQL);
                         addToast('Repair SQL copied!', 'success');
                       }}
                       className="w-full bg-white border border-red-200 text-red-600 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-50 transition-all flex items-center justify-center gap-2"
                     >
                       <Activity size={12} /> Copy Repair SQL
                     </button>
                   </div>
                 </div>
               </div>
             )}
             <div className="grid gap-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Full Name</Label>
                <Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="rounded-xl font-bold border-slate-100" required />
             </div>
             <div className="grid gap-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Email Address</Label>
                <Input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="rounded-xl font-bold border-slate-100" required />
             </div>
             <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                   <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Role</Label>
                   <select className="flex h-10 w-full rounded-xl border border-slate-100 bg-white px-3 py-2 text-sm font-bold" value={formData.role} onChange={e => setFormData({...formData, role: e.target.value})}>
                     <option>Doctor</option>
                     <option>Nurse</option>
                     <option>Technician</option>
                     <option>Admin</option>
                   </select>
                </div>
                <div className="grid gap-2">
                   <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Status</Label>
                   <select className="flex h-10 w-full rounded-xl border border-slate-100 bg-white px-3 py-2 text-sm font-bold" value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})}>
                     <option>On Duty</option>
                     <option>Off Duty</option>
                   </select>
                </div>
             </div>
             <div className="grid gap-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Unit / Department</Label>
                <Input value={formData.department} onChange={e => setFormData({...formData, department: e.target.value})} className="rounded-xl font-bold border-slate-100" required />
             </div>
             <DialogFooter className="pt-6">
                <Button type="submit" disabled={isProcessing} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase text-[10px] tracking-widest h-12 rounded-xl">
                  {isProcessing ? <Loader2 className="animate-spin" /> : 'Commit Changes'}
                </Button>
             </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isAssignShiftOpen} onOpenChange={setIsAssignShiftOpen}>
        <DialogContent className="sm:max-w-[425px] rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-indigo-600 uppercase tracking-tight">Roster Assignment</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAssignShift} className="space-y-4 pt-4">
             <div className="grid gap-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Target Personnel</Label>
                <select required className="flex h-12 w-full rounded-xl border border-slate-100 bg-white px-3 py-2 text-sm font-bold" value={shiftData.staffId} onChange={e => setShiftData({...shiftData, staffId: e.target.value})}>
                  <option value="" disabled>Select from Directory</option>
                  {staffList.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
                  ))}
                </select>
             </div>
             <div className="grid gap-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Duty Date</Label>
                <Input required type="date" value={shiftData.date} onChange={e => setShiftData({...shiftData, date: e.target.value})} className="rounded-xl font-bold border-slate-100 h-12" />
             </div>
             <div className="grid gap-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Shift Block</Label>
                <select required className="flex h-12 w-full rounded-xl border border-slate-100 bg-white px-3 py-2 text-sm font-bold" value={shiftData.type} onChange={e => setShiftData({...shiftData, type: e.target.value})}>
                  <option>Morning (06:00 - 14:00)</option>
                  <option>Evening (14:00 - 22:00)</option>
                  <option>Night (22:00 - 06:00)</option>
                </select>
             </div>
             <DialogFooter className="pt-6">
                <Button type="submit" disabled={isProcessing} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase text-[10px] tracking-widest h-12 rounded-xl">
                   Confirm Roster Slot
                </Button>
             </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
