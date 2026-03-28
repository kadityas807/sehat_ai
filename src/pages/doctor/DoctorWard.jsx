import React, { useState, useEffect } from 'react';
import { BedDouble, User, Activity, AlertTriangle, CheckCircle2, Clock, Loader2, ChevronRight, Building2, X } from 'lucide-react';
import { Toast, useToast } from '@/components/ui/Toast';
import { hospitalService, patientService, authService } from '@/database';

export default function DoctorWard() {
  const { toasts, addToast, removeToast } = useToast();
  const [wards, setWards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [patients, setPatients] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [assignmentModal, setAssignmentModal] = useState(null); // { wardId, bedId }
  const [transferModal, setTransferModal] = useState(null);     // { fromBedId, patientId, wardName, bedNumber }
  const [lastError, setLastError] = useState(null);

  const REPAIR_SQL = `-- Fix Ward & Bed infrastructure
CREATE TABLE IF NOT EXISTS public.wards (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  hospital_id UUID REFERENCES public.hospitals(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  floor INTEGER,
  type TEXT CHECK (type IN ('ICU', 'ER', 'General', 'Maternity', 'Post-Op', 'Pediatrics', 'Specialized', 'Emergency')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.beds (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ward_id UUID REFERENCES public.wards(id) ON DELETE CASCADE,
  bed_number TEXT NOT NULL,
  status TEXT DEFAULT 'available' CHECK (status IN ('available', 'occupied', 'maintenance')),
  patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.wards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beds ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Wards viewable by authenticated users" ON public.wards;
CREATE POLICY "Wards viewable by authenticated users" ON public.wards FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Wards manageable by admins" ON public.wards;
CREATE POLICY "Wards manageable by admins" ON public.wards FOR ALL USING (EXISTS (SELECT 1 FROM public.hospitals WHERE id = hospital_id AND admin_id = auth.uid()));

DROP POLICY IF EXISTS "Beds viewable by authenticated users" ON public.beds;
CREATE POLICY "Beds viewable by authenticated users" ON public.beds FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Beds manageable by admins" ON public.beds;
CREATE POLICY "Beds manageable by admins" ON public.beds FOR ALL USING (EXISTS (SELECT 1 FROM public.wards JOIN public.hospitals ON wards.hospital_id = hospitals.id WHERE wards.id = ward_id AND admin_id = auth.uid()));`;

  useEffect(() => {
    loadData();

    let subscription;
    const setupRealtime = async () => {
      const hospital = await hospitalService.getMyHospital();
      if (!hospital) return;

      subscription = hospitalService.subscribeToBeds(hospital.id, (payload) => {
        if (payload.eventType === 'UPDATE') {
          loadData();
        }
      });
    };

    setupRealtime();
    return () => { if (subscription) subscription.unsubscribe(); };
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const user = await authService.getCurrentUser();
      if (!user) return;

      const hospital = await hospitalService.getMyHospital();
      if (!hospital) return;

      const [wardData, patientData] = await Promise.all([
        hospitalService.getWards(hospital.id),
        patientService.getPatients(hospital.id)
      ]);

      setWards(wardData);
      setPatients(patientData);
    } catch (err) {
      console.error("Ward Sync Error:", err);
      setLastError(err.message || String(err));
      addToast('Failed to sync ward data', 'error');
    } finally {
      setLoading(false);
    }
  };

    const MOCK_WARDS = [
    {
      id: 'mock-icu',
      name: 'ICU Main Unit',
      beds: [
        { id: 'm1', bed_number: '101', status: 'occupied', patients: { full_name: 'Elena Rodriguez' } },
        { id: 'm2', bed_number: '102', status: 'available' },
        { id: 'm3', bed_number: '103', status: 'occupied', patients: { full_name: 'Robert Fox' } },
        { id: 'm4', bed_number: '104', status: 'available' },
      ]
    },
    {
      id: 'mock-gen',
      name: 'General Ward A',
      beds: [
        { id: 'm5', bed_number: '201', status: 'available' },
        { id: 'm6', bed_number: '202', status: 'occupied', patients: { full_name: 'Mark Thompson' } },
        { id: 'm7', bed_number: '203', status: 'available' },
        { id: 'm8', bed_number: '204', status: 'available' },
      ]
    }
  ];

  const displayWards = wards.length > 0 ? wards : MOCK_WARDS;
  const isMock = wards.length === 0;

  // Flatten all beds for stats
  const allBeds = displayWards.flatMap(w => w.beds || []);
  const stats = {
    total: allBeds.length,
    available: allBeds.filter(b => b.status === 'available').length,
    occupied: allBeds.filter(b => b.status === 'occupied').length,
    maintenance: allBeds.filter(b => b.status === 'maintenance').length
  };

  const handleBedClick = (wardId, bedId) => {
    if (isMock) {
      addToast('System is in Demo Mode. Use "Quick Setup" to enable real bed management.', 'info');
      return;
    }
    setAssignmentModal({ wardId, bedId });
  };

  const assignPatientToBed = async (bedId, patientId, patientName) => {
    if (isMock) return;
    setIsProcessing(true);
    const lid = addToast(`Assigning Bed to ${patientName}...`, 'loading', 3000);
    setLastError(null);
    try {
      await hospitalService.updateBedStatus(bedId, 'occupied', patientId);
      removeToast(lid);
      await loadData();
      addToast(`✓ Bed assigned to ${patientName}.`, 'success');
      setAssignmentModal(null);
    } catch (err) {
      console.error('Assignment error:', err);
      const msg = err.message || JSON.stringify(err);
      setLastError(`ASSIGNMENT FAILED: ${msg}`);
      removeToast(lid);
      addToast('Assignment failed. Run SQL fix if column/permission error.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleTransfer = async (fromBedId, toBedId, patientId, patientName) => {
    if (isMock) return;
    setIsProcessing(true);
    const lid = addToast(`Transferring ${patientName}...`, 'loading', 3000);
    try {
      // 1. Mark old bed as available
      await hospitalService.updateBedStatus(fromBedId, 'available', null);
      // 2. Mark new bed as occupied
      await hospitalService.updateBedStatus(toBedId, 'occupied', patientId);
      
      removeToast(lid);
      await loadData();
      addToast(`✓ ${patientName} transferred successfully.`, 'success');
      setTransferModal(null);
    } catch (err) {
      removeToast(lid);
      addToast('Transfer failed', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const dischargePatient = async (wardId, bedId, patientName) => {
    if (isMock) {
      addToast('Discharge simulated (Demo Mode)', 'success');
      return;
    }
    setIsProcessing(true);
    const lid = addToast(`Processing discharge for ${patientName}...`, 'loading', 3000);
    try {
      await hospitalService.updateBedStatus(bedId, 'available', null);
      removeToast(lid);
      await loadData();
      addToast(`✓ ${patientName} discharged. Bed is now available.`, 'success');
    } catch (err) {
      removeToast(lid);
      addToast('Discharge failed', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleQuickSetup = async () => {
    setIsProcessing(true);
    const lid = addToast('Bootstrapping Clinic Infrastructure...', 'loading', 3000);
    try {
      const hospital = await hospitalService.getMyHospital();
      if (!hospital) {
        throw new Error('Hospital context not found. Please ensure you are logged in and your clinic is registered.');
      }
      
      await hospitalService.seedHospitalInfrastructure(hospital.id);
      await loadData();
      removeToast(lid);
      addToast('✓ Infrastructure created! ICU and General Wards are ready.', 'success');
      setLastError(null);
    } catch (err) {
      console.error(err);
      const msg = err.message || 'Unknown database error';
      setLastError(msg);
      addToast('Setup failed. Check the error in the box below.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const repairDatabase = () => {
    navigator.clipboard.writeText(REPAIR_SQL);
    addToast('Supreme Repair SQL copied to clipboard!', 'success');
  };

  if (loading) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center text-slate-400">
        <Loader2 className="h-12 w-12 animate-spin mb-4 text-[#00b289]" />
        <p className="font-bold text-lg tracking-tight">Synchronizing Ward Infrastructure...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-2 animate-in fade-in duration-500">
      <Toast toasts={toasts} removeToast={removeToast} />
      
      {/* Header */}
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            Hospital Ward Management
            {isMock && (
              <span className="text-[10px] px-2 py-0.5 rounded-full border border-amber-200 bg-amber-50 text-amber-600 uppercase font-black">Demo Mode</span>
            )}
          </h2>
          <p className="text-slate-500 mt-1">Real-time occupancy tracking across ICU, General, and Special care units</p>
        </div>
        
        {isMock && (
          <button 
            onClick={handleQuickSetup}
            disabled={isProcessing}
            className="px-6 py-2.5 bg-[#00b289] text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:shadow-lg transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2"
          >
            <Activity size={14} /> Quick Setup Infrastructure
          </button>
        )}
      </div>

      {/* Summary Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[
          { label: 'Total Capacity', val: stats.total,       icon: BedDouble,     color: 'indigo' },
          { label: 'Available Beds', val: stats.available,   icon: CheckCircle2,  color: 'emerald' },
          { label: 'Current Census', val: stats.occupied,    icon: Clock,         color: 'amber' },
          { label: 'Maintenance',   val: stats.maintenance,  icon: AlertTriangle, color: 'red' },
        ].map((s, i) => (
          <div key={i} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm transition-transform hover:scale-[1.01]">
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-xl bg-${s.color === 'emerald' ? 'emerald' : s.color === 'amber' ? 'amber' : s.color === 'red' ? 'red' : 'indigo'}-50 text-${s.color === 'emerald' ? 'emerald' : s.color === 'amber' ? 'amber' : s.color === 'red' ? 'red' : 'indigo'}-600`}>
                <s.icon className="h-6 w-6" />
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{s.label}</p>
                <h3 className="text-2xl font-black mt-0.5 text-slate-900">{s.val}</h3>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Setup Error Box (Always show if error exists) */}
      {lastError && (
        <div className="p-6 bg-red-50 border border-red-100 rounded-2xl animate-in slide-in-from-top-4 duration-500">
          <div className="flex items-start gap-4">
             <div className="p-3 bg-red-100 rounded-2xl text-red-600">
                <AlertTriangle size={24} />
             </div>
             <div className="flex-1">
                <h3 className="text-lg font-black text-red-900 mb-1">Database Sync Error</h3>
                <p className="text-sm font-medium text-red-600 mb-4">{lastError}</p>
                <div className="flex flex-wrap gap-3">
                   <button 
                    onClick={repairDatabase}
                    className="bg-white border border-red-200 text-red-600 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-50 transition-all flex items-center gap-2 shadow-sm"
                   >
                     <Activity size={14} /> Copy Supreme Repair SQL
                   </button>
                   <button 
                    onClick={loadData}
                    className="bg-red-600 text-white px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-700 transition-all flex items-center gap-2 shadow-sm"
                   >
                     <Clock size={14} /> Retry Sync
                   </button>
                   <button onClick={() => setLastError(null)} className="px-5 py-2.5 text-[10px] text-slate-400 uppercase font-black hover:text-slate-600 transition-colors">Dismiss</button>
                </div>
             </div>
          </div>
        </div>
      )}

      {/* Wards Display */}
      {displayWards.map(ward => (
        <div key={ward.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-8">
          <div className="px-6 py-5 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-3">
              <span className="p-1.5 bg-white rounded-lg shadow-sm"><Building2 size={16} className="text-[#00b289]" /></span>
              {ward.name}
              <span className="text-[10px] text-slate-400 font-bold ml-2">({ward.beds?.length || 0} BEDS)</span>
            </h3>
            <span className={`px-3 py-1 text-[10px] font-black rounded-full uppercase tracking-tighter ${
              (ward.beds?.filter(b=>b.status==='occupied').length / (ward.beds?.length || 1)) > 0.8 
              ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
            }`}>
              {Math.round((ward.beds?.filter(b=>b.status==='occupied').length / (ward.beds?.length || 1)) * 100)}% OCCUPANCY
            </span>
          </div>
          
          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {(ward.beds || []).map((bed) => {
              if (bed.status === 'occupied') {
                const patientData = bed.patients;
                const p = Array.isArray(patientData) ? patientData[0] : patientData;
                return (
                  <div key={bed.id} className="bg-white rounded-xl border border-slate-200 p-5 group hover:border-[#00b289]/40 transition-all shadow-sm">
                    <div className="flex justify-between items-center mb-5">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Bed {bed.bed_number}</span>
                      <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-pulse"></span>
                    </div>
                    <div className="flex items-center gap-4 mb-5">
                      <div className="h-10 w-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400 font-bold text-xs uppercase">
                        {p?.full_name?.split(' ').map(n=>n[0]).join('')}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-slate-900 truncate">{p?.full_name || 'Anonymous'}</p>
                        <p className="text-[10px] font-black text-[#00b289] uppercase tracking-tighter">Under Care</p>
                      </div>
                    </div>
                    <div className="pt-4 border-t border-slate-50 flex gap-2">
                       <button 
                         disabled={isProcessing}
                         onClick={() => {
                           if (isMock) { addToast('Transfer simulated (Demo Mode)', 'info'); return; }
                           setTransferModal({ fromBedId: bed.id, patientId: p.id, wardName: ward.name, bedNumber: bed.bed_number, patientName: p.full_name });
                         }}
                         className="flex-1 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[10px] font-black uppercase rounded-lg transition-all border border-indigo-100"
                       >
                         Transfer
                       </button>
                       <button 
                         disabled={isProcessing}
                         onClick={() => dischargePatient(ward.id, bed.id, p?.full_name || 'Patient')}
                         className="flex-1 py-1.5 bg-slate-50 hover:bg-red-50 hover:text-red-600 text-[10px] font-black uppercase rounded-lg transition-all border border-slate-100"
                       >
                         Discharge
                       </button>
                    </div>
                  </div>
                );
              }

              if (bed.status === 'available') {
                return (
                  <button 
                    key={bed.id}
                    disabled={isProcessing}
                    onClick={() => handleBedClick(ward.id, bed.id)} 
                    className="bg-emerald-50/30 border-2 border-dashed border-emerald-100 rounded-xl p-8 flex flex-col items-center justify-center text-center group hover:bg-emerald-50 hover:border-emerald-200 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <BedDouble className="h-10 w-10 text-emerald-200 group-hover:text-emerald-400 mb-3 transition-colors" />
                    <span className="text-xs font-black text-slate-900 uppercase tracking-widest">Bed {bed.bed_number}</span>
                    <span className="text-[9px] font-black text-emerald-600 mt-2 uppercase">Assign Patient</span>
                  </button>
                );
              }

              return (
                <div key={bed.id} className="bg-slate-50 rounded-xl border border-slate-200 p-8 flex flex-col items-center justify-center text-center opacity-50 grayscale">
                  <AlertTriangle className="h-10 w-10 text-slate-300 mb-3" />
                  <span className="text-xs font-black text-slate-900 uppercase tracking-widest">Bed {bed.bed_number}</span>
                  <span className="text-[9px] font-black text-slate-500 mt-2 uppercase">Maintenance</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {/* Assignment Modal */}
      {assignmentModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-bold text-slate-900">Assign Patient to Bed</h3>
              <button onClick={() => setAssignmentModal(null)} className="text-slate-400 hover:text-slate-600"><X size={18}/></button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-500">Select a patient for immediate ward placement.</p>
              
              {lastError && (
                <div className="p-3 bg-red-50 border border-red-100 rounded-xl mb-4">
                    <p className="text-[10px] font-black text-red-600 uppercase mb-2">Error during assignment:</p>
                    <pre className="text-[9px] font-mono text-red-800 whitespace-pre-wrap break-all">{lastError}</pre>
                    <button 
                        onClick={repairDatabase}
                        className="mt-3 w-full py-2 bg-red-600 text-white rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-red-700 transition-colors flex items-center justify-center gap-2 animate-pulse"
                    >
                        <Activity size={12} /> Get Global Repair SQL
                    </button>
                </div>
              )}

              <div className="max-h-[300px] overflow-y-auto space-y-2 pr-2">
                {patients.filter(p => !allBeds.some(b => b.patient_id === p.id)).map(p => (
                  <button 
                    key={p.id}
                    disabled={isProcessing}
                    onClick={() => assignPatientToBed(assignmentModal.bedId, p.id, p.full_name)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:border-[#00b289] hover:bg-emerald-50 text-left transition-all group disabled:opacity-50"
                  >
                    <div className="h-8 w-8 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400 group-hover:bg-white transition-colors">
                      <User size={16} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900">{p.full_name}</p>
                      <p className="text-[10px] font-black text-slate-400 uppercase">ID: {p.external_id || 'PX-XXXX'}</p>
                    </div>
                    <ChevronRight size={14} className="ml-auto text-slate-300 group-hover:text-[#00b289]" />
                  </button>
                ))}
                {patients.filter(p => !allBeds.some(b => b.patient_id === p.id)).length === 0 && (
                  <div className="py-12 text-center space-y-4">
                    <div className="p-4 bg-slate-50 rounded-full w-16 h-16 mx-auto flex items-center justify-center">
                        <User size={32} className="text-slate-200" />
                    </div>
                    <div>
                        <p className="text-sm font-black text-slate-500 uppercase tracking-widest">No candidates</p>
                        <p className="text-[10px] text-slate-400 mt-1 max-w-[180px] mx-auto">Either all patients are admitted or none match your clinic's registration.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Transfer Modal */}
      {transferModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-bold text-slate-900">Transfer {transferModal.patientName}</h3>
              <button onClick={() => setTransferModal(null)} className="text-slate-400 hover:text-slate-600"><X size={18}/></button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-500">Current Placement: {transferModal.wardName} - Bed {transferModal.bedNumber}</p>
              <div className="max-h-[300px] overflow-y-auto space-y-2 pr-2">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Target Destinatons</p>
                {wards.map(w => (
                  <div key={w.id} className="space-y-1 mb-4">
                    <p className="text-[10px] font-black text-[#00b289] px-2">{w.name}</p>
                    {w.beds?.filter(b => b.status === 'available').map(bed => (
                      <button 
                        key={bed.id}
                        onClick={() => handleTransfer(transferModal.fromBedId, bed.id, transferModal.patientId, transferModal.patientName)}
                        className="w-full flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:border-indigo-500 hover:bg-indigo-50 text-left transition-all"
                      >
                         <BedDouble size={16} className="text-slate-300" />
                         <p className="text-sm font-bold text-slate-900 text-center">Transfer to Bed {bed.bed_number}</p>
                         <ChevronRight size={14} className="ml-auto text-slate-300" />
                      </button>
                    ))}
                  </div>
                ))}
                {allBeds.filter(b => b.status === 'available').length === 0 && (
                   <div className="py-8 text-center space-y-2">
                      <AlertTriangle className="mx-auto text-amber-500" size={24} />
                      <p className="text-sm font-bold text-slate-500 italic">Hospital is at full capacity. No beds available for transfer.</p>
                   </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
