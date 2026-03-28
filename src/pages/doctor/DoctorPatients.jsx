import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Heart, Search, Filter, Plus, Activity, FileText, Ambulance, Trash2, Brain, ShieldAlert, TrendingUp } from 'lucide-react';
import { Input } from '@/components/ui/input';
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useAuth } from '@/contexts/AuthContext';
import { patientService } from '@/database/patientService';
import { hospitalService } from '@/database/hospitalService';

const initialPatients = [
  { id: 1, name: 'Eleanor Vance', age: 78, status: 'Critical', lastActive: '2 mins ago', condition: 'Arrhythmia', hr: 110, bp: '145/90', riskScore: 92, aiNotes: 'Sustained tachycardia detected.', ambulanceStatus: 'En Route', risks: { sepsis: 12, cardiac: 88, respiratory: 15 } },
  { id: 2, name: 'Robert Ford', age: 82, status: 'Inactive', lastActive: '49 hours ago', condition: 'Hypertension', hr: 72, bp: '130/85', riskScore: 85, aiNotes: 'No vitals logged for 48h.', ambulanceStatus: 'None', risks: { sepsis: 45, cardiac: 62, respiratory: 40 } },
  { id: 3, name: 'Martha Wayne', age: 65, status: 'Stable', lastActive: '1 hour ago', condition: 'Post-op Recovery', hr: 68, bp: '118/75', riskScore: 24, aiNotes: 'Recovery progressing normally.', ambulanceStatus: 'None', risks: { sepsis: 0.5, cardiac: 12, respiratory: 2 } },
  { id: 4, name: 'John Doe', age: 71, status: 'Stable', lastActive: '3 hours ago', condition: 'Diabetes Type 2', hr: 75, bp: '122/80', riskScore: 35, aiNotes: 'Blood glucose levels stable.', ambulanceStatus: 'None', risks: { sepsis: 5, cardiac: 18, respiratory: 8 } },
  { id: 5, name: 'Alice Smith', age: 88, status: 'Warning', lastActive: '12 hours ago', condition: 'Heart Failure', hr: 95, bp: '135/88', riskScore: 78, aiNotes: 'Missed medication for 3 days.', ambulanceStatus: 'None', risks: { sepsis: 15, cardiac: 72, respiratory: 35 } },
  { id: 6, name: 'James Wilson', age: 62, status: 'Stable', lastActive: '5 mins ago', condition: 'Asthma', hr: 82, bp: '120/80', riskScore: 15, aiNotes: 'SpO2 drops detected during sleep.', ambulanceStatus: 'None', risks: { sepsis: 2, cardiac: 5, respiratory: 68 } },
];

