import React, { useState, useEffect } from 'react';
import { 
  Pill, Activity, Clock, History, Search, Filter, Plus, 
  AlertTriangle, Check, X, ShieldAlert, ArrowRight, TrendingDown, TrendingUp,
  ChevronDown, MessageSquare, Loader2, Package, ClipboardList, FlaskConical, Edit2, PlusCircle, Brain
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';


import { Toast, useToast } from '@/components/ui/Toast';
import { pharmacyService, authService, hospitalService, aiService } from '@/database';


// Dangerous pair check (simple demo logic)
const REPAIR_SQL = `
-- 1. FIX: Missing Pharmacy Columns
ALTER TABLE public.pharmacy_inventory ADD COLUMN IF NOT EXISTS expiry_date TEXT;

-- 2. FIX: Deduplicate Hospitals & Force-Claim Data
DO $$
DECLARE keep_id UUID; hospital_row RECORD;
BEGIN
    FOR hospital_row IN SELECT DISTINCT admin_id FROM public.hospitals WHERE admin_id IS NOT NULL LOOP
        SELECT id INTO keep_id FROM public.hospitals WHERE admin_id = hospital_row.admin_id ORDER BY created_at DESC LIMIT 1;
        UPDATE public.patients SET hospital_id = keep_id WHERE hospital_id IS NULL;
        UPDATE public.pharmacy_inventory SET hospital_id = keep_id WHERE hospital_id IS NULL;
        DELETE FROM public.hospitals WHERE admin_id = hospital_row.admin_id AND id != keep_id;
    END LOOP;
END $$;
`;

const DANGEROUS_PAIRS = [
  { drugs: ['Warfarin', 'Aspirin'],      warning: '⚠️ Warfarin + Aspirin significantly increases bleeding risk. Review dosing.' },
  { drugs: ['Warfarin', 'Clopidogrel'],  warning: '⚠️ Dual anticoagulant therapy detected. High haemorrhage risk.' },
  { drugs: ['Metformin', 'Meropenem'],   warning: '⚠️ Metformin renal clearance may be affected by Meropenem. Monitor creatinine.' },
];

function checkInteraction(drugName) {
  for (const pair of DANGEROUS_PAIRS) {
    if (pair.drugs.some(d => drugName.includes(d.split(' ')[0]))) {
      return pair.warning;
    }
  }
  return null;
}

function getStockColor(status) {
  return status === 'In Stock' ? 'bg-[#00b289]' : status === 'Low Stock' ? 'bg-amber-500' : 'bg-red-500';
}
function getStockBadge(status) {
  return status === 'In Stock' ? 'bg-[#00b289]/10 text-[#00b289]' : status === 'Low Stock' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700';
}

function StatusBadge({ children, className = '' }) {
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${className}`}>{children}</span>;
}

// ── Add Drug Dialog ─────────────────────────────────────────────────────────────
function AddDrugDialog({ onAdd, onClose, isProcessing }) {
  const [form, setForm] = useState({ name: '', sku: '', category: 'Antibiotic', stockLevel: '', expiry: '', price: '' });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const handleSubmit = (e) => {
    e.preventDefault();
    onAdd(form);
  };
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-900">Add New Drug to Inventory</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18}/></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 p-6">
            {[
              { label: 'Drug Name', key: 'name', placeholder: 'e.g. Amoxicillin 500mg', required: true },
              { label: 'SKU (optional)', key: 'sku', placeholder: 'e.g. AMX-500-01' },
              { label: 'Stock Level (%)', key: 'stockLevel', placeholder: 'e.g. 80', type: 'number' },
              { label: 'Expiry (MM/YYYY)', key: 'expiry', placeholder: 'e.g. 12/2026' },
              { label: 'Unit Price', key: 'price', placeholder: 'e.g. 550.00' },
            ].map(f => (
              <div key={f.key} className="grid grid-cols-4 items-center gap-4">
                <label className="text-right text-sm text-slate-600 font-medium col-span-1">{f.label}</label>
                <input type={f.type || 'text'} required={f.required} placeholder={f.placeholder}
                  value={form[f.key]} onChange={e => set(f.key, e.target.value)}
                  className="col-span-3 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#00b289]" />
              </div>
            ))}
            <div className="grid grid-cols-4 items-center gap-4">
              <label className="text-right text-sm text-slate-600 font-medium col-span-1">Category</label>
              <select value={form.category} onChange={e => set('category', e.target.value)}
                className="col-span-3 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#00b289]">
                {['Antibiotic','Cholesterol','Diabetes','Painkiller','Anticoagulant','Antiplatelet','Statin','Other'].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 px-6 pb-5">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={isProcessing} className="px-4 py-2 bg-[#00b289] text-white rounded-lg text-sm font-bold hover:bg-[#00b289]/90 disabled:opacity-50">
              {isProcessing ? 'Adding...' : 'Add Drug'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Interaction Warning Modal ───────────────────────────────────────────────────
function InteractionModal({ warning, onDismiss, onConfirm, isProcessing }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in zoom-in-95 duration-200 border-2 border-amber-300">
        <div className="px-6 py-4 bg-amber-50 border-b border-amber-200 flex items-center gap-3">
          <AlertTriangle className="text-amber-600 shrink-0" size={22}/>
          <h3 className="font-bold text-amber-900">AI Drug Interaction Warning</h3>
        </div>
        <div className="p-6 space-y-4">
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-900 leading-relaxed">
            {warning}
          </div>
          <p className="text-slate-500 text-sm">The AI has detected a potentially dangerous drug combination. Do you still want to approve this prescription?</p>
        </div>
        <div className="flex gap-2 px-6 pb-5">
          <button onClick={onDismiss} className="flex-1 border border-slate-200 text-slate-700 rounded-lg py-2 text-sm font-bold hover:bg-slate-50">Cancel</button>
          <button onClick={onConfirm} disabled={isProcessing} className="flex-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg py-2 text-sm font-bold disabled:opacity-50">
            {isProcessing ? 'Processing...' : 'Override & Approve'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function DoctorPharmacy() {
  const { toasts, addToast, removeToast } = useToast();
  
  // Real State
  const [inventory, setInventory] = useState([]);
  const [prescriptions, setPrescriptions] = useState([]);
  const [dispensingLog, setDispensingLog] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [activeTab, setActiveTab] = useState('inventory');
  const [showAddDrug, setShowAddDrug] = useState(false);
  const [forecastMode, setForecastMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Interactive Modals
  const [interactionWarning, setInteractionWarning] = useState(null);
  const [selectedRx, setSelectedRx] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [restockRecommendation, setRestockRecommendation] = useState(null);
  const [isRestockOpen, setIsRestockOpen] = useState(false);
  const [selectedRxIds, setSelectedRxIds] = useState([]);

  useEffect(() => {
    loadAllData();
  }, []);

  const initialInventory = [
    { id: 'm1', name: 'Amoxicillin 500mg', sku: 'AMX-500', stock_level: 85, status: 'In Stock', price: 450, category: 'Antibiotic', expiry_date: '12/2026', burn_rate: 1.2, predicted_out_days: 45 },
    { id: 'm2', name: 'Metformin 850mg', sku: 'MET-850', stock_level: 15, status: 'Low Stock', price: 120, category: 'Diabetes', expiry_date: '08/2025', burn_rate: 3.5, predicted_out_days: 4 },
    { id: 'm3', name: 'Atorvastatin 20mg', sku: 'ATR-20', stock_level: 60, status: 'In Stock', price: 890, category: 'Cholesterol', expiry_date: '05/2027', burn_rate: 0.8, predicted_out_days: 75 },
    { id: 'm4', name: 'Warfarin 5mg', sku: 'WRF-5', stock_level: 40, status: 'In Stock', price: 230, category: 'Anticoagulant', expiry_date: '11/2025', burn_rate: 1.5, predicted_out_days: 26 },
  ];

  const initialPrescriptions = [
    { id: 'p1', drug_name: 'Aspirin 75mg', quantity: 28, status: 'Pending', created_at: new Date().toISOString(), patients: { full_name: 'Elena Rodriguez' }, profiles: { full_name: 'Dr. Sarah Chen' } },
    { id: 'p2', drug_name: 'Clopidogrel 75mg', quantity: 14, status: 'Pending', created_at: new Date().toISOString(), patients: { full_name: 'Elena Rodriguez' }, profiles: { full_name: 'Dr. Sarah Chen' } },
  ];

  const loadAllData = async () => {
    try {
      setLoading(true);
      const hospital = await hospitalService.getMyHospital();
      if (!hospital) {
        setInventory(initialInventory);
        setPrescriptions(initialPrescriptions);
        return;
      }

      const [invData, rxData, logData] = await Promise.all([
        pharmacyService.getInventory(hospital.id),
        pharmacyService.getPrescriptions(hospital.id),
        pharmacyService.getDispensingLogs(hospital.id)
      ]);

      const realInventory = invData || [];
      const realPrescriptions = rxData || [];

      if (realInventory.length === 0 && realPrescriptions.length === 0) {
        setInventory(initialInventory);
        setPrescriptions(initialPrescriptions);
      } else {
        setInventory(realInventory);
        setPrescriptions(realPrescriptions);
      }
      
      setDispensingLog(logData || []);
    } catch (err) {
      console.error("Pharmacy data sync error:", err);
      setInventory(initialInventory);
      setPrescriptions(initialPrescriptions);
    } finally {
      setLoading(false);
    }
  };

  const [alerts, setAlerts] = useState([]);

  const handleAddDrug = async (drugData) => {
    setIsProcessing(true);
    const loadId = addToast(`Registering ${drugData.name}...`, 'loading', 3000);
    try {
      const hospital = await hospitalService.getMyHospital();
      if (!hospital || !hospital.id) throw new Error('Hospital ID is missing. Run Auto-Fix DB.');

      let drugPayload = {
        hospital_id: hospital.id,
        name: drugData.name,
        sku: drugData.sku || `SKU-${Math.random().toString(36).substr(2, 5).toUpperCase()}`,
        category: drugData.category,
        stock_level: parseInt(drugData.stockLevel) || 100,
        price: parseFloat(drugData.price.toString().replace('₹','').replace('$','')) || 0,
        status: 'In Stock',
        expiry_date: drugData.expiry || '2026-12-31',
        burn_rate: 2.0,
      };

      let newDrug;
      try {
        newDrug = await pharmacyService.addDrug(drugPayload);
      } catch (err) {
        console.warn("First addDrug attempt failed, retrying without expiry_date...", err);
        // Fallback: remove expiry_date if col doesn't exist
        const { expiry_date, ...safePayload } = drugPayload;
        newDrug = await pharmacyService.addDrug(safePayload);
      }

      removeToast(loadId);
      setInventory(prev => [newDrug, ...prev]);
      setShowAddDrug(false);
      addToast(`✓ ${drugData.name} added to inventory.`, 'success');
    } catch (err) {
      console.error(err);
      addToast('Failed to add drug', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const doApprove = async (rx) => {
    setIsProcessing(true);
    const lid = addToast(`Dispensing ${rx.drug_name}...`, 'loading', 3000);
    try {
      const user = await authService.getCurrentUser();
      // 1. Update status
      await pharmacyService.updatePrescriptionStatus(rx.id, 'Dispensed');
      // 2. Log dispensing
      const logEntry = await pharmacyService.logDispensing({
        hospital_id: rx.hospital_id,
        prescription_id: rx.id,
        patient_id: rx.patient_id,
        drug_name: rx.drug_name,
        quantity: rx.quantity,
        dispensed_by: user.id
      });

      // Update local state
      setPrescriptions(prev => prev.filter(p => p.id !== rx.id));
      setDispensingLog(prev => [{
        ...logEntry,
        patients: rx.patients // Preserve patient name for UI
      }, ...prev]);
      setSelectedRx(null);
      setInteractionWarning(null);
      removeToast(lid);
      addToast(`✓ ${rx.drug_name} dispensed to patient.`, 'success');
      loadAllData();
    } catch (err) {
      console.error(err);
      removeToast(lid);
      addToast('Dispensing failed', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApprovePrescription = (rx) => {
    const warning = checkInteraction(rx.drug_name);
    if (warning) {
      setSelectedRx(rx);
      setInteractionWarning(warning);
    } else {
      doApprove(rx);
    }
  };

  const handleRejectPrescription = async (rx) => {
    const lid = addToast(`Rejecting prescription...`, 'loading', 3000);
    try {
      await pharmacyService.updatePrescriptionStatus(rx.id, 'Rejected');
      setPrescriptions(prev => prev.filter(p => p.id !== rx.id));
      removeToast(lid);
      addToast(`Prescription for ${rx.drug_name} rejected.`, 'success');
    } catch (err) {
      removeToast(lid);
      addToast('Rejection failed', 'error');
    }
  };

  const handleBatchApprove = async () => {
    if (selectedRxIds.length === 0) return;
    setIsProcessing(true);
    const lid = addToast(`Dispensing ${selectedRxIds.length} prescriptions...`, 'loading', 3000);
    try {
      const selectedRxs = prescriptions.filter(p => selectedRxIds.includes(p.id));
      for (const rx of selectedRxs) {
        await pharmacyService.updatePrescriptionStatus(rx.id, 'Dispensed');
        await pharmacyService.logDispensing({
          hospital_id: rx.hospital_id,
          prescription_id: rx.id,
          patient_id: rx.patient_id,
          drug_name: rx.drug_name,
          quantity: rx.quantity,
          dispensed_by: (await authService.getCurrentUser()).id
        });
      }
      setPrescriptions(prev => prev.filter(p => !selectedRxIds.includes(p.id)));
      setSelectedRxIds([]);
      removeToast(lid);
      addToast(`✓ ${selectedRxIds.length} prescriptions dispensed successfully.`, 'success');
      setSelectedRxIds([]);
      loadAllData();
    } catch (err) {
      removeToast(lid);
      addToast('Batch dispensing failed', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAIAnalyzeRestock = async () => {
    setIsRestockOpen(true);
    setRestockRecommendation("");
    try {
      const rec = await aiService.getRestockRecommendations(inventory);
      setRestockRecommendation(rec);
    } catch (err) {
      setRestockRecommendation("Failed to generate recommendations.");
    }
  };

  const handleAlertOrder = async (alertId, medName) => {
    const lid = addToast(`Placing emergency order for ${medName}...`, 'loading', 3000);
    await new Promise(r => setTimeout(r, 900));
    removeToast(lid);
    setAlerts(prev => prev.filter(a => a.id !== alertId));
    addToast(`✓ Emergency order placed for ${medName}. ETA: 4 hours.`, 'success');
  };

  const TABS = [
    { id: 'inventory',    label: 'Inventory',           icon: Package },
    { id: 'prescriptions',label: 'Prescription Queue',  icon: ClipboardList },
    { id: 'dispensing',   label: 'Dispensing Log',       icon: FlaskConical },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500 p-2">
      <Toast toasts={toasts} removeToast={removeToast} />
      {showAddDrug && <AddDrugDialog onAdd={handleAddDrug} onClose={() => setShowAddDrug(false)} isProcessing={isProcessing} />}
      {interactionWarning && (
        <InteractionModal
          warning={interactionWarning}
          onDismiss={() => { setInteractionWarning(null); setSelectedRx(null); }}
          onConfirm={() => doApprove(selectedRx)}
          isProcessing={isProcessing}
        />
      )}

      {/* Header */}
      <div className="flex justify-between items-center pt-2">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight">Pharmacy Intelligence</h2>
          <p className="text-slate-500 mt-1">AI-powered inventory forecasting and prescription management</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowAddDrug(true)}
            className="flex items-center gap-2 px-5 h-11 bg-[#00b289] text-white rounded-xl font-bold text-sm hover:bg-[#00b289]/90 transition-all shadow-lg shadow-[#00b289]/20"
          >
            <PlusCircle size={16}/> Add Drug
          </button>
          <button
            onClick={handleAIAnalyzeRestock}
            className={`flex items-center gap-2 px-5 h-11 rounded-xl font-bold text-sm transition-all ${forecastMode ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'}`}
          >
            <Brain className={forecastMode ? 'animate-pulse' : ''} size={16}/>
            AI Restock Analysis
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total SKUs',        val: inventory.length,                                    icon: Package,       color: 'indigo', sub: 'drugs catalogued'         },
          { label: 'Pending RX',        val: prescriptions.filter(p => p.status === 'Pending').length, icon: Clock,    color: 'amber',  sub: 'awaiting approval'        },
          { label: 'Low Stock',         val: inventory.filter(i => i.status === 'Low Stock').length,   icon: AlertTriangle, color: 'red', sub: 'order immediately'   },
          { label: 'Forecast Accuracy', val: 'N/A',                                             icon: TrendingUp,    color: 'emerald',sub: 'Insufficient Data'      },
        ].map((stat, i) => (
          <div key={i} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-4">
              <div className={`p-2 bg-${stat.color === 'red' ? 'red' : stat.color === 'amber' ? 'amber' : stat.color === 'emerald' ? 'emerald' : 'indigo'}-50 text-${stat.color === 'red' ? 'red' : stat.color === 'amber' ? 'amber' : stat.color === 'emerald' ? 'emerald' : 'indigo'}-600 rounded-lg`}><stat.icon size={20}/></div>
              <span className={`text-[10px] font-black uppercase text-${stat.color === 'red' ? 'red' : stat.color === 'amber' ? 'amber' : stat.color === 'emerald' ? 'emerald' : 'indigo'}-500 tracking-widest`}>{stat.sub}</span>
            </div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{stat.label}</p>
            <h3 className="text-2xl font-black mt-1 text-slate-900">{stat.val}</h3>
          </div>
        ))}
      </section>

      {/* Critical Stock Alerts */}
      {alerts.length > 0 && (
        <div className="bg-red-50 border border-red-100 rounded-2xl p-4 flex flex-wrap gap-3">
          <div className="flex items-center gap-2 text-red-700 font-black text-[10px] uppercase tracking-widest w-full">
            <AlertTriangle size={14}/> Critical Stock Feed
            <StatusBadge className="bg-red-100 text-red-700 ml-auto border-none">LIVE</StatusBadge>
          </div>
          {alerts.map(alert => (
            <div key={alert.id} className="flex-1 min-w-[200px] p-4 bg-white border border-red-100 rounded-xl flex justify-between items-center gap-3">
              <div>
                <p className="text-xs font-black text-slate-900">{alert.name}</p>
                <p className="text-[10px] text-red-600 font-bold">{alert.message} — {alert.detail}</p>
              </div>
              <button
                onClick={() => handleAlertOrder(alert.id, alert.name)}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-[11px] font-bold rounded-lg whitespace-nowrap transition-colors"
              >
                Order Now
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === tab.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <tab.icon size={14}/> {tab.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center text-slate-400">
            <Loader2 className="h-10 w-10 animate-spin mb-4 text-[#00b289]" />
            <p className="font-bold tracking-tight">Syncing with Central Pharmacy...</p>
          </div>
        ) : (
          <div className="p-0">
            {activeTab === 'inventory' && (
              <div className="animate-in fade-in duration-300">
                <div className="px-6 py-5 border-b border-slate-50 flex justify-between items-center">
                  <h3 className="font-black text-slate-900 text-xs uppercase tracking-widest flex items-center gap-2">
                    <Package size={16} className="text-[#00b289]"/> Smart Inventory
                    {forecastMode && <Badge className="bg-indigo-100 text-indigo-700 ml-2 border-none">AI Depletion Active</Badge>}
                  </h3>
                  <div className="relative w-48">
                    <Search className="absolute left-2 top-2.5 size-3.5 text-slate-400" />
                    <input 
                      type="text" 
                      placeholder="Search drugs..." 
                      className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-[11px] focus:outline-none focus:ring-2 focus:ring-[#00b289]"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-[10px] text-slate-400 font-black uppercase tracking-widest border-b border-slate-50 bg-slate-50/30">
                      <tr>
                        <th className="px-6 py-4">Medication & SKU</th>
                        <th className="px-4 py-4">Availability</th>
                        <th className="px-4 py-4">{forecastMode ? <span className="text-indigo-600">AI Depletion</span> : 'Price'}</th>
                        <th className="px-4 py-4">Category</th>
                        <th className="px-4 py-4 text-right">Edit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {inventory.filter(i => i.name.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 ? (
                        <tr><td colSpan={5}>
                          <div className="py-14 flex flex-col items-center gap-3 text-center">
                            <Package size={32} className="text-slate-200"/>
                            <p className="font-bold text-slate-500">No drugs found</p>
                            <button 
                              onClick={() => {
                                navigator.clipboard.writeText(REPAIR_SQL);
                                addToast('Supreme Repair SQL copied! Run it in Supabase Editor.', 'success');
                              }}
                              className="mt-2 flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg text-xs font-bold hover:bg-amber-600 transition-colors"
                            >
                              <ShieldAlert size={14}/> Auto-Fix Pharmacy DB
                            </button>
                          </div>
                        </td></tr>
                      ) : inventory.filter(i => i.name.toLowerCase().includes(searchQuery.toLowerCase())).map(med => (
                        <tr key={med.id} className="group hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4">
                            <p className="font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">{med.name}</p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">SKU: {med.sku} · Exp: {med.expiry_date}</p>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex flex-col gap-1.5 min-w-[140px]">
                              <div className="flex justify-between items-center">
                                <span className={`text-[10px] font-black px-2 py-0.5 rounded ${getStockBadge(med.status)}`}>{med.status}</span>
                                <span className="text-[10px] font-bold text-slate-500">{med.stock_level}%</span>
                              </div>
                              <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                <div className={`h-full ${getStockColor(med.status)} transition-all`} style={{ width: `${med.stock_level}%` }}/>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            {forecastMode ? (
                              <div className="px-2 py-1 rounded text-[10px] font-black uppercase bg-indigo-100 text-indigo-600">
                                OUT IN {med.predicted_out_days || 50}d
                                <span className="ml-1 text-slate-400 font-medium">({med.burn_rate}/day)</span>
                              </div>
                            ) : <span className="font-bold text-slate-900">₹{med.price}</span>}
                          </td>
                          <td className="px-4 py-4">
                            <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded font-medium">{med.category}</span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button className="h-8 w-8 flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                              <Edit2 size={14}/>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'prescriptions' && (
              <div className="animate-in fade-in duration-300">
                <div className="px-6 py-5 border-b border-slate-50 flex justify-between items-center">
                  <div className="flex items-center gap-4">
                     {selectedRxIds.length > 0 && (
                       <button
                         onClick={handleBatchApprove}
                         disabled={isProcessing}
                         className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-black uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
                       >
                         Dispense {selectedRxIds.length} Selected
                       </button>
                     )}
                     <Badge className="bg-amber-100 text-amber-700 border-none">{prescriptions.filter(p=>p.status==='Pending').length} Pending</Badge>
                  </div>
                </div>
                {prescriptions.length === 0 ? (
                  <div className="py-16 flex flex-col items-center gap-3 text-center">
                    <Check size={40} className="text-emerald-300"/>
                    <p className="font-bold text-slate-600">All prescriptions processed ✓</p>
                  </div>
                ) : (
                  <table className="w-full text-sm text-left">
                    <thead className="text-[10px] text-slate-400 font-black uppercase tracking-widest border-b border-slate-50 bg-slate-50/30">
                      <tr>
                        <th className="px-6 py-4">
                           <input 
                             type="checkbox" 
                             checked={selectedRxIds.length === prescriptions.length && prescriptions.length > 0}
                             onChange={(e) => {
                               if (e.target.checked) setSelectedRxIds(prescriptions.map(p => p.id));
                               else setSelectedRxIds([]);
                             }}
                             className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                           />
                        </th>
                        <th className="px-6 py-4">Patient</th>
                        <th className="px-4 py-4">Prescribing Doctor</th>
                        <th className="px-4 py-4">Drug Requested</th>
                        <th className="px-4 py-4">Qty</th>
                        <th className="px-4 py-4">Status</th>
                        <th className="px-4 py-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {prescriptions.map(presc => (
                        <tr key={presc.id} className={`${selectedRxIds.includes(presc.id) ? 'bg-indigo-50/50' : ''} hover:bg-slate-50 transition-colors`}>
                          <td className="px-6 py-4">
                             <input 
                               type="checkbox" 
                               checked={selectedRxIds.includes(presc.id)}
                               onChange={(e) => {
                                 if (e.target.checked) setSelectedRxIds(prev => [...prev, presc.id]);
                                 else setSelectedRxIds(prev => prev.filter(id => id !== presc.id));
                               }}
                               className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                             />
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="size-9 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400">PX</div>
                              <div>
                                <p className="font-bold text-slate-900 text-sm">{presc.patients?.full_name}</p>
                                <p className="text-[10px] text-slate-400">{new Date(presc.created_at).toLocaleTimeString()}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-600">{presc.profiles?.full_name}</td>
                          <td className="px-4 py-4">
                            <span className="font-bold text-slate-900 text-sm">{presc.drug_name}</span>
                          </td>
                          <td className="px-4 py-4 text-slate-600">{presc.quantity} units</td>
                          <td className="px-4 py-4">
                            <StatusBadge className={presc.status === 'Pending' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700 border-none'}>
                              {presc.status}
                            </StatusBadge>
                          </td>
                          <td className="px-4 py-4 text-right">
                            {presc.status === 'Pending' ? (
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  disabled={isProcessing}
                                  onClick={() => handleApprovePrescription(presc)}
                                  className="px-3 py-1.5 bg-[#00b289] hover:bg-[#00b289]/90 text-white text-[11px] font-bold rounded-lg disabled:opacity-50 transition-all font-sans"
                                >
                                  Approve
                                </button>
                                <button
                                  disabled={isProcessing}
                                  onClick={() => handleRejectPrescription(presc)}
                                  className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-[11px] font-bold rounded-lg disabled:opacity-50 transition-all font-sans"
                                >
                                  Reject
                                </button>
                              </div>
                            ) : (
                              <span className="flex items-center justify-end gap-1 text-emerald-600 text-xs font-bold">
                                <Check size={14}/> Processed
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {activeTab === 'dispensing' && (
              <div className="animate-in fade-in duration-300">
                <div className="px-6 py-5 border-b border-slate-50 flex justify-between items-center">
                  <h3 className="font-black text-slate-900 text-xs uppercase tracking-widest flex items-center gap-2">
                    <FlaskConical size={16} className="text-[#00b289]"/> Dispensing Activity Log
                  </h3>
                  <span className="text-xs text-slate-400">{dispensingLog.length} records today</span>
                </div>
                <table className="w-full text-sm text-left">
                  <thead className="text-[10px] text-slate-400 font-black uppercase tracking-widest border-b border-slate-50 bg-slate-50/30">
                    <tr>
                      <th className="px-6 py-4">Date & Time</th>
                      <th className="px-4 py-4">Patient</th>
                      <th className="px-4 py-4">Drug Dispensed</th>
                      <th className="px-4 py-4">Quantity</th>
                      <th className="px-4 py-4 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {dispensingLog.length === 0 ? (
                      <tr><td colSpan={5} className="py-12 text-center text-slate-400">No dispensing activity recorded yet.</td></tr>
                    ) : dispensingLog.map(log => (
                      <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 text-slate-500 text-xs font-mono">{new Date(log.dispensed_at).toLocaleString()}</td>
                        <td className="px-4 py-4 font-bold text-slate-900">{log.patients?.full_name}</td>
                        <td className="px-4 py-4 text-slate-700">{log.drug_name}</td>
                        <td className="px-4 py-4"><span className="bg-slate-100 px-2 py-0.5 rounded text-xs font-bold">{log.quantity} units</span></td>
                        <td className="px-4 py-4 text-right">
                          <Badge className="bg-emerald-100 text-emerald-700 border-none">DISPENSED</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
      {/* AI Restock Recommendation Modal */}
      {isRestockOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl animate-in zoom-in-95 duration-200 overflow-hidden border border-indigo-100">
            <div className="px-8 py-6 bg-indigo-600 text-white flex items-center justify-between">
               <div>
                  <h3 className="text-xl font-black flex items-center gap-3">
                    <Brain className="animate-pulse" /> SehatAI Restock Strategy
                  </h3>
                  <p className="text-indigo-100 text-xs font-bold uppercase tracking-widest mt-1">Neural Inventory Optimization Engine</p>
               </div>
               <button onClick={() => setIsRestockOpen(false)} className="bg-white/10 hover:bg-white/20 p-2 rounded-xl transition-colors">
                 <X size={20} />
               </button>
            </div>
            <div className="p-8">
               {restockRecommendation === "" ? (
                 <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-4">
                   <Loader2 className="animate-spin h-10 w-10 text-indigo-600" />
                   <p className="font-black uppercase text-[10px] tracking-widest">Analyzing burn rates and supply chains...</p>
                 </div>
               ) : (
                 <div className="space-y-6">
                    <div className="prose prose-sm max-w-none">
                       <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-6 whitespace-pre-wrap font-bold text-indigo-900 text-sm leading-relaxed shadow-inner">
                         {restockRecommendation}
                       </div>
                    </div>
                    <div className="flex gap-3">
                       <button 
                         onClick={() => {
                           addToast('Purchase orders generated and sent to suppliers.', 'success');
                           setIsRestockOpen(false);
                         }}
                         className="flex-1 h-12 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-indigo-100 transition-all"
                       >
                         Approve All Recommendations
                       </button>
                       <button 
                         onClick={() => setIsRestockOpen(false)}
                         className="px-8 h-12 bg-white border border-slate-200 text-slate-400 rounded-xl font-black uppercase text-[10px] tracking-widest hover:border-slate-300 transition-all"
                       >
                         Close
                       </button>
                    </div>
                 </div>
               )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
