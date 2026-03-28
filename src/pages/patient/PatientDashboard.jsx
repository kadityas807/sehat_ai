import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import PatientMedications from './PatientMedications';
import PatientAppointments from './PatientAppointments';
import PatientHistory from './PatientHistory';
import PatientAmbulance from './PatientAmbulance';
import PatientBookAmbulance from './PatientBookAmbulance';
import PatientBookingConfirmation from './PatientBookingConfirmation';
import PatientSettings from './PatientSettings';
import PatientMedicalSetup from './PatientMedicalSetup';
import PatientEmergency from './PatientEmergency';
import PatientSupport from './PatientSupport';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { initPatientAgent } from '@/lib/patientAgent';
import AIChat from '@/components/AIChat';
import BraceletHealthTracker from '@/components/patient/BraceletHealthTracker';
import SehatLinkPage from './SehatLinkPage';
import { sendEmailNotification } from '@/lib/emailService';
import { useAuth } from '@/contexts/AuthContext';
import { getNotificationsForUser, markNotificationRead } from '@/lib/supabaseService';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { getUserLocation } from '@/lib/locationService';
import { getHospital } from '@/lib/hospitalConfig';

export default function PatientDashboard({ onLogout }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();  // real logged-in user
  const [agentExecutor, setAgentExecutor] = useState(null);
  const [isBraceletRegistered, setIsBraceletRegistered] = useState(false);
  const [braceletId, setBraceletId] = useState('');
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  // Medical profile gate & location
  const [medicalProfileComplete, setMedicalProfileComplete] = useState(true);
  const [skippedSetup, setSkippedSetup] = useState(sessionStorage.getItem('skippedMedicalSetup') === 'true');
  const [medicalProfileData, setMedicalProfileData] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [userLocation, setUserLocation] = useState(null);
  const [primaryHospital, setPrimaryHospital] = useState(null);
  const userName = localStorage.getItem('sehat_user_name') || user?.full_name || "User";

  // Extract current path segment
  const currentPathSegment = location.pathname.split('/').pop() || 'dashboard';

  // Role Protection: If user is logged in but NOT a patient, redirect them back to their correct dashboard
  useEffect(() => {
    if (user && user.role !== 'patient') {
      navigate(`/${user.role}/dashboard`, { replace: true });
    }
  }, [user, navigate]);

  useEffect(() => {
    const setupAgent = async () => {
      try {
        const apiKey = import.meta.env.VITE_GROQ_API_KEY;
        if (apiKey) {
          const executor = await initPatientAgent({ apiKey });
          setAgentExecutor(executor);

          if (user?.email) {
            sendEmailNotification({ type: 'dashboard', email: user.email });
          } else {
             // Fallback for demo
             sendEmailNotification({ type: 'dashboard', email: "patient@example.com" });
          }
        }
      } catch (error) {
        console.error('Failed to initialize Patient AI:', error);
      }
    };
    setupAgent();
    // Fetch real notifications from Firestore
    if (user?.id) {
      getNotificationsForUser(user.id).then(data => {
        setNotifications(data);
        setUnreadCount(data.filter(n => !n.is_read).length);
      }).catch(() => {});
    }
  }, [user]);

  // Check medical profile completion & load hospital info
  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      try {
        const userSnap = await getDoc(doc(db, 'users', user.id));
        const data = userSnap.data() || {};
        setMedicalProfileComplete(!!data.medicalProfileComplete);
        
        const patientSnap = await getDoc(doc(db, 'patients', user.id));
        if (patientSnap.exists()) {
          setMedicalProfileData(patientSnap.data().medicalProfile || null);
        }

        if (data.primaryHospitalId) {
          setPrimaryHospital(getHospital(data.primaryHospitalId));
        }
      } catch (e) {
        setMedicalProfileComplete(true); // fail open
      } finally {
        setProfileLoading(false);
      }
    })();
    // Request location permission on login
    getUserLocation().then(setUserLocation);
  }, [user?.id]);

  // Proper click-outside-to-close logic
  useEffect(() => {
    const handleClickOutside = () => {
      setShowNotifDropdown(false);
      setShowProfileMenu(false);
    };
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  // Show medical setup if profile incomplete
  if (profileLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <span className="animate-spin material-symbols-outlined text-primary text-4xl">progress_activity</span>
      </div>
    );
  }

  if (!medicalProfileComplete && !skippedSetup) {
    return (
      <PatientMedicalSetup
        onComplete={() => {
          setMedicalProfileComplete(true);
          navigate('/patient/dashboard');
        }}
        onSkip={() => {
          setSkippedSetup(true);
          sessionStorage.setItem('skippedMedicalSetup', 'true');
        }}
      />
    );
  }
  return (
    <div className="flex h-screen overflow-hidden bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 antialiased font-display">
      {/* Sidebar Navigation */}
      <aside className="w-64 shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hidden md:flex flex-col">
        <div className="p-6 flex items-center gap-3">
          <div className="size-10 bg-primary rounded-xl flex items-center justify-center text-white shadow-lg shadow-primary/20">
            <span className="material-symbols-outlined text-2xl">emergency_share</span>
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">SehatAI</h1>
            <p className="text-[10px] uppercase tracking-widest font-bold text-primary">Clinical Light</p>
          </div>
        </div>
        <nav className="flex-1 px-4 py-4 space-y-1">
          <NavItem id="dashboard" icon="dashboard" label="Dashboard" active={currentPathSegment} onClick={(id) => navigate(`/patient/${id}`)} />
          <NavItem id="appointments" icon="calendar_month" label="Appointments" active={currentPathSegment} onClick={(id) => navigate(`/patient/${id}`)} />
          <NavItem id="health" icon="favorite" label="My Health" active={currentPathSegment} onClick={(id) => navigate(`/patient/${id}`)} />
          <NavItem id="medications" icon="pill" label="Medications" active={currentPathSegment} onClick={(id) => navigate(`/patient/${id}`)} />
          <NavItem id="support"    icon="support_agent"  label="Support"       active={currentPathSegment} onClick={(id) => navigate(`/patient/${id}`)} />
          <NavItem id="ambulance"  icon="ambulance"      label="Book Ambulance" active={currentPathSegment} onClick={(id) => navigate(`/patient/${id}`)} />
          <NavItem id="emergency"  icon="emergency"      label="Emergency SOS"  active={currentPathSegment} onClick={(id) => navigate(`/patient/${id}`)} />
        </nav>
        {/* Location status pill */}
        {userLocation && (
          <div className="mx-4 mb-2 px-3 py-2 rounded-xl bg-green-50 dark:bg-green-900/10 border border-green-100 dark:border-green-800/30">
            <p className="text-[10px] font-bold text-green-600 dark:text-green-400 flex items-center gap-1">
              <span className="material-symbols-outlined text-[12px]">location_on</span>
              {userLocation.isFallback ? 'Default: Bharat Mandapam' : 'Location Detected'}
            </p>
          </div>
        )}
        {/* Primary hospital badge */}
        {primaryHospital && (
          <div className="mx-4 mb-4 px-3 py-2 rounded-xl border" style={{ background: primaryHospital.theme.secondary, borderColor: primaryHospital.theme.primary + '40' }}>
            <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: primaryHospital.theme.primary }}>Primary Hospital</p>
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mt-0.5">{primaryHospital.shortName}</p>
          </div>
        )}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800">
          <div className="bg-primary/5 rounded-xl p-4">
            <p className="text-xs font-semibold text-primary mb-1">Premium Health Plan</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">24/7 AI-Agent monitoring active.</p>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="h-16 flex items-center justify-between px-8 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 relative z-20">
          <div className="flex items-center flex-1">
            {currentPathSegment === 'confirmation' ? (
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Appointment Confirmation</h2>
            ) : (
              <div className="relative w-full max-w-md">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">search</span>
                <input className="w-full pl-10 pr-4 py-2 bg-slate-100 dark:bg-slate-800 border-none rounded-lg text-sm focus:ring-2 focus:ring-primary/20 placeholder:text-slate-400" placeholder="Search metrics, records, or agents..." type="text" />
              </div>
            )}
          </div>
          <div className="flex items-center gap-4">
            <div className="relative">
              <button 
                onClick={(e) => { e.stopPropagation(); setShowNotifDropdown(!showNotifDropdown); setShowProfileMenu(false); }}
                className={`p-2 rounded-lg relative transition-colors ${showNotifDropdown ? 'bg-primary/10 text-primary' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
              >
                <span className="material-symbols-outlined">notifications</span>
                {unreadCount > 0 && <span className="absolute top-2 right-2 size-2 bg-red-500 rounded-full border-2 border-white dark:border-slate-900"></span>}
              </button>
              
              {showNotifDropdown && (
                <div className="absolute top-full right-0 mt-2 w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <h4 className="font-bold text-sm">Notifications</h4>
                    <span className="text-[10px] font-bold text-primary px-2 py-0.5 bg-primary/10 rounded-full cursor-pointer hover:bg-primary/20 transition-colors uppercase">Mark all read</span>
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                        {notifications.length === 0 ? (
                          <div className="p-6 text-center text-sm text-slate-400">No notifications yet.</div>
                        ) : notifications.map(n => (
                          <div key={n.id} className="p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer flex gap-3 border-b border-slate-50 dark:border-slate-800 last:border-none" onClick={() => markNotificationRead(n.id)}>
                        <span className={`material-symbols-outlined text-lg ${n.is_read ? 'text-slate-400' : 'text-primary'}`}>notifications</span>
                        <div>
                          <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 leading-snug">{n.title}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 leading-snug mt-0.5">{n.message}</p>
                          <p className="text-[10px] text-slate-400 mt-1 font-medium">{new Date(n.created_at).toLocaleString()}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="p-2 border-t border-slate-100 dark:border-slate-800">
                    <button className="w-full py-2 text-xs font-bold text-slate-500 hover:text-primary transition-colors text-center">View Notifications Center</button>
                  </div>
                </div>
              )}
            </div>

            <button className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg" onClick={() => navigate('/patient/settings')}>
              <span className="material-symbols-outlined">settings</span>
            </button>
            <div className="h-8 w-px bg-slate-200 dark:border-slate-800 mx-2"></div>
            
            <div className="relative">
              <div 
                className={`flex items-center gap-3 cursor-pointer p-1 rounded-lg transition-colors ${showProfileMenu ? 'bg-slate-100 dark:bg-slate-800' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
                onClick={(e) => { e.stopPropagation(); setShowProfileMenu(!showProfileMenu); setShowNotifDropdown(false); }}
              >
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{user?.full_name || userName}</p>
                  <p className="text-[11px] text-slate-500 font-medium">{user?.email || 'Patient ID: #4492-B'}</p>
                </div>
                <div className="size-10 rounded-full bg-primary flex items-center justify-center text-white font-bold border-2 border-primary/20">
                   {user?.full_name ? user.full_name.charAt(0).toUpperCase() : userName.charAt(0).toUpperCase()}
                </div>
              </div>
              
              {showProfileMenu && (
                <div className="absolute top-full right-0 mt-2 w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl py-3 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800 mb-2">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Account</p>
                  </div>
                  <button 
                    onClick={() => { navigate('/patient/settings'); setShowProfileMenu(false); }}
                    className="w-full px-4 py-2 flex items-center gap-3 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <span className="material-symbols-outlined text-lg">person</span>
                    Profile Settings
                  </button>
                  <button 
                    onClick={() => { navigate('/patient/health'); setShowProfileMenu(false); }}
                    className="w-full px-4 py-2 flex items-center gap-3 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <span className="material-symbols-outlined text-lg">history</span>
                    Medical Records
                  </button>
                  <div className="my-2 border-t border-slate-100 dark:border-slate-800"></div>
                  <button 
                    onClick={onLogout}
                    className="w-full px-4 py-2 flex items-center gap-3 text-sm font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    <span className="material-symbols-outlined text-lg">logout</span>
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Content Scrollable */}
        <div className="flex-1 overflow-y-auto no-scrollbar" onClick={() => { setShowNotifDropdown(false); setShowProfileMenu(false); }}>
          <Routes>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={
              <DashboardView 
                user={user}
                userName={userName} 
                medicalProfile={medicalProfileData}
                onNavigate={(id) => navigate(`/patient/${id}`)} 
                isBraceletRegistered={isBraceletRegistered} 
                setIsBraceletRegistered={setIsBraceletRegistered} 
                setBraceletId={setBraceletId} 
              />
            } />
            <Route path="appointments" element={<PatientAppointments onNavigate={(id) => navigate(`/patient/${id}`)} />} />
            <Route path="confirmation" element={<PatientBookingConfirmation onNavigate={(id) => navigate(`/patient/${id}`)} />} />
            <Route path="health" element={<PatientHistory onNavigate={(id) => navigate(`/patient/${id}`)} />} />
            <Route path="medications" element={<PatientMedications onNavigate={(id) => navigate(`/patient/${id}`)} />} />
            <Route path="support" element={<PatientSupport onNavigate={(id) => navigate(`/patient/${id}`)} />} />
            <Route path="ambulance" element={<PatientBookAmbulance onNavigate={(id) => navigate(`/patient/${id}`)} />} />
            <Route path="settings" element={<PatientSettings onNavigate={(id) => navigate(`/patient/${id}`)} />} />
            <Route path="emergency" element={<PatientEmergency onNavigate={(id) => navigate(`/patient/${id}`)} />} />
          </Routes>
        </div>

        {/* AI Assistant */}
        {agentExecutor && (
          <AIChat 
            agentExecutor={agentExecutor} 
            title="SehatAI Health Companion"
            initialMessage={`Hi ${user?.full_name?.split(' ')[0] || userName.split(' ')[0]}! I'm your SehatAI Health Companion. I can help you with medical advice, symptom analysis, or checking your vitals. You can even upload a photo of a wound or report for analysis!`}
            welcomeTitle="Patient Agentic Assistant"
            themeColor="#10b77f"
          />
        )}
      </main>
    </div>
  );
}

function NavItem({ id, icon, label, active, onClick }) {
  const isActive = active === id;
  return (
    <button
      onClick={() => onClick(id)}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
        isActive 
        ? 'bg-primary/10 text-primary font-semibold' 
        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
      }`}
    >
      <span className="material-symbols-outlined">{icon}</span>
      <span className="text-sm">{label}</span>
    </button>
  );
}


function DashboardView({ user, userName, medicalProfile, onNavigate, isBraceletRegistered, setIsBraceletRegistered, setBraceletId }) {
  const [showPhysical, setShowPhysical] = useState(true);
  const isDemo = user?.demo_mode;
  const localAppointments = JSON.parse(localStorage.getItem('sehat_appointments') || '[]');


  const downloadLabResult = (testName, facility, date, status, notes) => {
    const doc = new jsPDF();
    doc.setFontSize(22);
    doc.text(`Lab Result: ${testName}`, 14, 22);
    
    doc.setFontSize(14);
    doc.text(`Facility: ${facility}`, 14, 32);
    doc.text(`Date: ${date}`, 14, 40);
    doc.text(`Status: ${status}`, 14, 48);
    
    const details = notes ? [[notes.metric, notes.value, notes.range]] : [['Blood Cells', 'Normal', 'Standard']];

    autoTable(doc, {
      startY: 56,
      head: [['Metric', 'Value', 'Reference Range']],
      body: details,
      theme: 'grid',
      headStyles: { fillColor: [16, 183, 127] } // Primary color
    });
    
    doc.save(`${testName.replace(/\s+/g, '_')}_Result.pdf`);
  };

  return (
    <div className="p-8 space-y-8">
      {/* Welcome Section */}
      <section className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">Welcome back, {userName.split(' ')[0]}</h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Your vitals are looking stable. 3 tasks need your attention today.</p>
        </div>
        <button onClick={() => onNavigate('appointments')} className="flex items-center gap-2 px-6 py-3 bg-primary text-white font-bold rounded-xl shadow-lg shadow-primary/20 hover:brightness-105 transition-all">
          <span className="material-symbols-outlined">add_circle</span>
          Book Medical Checkup
        </button>
      </section>

      {/* Injury Alert */}
      {medicalProfile?.hasRecentInjury && (
        <section className="bg-orange-50 dark:bg-orange-900/10 border border-orange-200 dark:border-orange-800/50 rounded-2xl p-6 shadow-sm animate-in fade-in slide-in-from-top-4">
          <div className="flex gap-4 items-start">
            <div className="size-12 rounded-full bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-2xl">healing</span>
            </div>
            <div>
              <h3 className="text-orange-800 dark:text-orange-300 font-bold text-lg">Active Injury Management</h3>
              <p className="text-orange-600 dark:text-orange-400 text-sm mt-1">{medicalProfile.injuryDescription}</p>
              <div className="mt-4 flex gap-3">
                <button onClick={() => onNavigate('ambulance')} className="px-4 py-2 bg-orange-500 text-white text-sm font-bold rounded-lg shadow-md hover:bg-orange-600 transition-colors">Book Urgent Transport</button>
                <button onClick={() => onNavigate('appointments')} className="px-4 py-2 bg-white text-orange-600 text-sm font-bold border border-orange-200 rounded-lg hover:bg-orange-50 transition-colors">Consult Specialist</button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Demographics Card */}
      {medicalProfile && (
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center gap-4">
            <div className="size-10 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-500 flex items-center justify-center font-bold">
              <span className="material-symbols-outlined text-lg">bloodtype</span>
            </div>
            <div>
              <p className="text-xs uppercase text-slate-400 font-bold tracking-widest">Blood</p>
              <p className="text-lg font-bold text-slate-900 dark:text-slate-100">{medicalProfile.bloodGroup}</p>
            </div>
          </div>
          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center gap-4">
            <div className="size-10 rounded-full bg-green-50 dark:bg-green-900/20 text-green-500 flex items-center justify-center font-bold">
              <span className="material-symbols-outlined text-lg">height</span>
            </div>
            <div>
              <p className="text-xs uppercase text-slate-400 font-bold tracking-widest">Height</p>
              <p className="text-lg font-bold text-slate-900 dark:text-slate-100">{medicalProfile.heightCm} <span className="text-sm">cm</span></p>
            </div>
          </div>
          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center gap-4">
            <div className="size-10 rounded-full bg-purple-50 dark:bg-purple-900/20 text-purple-500 flex items-center justify-center font-bold">
              <span className="material-symbols-outlined text-lg">monitor_weight</span>
            </div>
            <div>
              <p className="text-xs uppercase text-slate-400 font-bold tracking-widest">Weight</p>
              <p className="text-lg font-bold text-slate-900 dark:text-slate-100">{medicalProfile.weightKg} <span className="text-sm">kg</span></p>
            </div>
          </div>
          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center gap-4">
            <div className="size-10 rounded-full bg-orange-50 dark:bg-orange-900/20 text-orange-500 flex items-center justify-center font-bold">
              <span className="material-symbols-outlined text-lg">cake</span>
            </div>
            <div>
              <p className="text-xs uppercase text-slate-400 font-bold tracking-widest">Age</p>
              <p className="text-lg font-bold text-slate-900 dark:text-slate-100">{medicalProfile.age} <span className="text-sm">yrs</span></p>
            </div>
          </div>
        </section>
      )}

      {/* Health Pulse Grid / Bracelet Tracker */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">pulse_alert</span>
            Health Intelligence
          </h3>
          {isBraceletRegistered && (
             <button onClick={() => setIsBraceletRegistered(false)} className="text-xs font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 px-3 py-1 rounded-full transition-all">Disconnect Bracelet</button>
          )}
        </div>
        
        <BraceletHealthTracker
          isRegistered={isBraceletRegistered}
          onRegister={(id) => {
            setIsBraceletRegistered(true);
            setBraceletId(id);
          }}
          onLearnMore={() => onNavigate('sehat-link')}
        />
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column (2 spans) */}
        <div className="lg:col-span-2 space-y-8">
          {/* Upcoming Appointments */}
          <section>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">calendar_today</span>
              Upcoming
            </h3>
            <button onClick={() => onNavigate('appointments')} className="text-xs font-semibold text-primary hover:underline">View All</button>
          </div>
          <div className="space-y-4">
            {isDemo ? (
              <>
                {showPhysical && (
                  <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm transition-all duration-300 transform origin-top">
                    <div className="flex items-center gap-4 mb-3">
                      <div className="size-10 bg-primary/10 rounded-lg flex flex-col items-center justify-center text-primary">
                        <span className="text-[10px] font-bold uppercase leading-none">Oct</span>
                        <span className="text-lg font-black leading-none">24</span>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-slate-900 dark:text-white">Annual Physical</p>
                        <p className="text-xs text-slate-500">Dr. Sarah Mitchell • 10:30 AM</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => onNavigate('appointments')} className="flex-1 py-1.5 text-xs font-bold bg-slate-100 dark:bg-slate-800 rounded hover:bg-slate-200 transition-colors">Reschedule</button>
                      <button 
                        onClick={() => window.open('https://www.google.com/maps/dir/?api=1&destination=Saint+Mary%27s+Specialist+Hospital', '_blank')} 
                        className="flex-1 py-1.5 text-xs font-bold text-primary bg-primary/10 rounded hover:bg-primary/20 transition-colors"
                      >
                        Directions
                      </button>
                      <button onClick={() => setShowPhysical(false)} className="px-2 py-1.5 text-slate-400 hover:text-red-500 transition-colors">
                        <span className="material-symbols-outlined text-sm">cancel</span>
                      </button>
                    </div>
                  </div>
                )}
                <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm opacity-75">
                  <div className="flex items-center gap-4">
                    <div className="size-10 bg-slate-100 dark:bg-slate-800 rounded-lg flex flex-col items-center justify-center text-slate-500">
                      <span className="text-[10px] font-bold uppercase leading-none">Nov</span>
                      <span className="text-lg font-black leading-none">12</span>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-slate-900 dark:text-white">Lab Results Review</p>
                      <p className="text-xs text-slate-500">Video Consultation • 02:00 PM</p>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              localAppointments.length > 0 ? (
                localAppointments.map((apt, idx) => {
                  const d = new Date(apt.date || new Date());
                  const month = d.toLocaleString('en-US', { month: 'short' });
                  const day = d.getDate();
                  return (
                    <div key={idx} className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm transition-all duration-300">
                      <div className="flex items-center gap-4 mb-3">
                        <div className="size-10 bg-primary/10 rounded-lg flex flex-col items-center justify-center text-primary">
                          <span className="text-[10px] font-bold uppercase leading-none">{month}</span>
                          <span className="text-lg font-black leading-none">{day}</span>
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-bold text-slate-900 dark:text-white">{'Consultation'}</p>
                          <p className="text-xs text-slate-500">{apt.facility?.name} • {apt.slot}</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => onNavigate('appointments')} className="flex-1 py-1.5 text-xs font-bold bg-slate-100 dark:bg-slate-800 rounded hover:bg-slate-200 transition-colors">Reschedule</button>
                        <button 
                          onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(apt.facility?.name)}`, '_blank')} 
                          className="flex-1 py-1.5 text-xs font-bold text-primary bg-primary/10 rounded hover:bg-primary/20 transition-colors"
                        >
                          Directions
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 text-center">
                  <span className="material-symbols-outlined text-slate-400 mb-2">event_busy</span>
                  <p className="text-sm font-bold text-slate-700 dark:text-slate-300">No Upcoming Appointments</p>
                  <p className="text-xs text-slate-500 mt-1">Ready to book your next checkup?</p>
                </div>
              )
            )}
          </div>
          </section>


          {/* Recent Lab Results */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                Recent Lab Results
              </h3>
              <button onClick={() => onNavigate('health')} className="text-xs font-semibold text-primary hover:underline">Full History</button>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50/50 dark:bg-slate-800/30 border-b border-slate-100 dark:border-slate-800/50">
                      <th className="px-6 py-4">Test Name</th>
                      <th className="px-6 py-4">Date</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                    {isDemo ? (
                      <>
                        <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group">
                          <td className="px-6 py-4">
                            <p className="font-bold text-sm text-slate-900 dark:text-white">Complete Blood Count</p>
                            <p className="text-[11px] text-slate-500 mt-0.5">Quest Diagnostics</p>
                          </td>
                          <td className="px-6 py-4 text-[13px] text-slate-600 dark:text-slate-400">Oct 12, 2023</td>
                          <td className="px-6 py-4">
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400 border border-green-100 dark:border-green-800">
                              <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span> Normal
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button onClick={() => downloadLabResult('Complete Blood Count', 'Quest Diagnostics', 'Oct 12, 2023', 'Normal', {metric:'RBC Count', value:'4.5 M/µL', range:'4.1-5.1 M/µL'})} className="text-primary hover:bg-primary/10 p-2 rounded-lg transition-colors">
                              <span className="material-symbols-outlined text-lg">download</span>
                            </button>
                          </td>
                        </tr>
                        <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group">
                          <td className="px-6 py-4">
                            <p className="font-bold text-sm text-slate-900 dark:text-white">Lipid Profile</p>
                            <p className="text-[11px] text-slate-500 mt-0.5">General Medical Labs</p>
                          </td>
                          <td className="px-6 py-4 text-[13px] text-slate-600 dark:text-slate-400">Sep 28, 2023</td>
                          <td className="px-6 py-4">
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400 border border-green-100 dark:border-green-800">
                              <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span> Normal
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button onClick={() => downloadLabResult('Lipid Profile', 'General Medical Labs', 'Sep 28, 2023', 'Normal', {metric:'LDL Cholesterol', value:'95 mg/dL', range:'<100 mg/dL'})} className="text-primary hover:bg-primary/10 p-2 rounded-lg transition-colors">
                              <span className="material-symbols-outlined text-lg">download</span>
                            </button>
                          </td>
                        </tr>
                        <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group">
                          <td className="px-6 py-4">
                            <p className="font-bold text-sm text-slate-900 dark:text-white">Glucose (HbA1c)</p>
                            <p className="text-[11px] text-slate-500 mt-0.5">Sehat Healthcare</p>
                          </td>
                          <td className="px-6 py-4 text-[13px] text-slate-600 dark:text-slate-400">Sep 15, 2023</td>
                          <td className="px-6 py-4">
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400 border border-orange-100 dark:border-orange-800">
                              <span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span> Borderline
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button onClick={() => downloadLabResult('Glucose (HbA1c)', 'Sehat Healthcare', 'Sep 15, 2023', 'Borderline', {metric:'A1c Level', value:'5.9%', range:'<5.7%'})} className="text-primary hover:bg-primary/10 p-2 rounded-lg transition-colors">
                              <span className="material-symbols-outlined text-lg">download</span>
                            </button>
                          </td>
                        </tr>
                      </>
                    ) : (
                      <tr>
                        <td colSpan="4" className="px-6 py-12 text-center text-slate-500 text-sm">
                          <span className="material-symbols-outlined block mb-2 text-slate-400">science</span>
                          No recent lab results to display
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </div>

        {/* Right Column (1 span) */}
        <div className="lg:col-span-1 space-y-8">
          {/* Medication Schedule */}
          <section>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">event_note</span>
              Medication
            </h3>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            {isDemo ? (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                <div className="p-4 flex items-center gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <div className="size-10 shrink-0 bg-primary/10 rounded-lg flex items-center justify-center text-primary">
                    <span className="material-symbols-outlined">pill</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-slate-900 dark:text-white">Lisinopril (10mg)</p>
                    <p className="text-xs text-slate-500">Take with water • 08:00 AM</p>
                  </div>
                  <span className="material-symbols-outlined text-green-500 text-xl">check_circle</span>
                </div>
                <div className="p-4 flex items-center gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <div className="size-10 shrink-0 bg-primary/10 rounded-lg flex items-center justify-center text-primary">
                    <span className="material-symbols-outlined">pill</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-slate-900 dark:text-white">Atorvastatin (20mg)</p>
                    <p className="text-xs text-slate-500">After dinner • 08:00 PM</p>
                  </div>
                  <div className="px-3 py-1 bg-slate-100 dark:bg-slate-800 text-[10px] font-bold rounded-full text-slate-500 uppercase">Upcoming</div>
                </div>
                <div className="p-4 flex items-center gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <div className="size-10 shrink-0 bg-red-100 dark:bg-red-900/20 rounded-lg flex items-center justify-center text-red-500">
                    <span className="material-symbols-outlined">warning</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-slate-900 dark:text-white">Multivitamin</p>
                    <p className="text-xs text-slate-500">Anytime • Missed Yesterday</p>
                  </div>
                  <button onClick={() => onNavigate('medications')} className="text-xs font-bold text-primary hover:underline">Log Now</button>
                </div>
              </div>
            ) : (
              <div className="p-6 text-center text-slate-500 border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                <span className="material-symbols-outlined block mb-2 text-slate-400">medication</span>
                <p className="text-sm font-bold text-slate-700 dark:text-slate-300">No Medication Scheduled</p>
                <button onClick={() => onNavigate('medications')} className="mt-3 text-xs font-bold text-primary hover:underline bg-primary/10 px-3 py-1.5 rounded-lg">Add Medication</button>
              </div>
            )}
          </div>
          </section>

          {/* Emergency Contact */}
          <section>
            {isDemo ? (
              <div className="bg-red-50/50 dark:bg-red-900/10 rounded-xl p-5 border border-red-100 dark:border-red-900/30">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-red-500 dark:text-red-400 mb-4 flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm">emergency</span>
                  Emergency Contact
                </h4>
                <div className="flex items-center gap-3">
                  <div className="bg-red-500 text-white size-10 rounded-full flex items-center justify-center font-bold text-sm">EM</div>
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white leading-none">Elena Miller</p>
                    <p className="text-xs text-slate-500 mt-1">Spouse • (555) 012-3456</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-5 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">Emergency Info</h4>
                  <p className="text-xs text-slate-500 mt-0.5">Setup emergency contacts</p>
                </div>
                <button onClick={() => onNavigate('settings')} className="text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors">Setup</button>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
