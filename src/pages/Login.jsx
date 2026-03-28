import React, { useState } from 'react';

export default function Login({ onLogin }) {
  const [showDemoOptions, setShowDemoOptions] = useState(false);

  return (
    <div className="bg-background-light font-display text-slate-900 min-h-screen medical-pulse-bg">
      <div className="relative flex flex-col min-h-screen">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white/80 backdrop-blur-md px-6 md:px-12 py-4 sticky top-0 z-50">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center size-10 bg-primary/10 rounded-lg text-primary">
              <span className="material-symbols-outlined text-3xl">shield_with_heart</span>
            </div>
            <div>
              <h1 className="text-slate-900 text-lg font-bold leading-tight tracking-tight">SehatAI</h1>
              <p className="text-[10px] uppercase tracking-widest font-semibold text-primary/80">Multi-Role Access Gateway</p>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <nav className="hidden md:flex items-center gap-6">
              <a className="text-slate-600 text-sm font-medium hover:text-primary transition-colors" href="#">Contact Support</a>
              <a className="text-slate-600 text-sm font-medium hover:text-primary transition-colors" href="#">System Status</a>
            </nav>
            <div className="h-6 w-px bg-slate-200 hidden md:block"></div>
            <button className="bg-emergency-red/10 text-emergency-red hover:bg-emergency-red hover:text-white transition-all px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2">
              <span className="material-symbols-outlined text-lg">medical_services</span>
              Emergency
            </button>
          </div>
        </header>

        <main className="flex-1 flex flex-col items-center justify-center px-4 py-12">
          <div className="max-w-5xl w-full text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-black text-slate-900 mb-4 tracking-tight">Select Your Access Point</h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              SehatAI Universal Gateway: HIPAA-Compliant Multi-Agent Health Monitoring for modern clinical workflows.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl w-full px-4">
            {/* Patient Portal */}
            <div className="group flex flex-col bg-white rounded-xl border border-slate-200 p-8 shadow-sm hover:shadow-xl hover:border-vital-green/50 transition-all duration-300">
              <div className="size-16 rounded-2xl bg-vital-green/10 flex items-center justify-center text-vital-green mb-6 group-hover:scale-110 transition-transform">
                <span className="material-symbols-outlined text-4xl">person_pin</span>
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-3">Patient Portal</h3>
              <p className="text-slate-600 leading-relaxed mb-8 flex-1">
                Track your health, manage vitals, and connect with caregivers through your AI-assisted health dashboard.
              </p>
              <button
                onClick={() => onLogin('patient')}
                className="w-full bg-vital-green text-white font-bold py-3 px-6 rounded-lg flex items-center justify-center gap-2 hover:brightness-105 transition-all"
              >
                Continue to Login
                <span className="material-symbols-outlined text-lg">arrow_forward</span>
              </button>
            </div>

            {/* Hospital Portal */}
            <div className="group flex flex-col bg-white rounded-xl border border-slate-200 p-8 shadow-sm hover:shadow-xl hover:border-professional-teal/50 transition-all duration-300">
              <div className="size-16 rounded-2xl bg-professional-teal/10 flex items-center justify-center text-professional-teal mb-6 group-hover:scale-110 transition-transform">
                <span className="material-symbols-outlined text-4xl">domain</span>
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-3">Hospital Portal</h3>
              <p className="text-slate-600 leading-relaxed mb-8 flex-1">
                Manage patient rosters, monitor agent alerts, and orchestrate complex clinical workflows with ease.
              </p>
              <button
                onClick={() => onLogin('doctor')}
                className="w-full bg-professional-teal text-white font-bold py-3 px-6 rounded-lg flex items-center justify-center gap-2 hover:brightness-105 transition-all"
              >
                Continue to Login
                <span className="material-symbols-outlined text-lg">arrow_forward</span>
              </button>
            </div>

            {/* Admin Control */}
            <div className="group flex flex-col bg-white rounded-xl border border-slate-200 p-8 shadow-sm hover:shadow-xl hover:border-security-slate/50 transition-all duration-300">
              <div className="size-16 rounded-2xl bg-security-slate/10 flex items-center justify-center text-security-slate mb-6 group-hover:scale-110 transition-transform">
                <span className="material-symbols-outlined text-4xl">admin_panel_settings</span>
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-3">Admin Control</h3>
              <p className="text-slate-600 leading-relaxed mb-8 flex-1">
                System orchestration, real-time HIPAA audits, and global platform security settings for administrators.
              </p>
              <button
                onClick={() => onLogin('admin')}
                className="w-full bg-security-slate text-white font-bold py-3 px-6 rounded-lg flex items-center justify-center gap-2 hover:brightness-105 transition-all"
              >
                Continue to Login
                <span className="material-symbols-outlined text-lg">arrow_forward</span>
              </button>
            </div>
          </div>

          <div className="mt-16 flex flex-col items-center gap-6">
            <div className="flex flex-col items-center gap-4">
              <button 
                onClick={() => onLogin('patient', 'signup')}
                className="bg-primary/5 hover:bg-primary/10 text-primary px-8 py-3 rounded-full font-bold transition-all flex items-center gap-2 group"
              >
                <span className="material-symbols-outlined text-lg group-hover:rotate-12 transition-transform">person_add</span>
                Create a new SehatAI Account
              </button>
              
              {!showDemoOptions ? (
                <button 
                  onClick={() => setShowDemoOptions(true)}
                  className="bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200/50 px-8 py-3 rounded-full font-bold transition-all flex items-center gap-2 mt-2 group"
                >
                  <span className="material-symbols-outlined text-lg text-amber-500 animate-pulse">science</span>
                  Hackathon Presentation: Launch Demo Mode
                </button>
              ) : (
                <div className="bg-slate-50 border border-slate-200 p-6 rounded-2xl flex flex-col items-center gap-4 animate-in fade-in zoom-in duration-300 shadow-xl max-w-2xl border-t-4 border-t-amber-400">
                  <div className="flex items-center gap-2 text-amber-800 mb-1">
                    <span className="material-symbols-outlined scale-110">info</span>
                    <p className="font-bold text-xs uppercase tracking-widest">Select Demo Instance (One-Click Bypass)</p>
                  </div>
                  <div className="flex flex-wrap justify-center gap-3">
                    <button 
                      onClick={() => onLogin('patient', 'demo')}
                      className="bg-vital-green text-white px-6 py-2.5 rounded-xl font-bold transition-all flex items-center gap-2 shadow-sm hover:shadow-vital-green/20 hover:translate-y-[-2px] active:translate-y-0"
                    >
                      <span className="material-symbols-outlined text-lg">person</span> Patient Dashboard
                    </button>
                    <button 
                      onClick={() => onLogin('doctor', 'demo')}
                      className="bg-professional-teal text-white px-6 py-2.5 rounded-xl font-bold transition-all flex items-center gap-2 shadow-sm hover:shadow-professional-teal/20 hover:translate-y-[-2px] active:translate-y-0"
                    >
                      <span className="material-symbols-outlined text-lg">domain</span> Hospital Dashboard
                    </button>
                    <button 
                      onClick={() => onLogin('admin', 'demo')}
                      className="bg-security-slate text-white px-6 py-2.5 rounded-xl font-bold transition-all flex items-center gap-2 shadow-sm hover:shadow-security-slate/20 hover:translate-y-[-2px] active:translate-y-0"
                    >
                      <span className="material-symbols-outlined text-lg">admin_panel_settings</span> Admin Control
                    </button>
                  </div>
                  <button onClick={() => setShowDemoOptions(false)} className="text-slate-400 text-xs hover:text-slate-600 font-semibold underline underline-offset-4 transition-colors">Return to secure login gateway</button>
                </div>
              )}
            </div>
            <button className="text-slate-500 hover:text-primary text-sm font-medium transition-colors">
              Need help accessing your account?
            </button>
          </div>
        </main>

        <footer className="py-10 px-6 mt-auto">
          <div className="max-w-6xl mx-auto flex flex-col items-center border-t border-slate-200 pt-8">
            <div className="flex items-center gap-2 text-emergency-red font-semibold mb-4 cursor-pointer hover:underline">
              <span className="material-symbols-outlined">warning</span>
              <span>Emergency Services: If you are experiencing a medical emergency, please call 911 or your local emergency number.</span>
            </div>
            <div className="flex flex-wrap justify-center gap-x-8 gap-y-2 text-xs text-slate-400 font-medium">
              <span>© 2024 SehatAI Multi-Role Access Gateway</span>
              <a className="hover:text-primary" href="#">Privacy Policy</a>
              <a className="hover:text-primary" href="#">HIPAA Compliance</a>
              <a className="hover:text-primary" href="#">Terms of Service</a>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