export default function DoctorPatients() {
  const { user } = useAuth();
  const [patients, setPatients] = useState(initialPatients);
  const [hospitalId, setHospitalId] = useState(null);
  const [isMocking, setIsMocking] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  React.useEffect(() => {
    const initPortal = async () => {
      if (!user?.id) return;
      try {
        const hospital = await hospitalService.getMyHospital();
        if (hospital) {
          setHospitalId(hospital.id);

          const data = await patientService.getPatients(hospital.id);
          const realPatients = data ? data.map(p => ({
            id: p.id,
            name: p.full_name || 'Unknown Patient',
            age: p.age || 45,
            status: p.status || 'Stable',
            lastActive: p.last_active || 'Just now',
            condition: p.condition || 'Observation',
            hr: p.hr || 75,
            bp: p.bp || '120/80',
            riskScore: p.risk_score || (p.status === 'Critical' ? 85 : 25),
            aiNotes: p.ai_notes || 'Vitals stable.',
            risks: p.risks || { sepsis: 5, cardiac: 10, respiratory: 5 }
          })) : [];

          const uniqueMockPatients = initialPatients.filter(
            mock => !realPatients.some(real => real.name === mock.name)
          );

          setPatients([...realPatients, ...uniqueMockPatients]);
          setIsMocking(realPatients.length === 0);
        }
      } catch (err) {
        console.error("Failed to initialize doctor portal:", err);
        setPatients(initialPatients);
        setIsMocking(true);
      }
    };
    initPortal();
  }, [user]);


  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [predictionMode, setPredictionMode] = useState(false);
  
  // New Patient Form State
  const [newName, setNewName] = useState("");
  const [newAge, setNewAge] = useState("");
  const [newCondition, setNewCondition] = useState("");
  
  const handleAddPatient = async (e) => {
    e.preventDefault();
    if (!newName) return;

    // hospitalId is set in initPortal via hospitalService.getMyHospital()
    if (!hospitalId) {
      console.error('Hospital not loaded yet — cannot add patient');
      return;
    }
    
    const newPatientData = {
      full_name: newName,
      age: parseInt(newAge) || 45,
      status: 'Stable',
      last_active: 'Just now',
      condition: newCondition || 'Under Observation',
      hr: Math.floor(Math.random() * (90 - 60 + 1) + 60), 
      bp: '120/80', 
      riskScore: Math.floor(Math.random() * (40 - 10 + 1) + 10), 
      aiNotes: 'New patient added. Baseline vitals recorded.',
      risks: { sepsis: Math.floor(Math.random() * 20), cardiac: Math.floor(Math.random() * 20), respiratory: Math.floor(Math.random() * 20) }
    };

    try {
      const addedPatient = await patientService.addPatient({
        ...newPatientData,
        hospital_id: hospitalId  // use state, always a valid UUID
      });

      const mapped = {
        id: addedPatient?.id || Date.now(),
        name: newPatientData.full_name,
        ...newPatientData
      };

      setPatients([mapped, ...patients]);
      if (addedPatient) setIsMocking(false);
    } catch (e) {
      console.error('Failed to add patient to Supabase', e);
      // Fallback to local only for demo
      setPatients([{ id: Date.now(), name: newName, ...newPatientData }, ...patients]);
    }
    
    setIsDialogOpen(false);
    setNewName("");
    setNewAge("");
    setNewCondition("");
  };


  const removePatient = async (id) => {
    try {
      if (typeof id === 'string' && id.length > 10) { // Likely a UUID
        await patientService.deletePatient(id);
      }
      setPatients(patients.filter(p => p.id !== id));
    } catch (e) {
      console.error('Failed to remove patient', e);
    }
  };

  return (
    <div className="flex-1 space-y-6 p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <div className="flex flex-col">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
            My Patients
            <Badge variant="outline" className="text-[10px] uppercase tracking-tighter border-indigo-200 text-indigo-600 bg-indigo-50">AI Predictive Engine Active</Badge>
          </h2>
          <p className="text-slate-500 text-sm mt-1">Autonomous 72h risk forecasting for cardiac and sepsis events.</p>
        </div>
        <div className="flex items-center space-x-2">
          <Button 
            onClick={() => setPredictionMode(!predictionMode)}
            variant={predictionMode ? "default" : "outline"} 
            className={predictionMode ? "bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-100" : "border-slate-200"}
          >
            <Brain className="mr-2 h-4 w-4" /> 
            {predictionMode ? "Hide 72h Forecast" : "Show 72h Forecast"}
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-[#00b289] hover:bg-[#00b289]/90 text-white shadow-lg shadow-[#00b289]/10">
                <Plus className="mr-2 h-4 w-4" /> Add Patient
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Add New Patient</DialogTitle>
                <DialogDescription>
                  Enter the patient's details here to add them to your roster.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleAddPatient}>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="name" className="text-right text-slate-700">Name</Label>
                    <Input id="name" value={newName} onChange={(e) => setNewName(e.target.value)} className="col-span-3 border-slate-200" placeholder="e.g. Jane Doe" required />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="age" className="text-right text-slate-700">Age</Label>
                    <Input id="age" type="number" value={newAge} onChange={(e) => setNewAge(e.target.value)} className="col-span-3 border-slate-200" placeholder="e.g. 45" />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="condition" className="text-right text-slate-700">Condition</Label>
                    <Input id="condition" value={newCondition} onChange={(e) => setNewCondition(e.target.value)} className="col-span-3 border-slate-200" placeholder="e.g. Routine Checkup" />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} className="border-slate-200 hover:bg-slate-50">Cancel</Button>
                  <Button type="submit" className="bg-[#00b289] hover:bg-[#00b289]/90 text-white">Save Patient</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-3 border-b border-slate-100 bg-slate-50/30">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Assigned Patients</CardTitle>
              <CardDescription>Live health telemetry and neural-linked risk assessment.</CardDescription>
            </div>
            <div className="flex items-center space-x-2">
              <div className="relative w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                <Input 
                  type="search" 
                  placeholder="Search ID or name..." 
                  className="pl-9 h-9 border-slate-200 text-xs" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Button 
                variant={statusFilter !== 'All' ? 'default' : 'outline'} 
                size="icon" 
                className={`h-9 w-9 ${statusFilter !== 'All' ? 'bg-indigo-600 hover:bg-indigo-700 text-white' : 'border-slate-200'} `}
                onClick={() => {
                  const filters = ['All', 'Critical', 'Warning', 'Stable'];
                  const currentIndex = filters.indexOf(statusFilter);
                  const nextIndex = (currentIndex + 1) % filters.length;
                  setStatusFilter(filters[nextIndex]);
                }}
              >
                <Filter className={`h-4 w-4 ${statusFilter !== 'All' ? 'text-white' : 'text-slate-500'}`} />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-[10px] text-slate-400 uppercase bg-slate-50/50 border-b font-black tracking-widest">
                <tr>
                  <th className="px-6 py-4 font-bold">Patient Roster</th>
                  <th className="px-4 py-4 font-bold">Health Status & AI Insights</th>
                  <th className="px-4 py-4 font-bold">Vitals Pulse</th>
                  {predictionMode ? (
                    <th className="px-4 py-4 font-bold text-center bg-indigo-50/30 text-indigo-600">72h AI Risk Prediction</th>
                  ) : (
                    <th className="px-4 py-4 font-bold">Aggregate Risk</th>
                  )}
                  <th className="px-4 py-4 font-bold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {patients
                  .filter(patient => {
                    const matchesSearch = String(patient.name || patient.id || '').toLowerCase().includes(searchQuery.toLowerCase());
                    const matchesStatus = statusFilter === "All" || patient.status === statusFilter;
                    return matchesSearch && matchesStatus;
                  })
                  .map((patient) => (
                  <tr key={patient.id} className="group hover:bg-slate-50/80 transition-all duration-200">
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-3">
                        <div className={`size-10 rounded-full flex items-center justify-center font-bold text-xs ${patient.status === 'Critical' ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-500'}`}>
                          {(patient.name || 'P').split(' ').map(n=>n[0]).join('')}
                        </div>
                        <div>
                          <div className="font-bold text-slate-900 group-hover:text-indigo-600 transition-colors uppercase text-[13px] tracking-tight">{patient.name || 'Unknown Patient'}</div>
                          <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{patient.age}y • ID: PX-{String(patient.id || '????').slice(-4)}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-5">
                      <div className="font-bold text-slate-700 text-xs">{patient.condition}</div>
                      <div className="text-[11px] text-slate-500 mt-1.5 flex items-center bg-white border border-slate-100 rounded-md px-2 py-1 w-fit shadow-sm">
                        <Activity className="h-3 w-3 mr-2 text-[#00b289]" /> {patient.aiNotes}
                      </div>
                    </td>
                    <td className="px-4 py-5">
                      <div className="flex items-center space-x-3">
                        <div className="flex flex-col">
                          <span className="text-[9px] font-black text-slate-400 uppercase">Heart Rate</span>
                          <span className={`text-sm font-black flex items-center ${patient.hr > 100 ? 'text-red-600' : 'text-slate-900'}`}>
                            <Heart className={`mr-1.5 h-3 w-3 ${patient.hr > 100 ? 'animate-pulse' : ''}`} fill="currentColor" /> {patient.hr} <span className="text-[10px] font-medium ml-0.5">bpm</span>
                          </span>
                        </div>
                        <div className="h-6 w-px bg-slate-100"></div>
                        <div className="flex flex-col">
                          <span className="text-[9px] font-black text-slate-400 uppercase">Blood Pressure</span>
                          <span className="text-sm font-black text-slate-900">{patient.bp} <span className="text-[10px] font-medium ml-0.5">mmHg</span></span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-5">
                      {predictionMode ? (
                        <div className="flex gap-4 items-center animate-in fade-in slide-in-from-top-2 duration-500">
                          {[
                            { label: 'Sepsis', val: patient.risks.sepsis, color: 'red' },
                            { label: 'Cardiac', val: patient.risks.cardiac, color: 'indigo' },
                            { label: 'Resp.', val: patient.risks.respiratory, color: 'orange' }
                          ].map(risk => (
                            <div key={risk.label} className="text-center">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger>
                                    <div className="relative size-12">
                                      <svg className="size-full" viewBox="0 0 36 36">
                                        <path
                                          className="text-slate-100 stroke-current"
                                          strokeWidth="3"
                                          fill="none"
                                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                        />
                                        <path
                                          className="stroke-current"
                                          style={{ color: risk.val > 60 ? '#ef4444' : risk.val > 30 ? '#f97316' : '#10b981' }}
                                          strokeWidth="3"
                                          strokeDasharray={`${risk.val}, 100`}
                                          strokeLinecap="round"
                                          fill="none"
                                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                        />
                                      </svg>
                                      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-black">{risk.val}%</span>
                                    </div>
                                    <p className="text-[8px] font-black text-slate-400 uppercase mt-1 tracking-tighter">{risk.label}</p>
                                  </TooltipTrigger>
                                  <TooltipContent className="bg-slate-900 border-none">
                                    <p className="text-[10px] font-bold text-white uppercase tracking-widest">{risk.val}% Probability in next 72h</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                          ))}
                          <div className="ml-2">
                             <TrendingUp className={`size-4 ${patient.riskScore > 50 ? 'text-red-500' : 'text-emerald-500'}`} />
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1.5 min-w-[120px]">
                          <div className="flex justify-between items-center px-0.5">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Aggregate Score</span>
                            <span className={`text-[10px] font-black ${patient.riskScore > 80 ? 'text-red-600' : 'text-slate-700'}`}>{patient.riskScore}/100</span>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                            <div 
                              className={`h-full transition-all duration-1000 ease-out ${patient.riskScore > 80 ? 'bg-red-500' : patient.riskScore > 50 ? 'bg-amber-500' : 'bg-[#00b289]'}`} 
                              style={{ width: `${patient.riskScore}%` }}
                            ></div>
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="outline" size="sm" className="h-8 text-xs font-bold text-slate-600 border-slate-200 hover:bg-slate-50 shadow-sm">
                          <FileText className="mr-1.5 h-3 w-3" /> Chart
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-slate-300 hover:text-red-500 hover:bg-red-50"
                          onClick={() => removePatient(patient.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      
      {/* Risk Analysis Legend */}
      {predictionMode && (
        <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-4 flex items-start gap-4 animate-in fade-in slide-in-from-bottom-2 duration-700">
           <Brain className="text-indigo-600 shrink-0 mt-1" size={20} />
           <div>
             <h4 className="text-xs font-black text-indigo-900 uppercase tracking-widest">Neural Forecast Insights</h4>
             <p className="text-xs text-indigo-700/80 mt-1 leading-relaxed">
               Predictions are calculated using a 4D Vector model analyzing live telemetry against 2.4M historical hospital cases. 
               <span className="font-black ml-1 uppercase">Warning:</span> Patients with Cardiac probability {'>'} 75% are prioritized for telemetry review.
             </p>
           </div>
        </div>
      )}
    </div>
  );
}
