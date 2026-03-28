/**
 * AuthContext — Firebase implementation.
 *
 * Provides the logged-in user across all 3 portals using Firebase Auth
 * and Firestore for extended user data.
 */
import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth, db } from '@/lib/firebase';
import { supabase } from '@/database/supabaseClient';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  signOut 
} from 'firebase/auth';
import { messaging } from '@/lib/firebase';
import { getToken } from 'firebase/messaging';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null); // Extended user object from Firestore
  const [token, setToken]     = useState(null); // Firebase user UID
  const [loading, setLoading] = useState(true);

  // Rehydrate session automatically via Firebase listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          // Fetch extended role/name from Firestore
          const docRef = doc(db, 'users', firebaseUser.uid);
          const docSnap = await getDoc(docRef);
          
          let userData = null;
          if (docSnap.exists()) {
            const data = docSnap.data();
            userData = {
              id: firebaseUser.uid,
              email: firebaseUser.email,
              role: data.role,
              full_name: data.full_name,
              phone: data.phone || '',
              avatar_url: data.avatar_url || null,
              hospital_id: data.hospital_id || null,
              primaryHospitalId: data.primaryHospitalId || null
            };
            setUser(userData);
          } else {
            // Document doesn't exist yet (could be race condition during signup)
            // We set a minimal user object but DON'T default the role to patient immediately
            setUser({
              id: firebaseUser.uid,
              email: firebaseUser.email,
              role: 'loading', 
              full_name: firebaseUser.displayName || 'Authenticating...',
              is_new_user: true
            });
          }

          setToken(firebaseUser.uid);

          // Request Notification Permission and Store Token
          requestNotificationPermission(firebaseUser.uid);

        } catch (error) {
          console.error("Error fetching user profile:", error);
          setUser(null);
          setToken(null);
        }
      } else {
        // Check for Demo Mode if not logged into Firebase
        const demoRole = localStorage.getItem('sehat_demo_mode');
        if (demoRole) {
          setUser({
            id: `demo-${demoRole}`,
            email: `demo@${demoRole}.ai`,
            role: demoRole,
            full_name: `Demo ${demoRole.charAt(0).toUpperCase() + demoRole.slice(1)}`,
            demo_mode: true
          });
          setToken(`demo-${demoRole}`);
        } else {
          setUser(null);
          setToken(null);
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Handle redirect-based Google login result (when popup was blocked)
  useEffect(() => {
    const handleRedirectResult = async () => {
      try {
        const result = await getRedirectResult(auth);
        if (result?.user) {
          const pendingRole = localStorage.getItem('sehat_google_pending_role') || 'patient';
          const extraDataStr = localStorage.getItem('sehat_google_extra_data');
          const extraData = extraDataStr ? JSON.parse(extraDataStr) : {};
          
          // Clean up
          localStorage.removeItem('sehat_google_pending_role');
          localStorage.removeItem('sehat_google_extra_data');

          const firebaseUser = result.user;

          // Sync with Supabase
          try {
            const { error: supaSignUpError } = await supabase.auth.signUp({
              email: firebaseUser.email,
              password: firebaseUser.uid,
              options: { data: { full_name: firebaseUser.displayName || 'Google User', role: pendingRole, firebase_uid: firebaseUser.uid } }
            });
            if (supaSignUpError) {
              await supabase.auth.signInWithPassword({ email: firebaseUser.email, password: firebaseUser.uid });
            }
          } catch (e) { console.warn("Supabase redirect sync:", e.message); }

          // Create Firestore profile if new
          const docRef = doc(db, 'users', firebaseUser.uid);
          const docSnap = await getDoc(docRef);
          if (!docSnap.exists()) {
            const newUserData = {
              email: firebaseUser.email,
              role: pendingRole,
              full_name: extraData.full_name || firebaseUser.displayName || 'Google User',
              phone: firebaseUser.phoneNumber || '',
              avatar_url: firebaseUser.photoURL || null,
              created_at: new Date().toISOString(),
              ...extraData
            };
            await setDoc(docRef, newUserData);
            if (pendingRole === 'patient') {
              await setDoc(doc(db, 'patients', firebaseUser.uid), { user_id: firebaseUser.uid });
            }
          }
        }
      } catch (err) {
        console.warn("Redirect result handling:", err.message);
      }
    };
    handleRedirectResult();
  }, []);

  /**
   * login — authenticates with Firebase Auth.
   * Note: We don't return the extended user immediately here; 
   * the onAuthStateChanged listener handles population.
   */
  const login = async (email, password, expectedRole) => {
    // 1. Log into Firebase Auth
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const uid = userCredential.user.uid;
    
    // 2. Log into Supabase Auth (Sync)
    const { error: supabaseError } = await supabase.auth.signInWithPassword({ email, password });
    if (supabaseError) {
      console.error("Supabase login failed:", supabaseError.message);
      await signOut(auth); // Rollback Firebase if Supabase fails
      throw new Error(`Cloud Sync Error: ${supabaseError.message}`);
    }

    // 3. Fetch role to ensure they are logging into the correct portal
    const docSnap = await getDoc(doc(db, 'users', uid));
    if (docSnap.exists()) {
      const actualRole = docSnap.data().role;
      if (expectedRole && actualRole !== expectedRole) {
        // Sign them out immediately if wrong portal
        await signOut(auth);
        await supabase.auth.signOut();
        throw new Error('Wrong portal for this account');
      }
    } else {
      throw new Error('User profile missing in database');
    }

    // Auth state listener handles setUser
    return userCredential.user;
  };

  /**
   * loginWithGoogle — authenticates with Google.
   * If the user is new, we create their Firestore profile with the expected role.
   * Also syncs the session with Supabase so DB queries work.
   */
  const loginWithGoogle = async (expectedRole, extraData = {}) => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ 
      prompt: 'select_account'
    });

    console.log(`Starting Google login for role: ${expectedRole}`);
    
    let userCredential;
    try {
      userCredential = await signInWithPopup(auth, provider);
    } catch (err) {
      console.error("Google Popup Error:", err);
      if (err.code === 'auth/popup-blocked') {
        // Fallback to redirect-based login
        console.log("Popup blocked — falling back to redirect login");
        localStorage.setItem('sehat_google_pending_role', expectedRole);
        if (Object.keys(extraData).length > 0) {
          localStorage.setItem('sehat_google_extra_data', JSON.stringify(extraData));
        }
        await signInWithRedirect(auth, provider);
        return; // Page will redirect, so execution stops here
      } else if (err.code === 'auth/unauthorized-domain') {
        throw new Error(`This domain (${window.location.hostname}) is not authorized in Firebase Console. Add it under Authentication > Settings > Authorized Domains.`);
      } else if (err.code === 'auth/cancelled-popup-request' || err.code === 'auth/popup-closed-by-user') {
        throw new Error('Login cancelled. Please try again.');
      }
      throw err;
    }

    const firebaseUser = userCredential.user;
    
    // ── Sync with Supabase Auth ──────────────────────────────────────────────
    // This is critical: without a Supabase session, all DB queries will fail.
    try {
      // Try to sign up first (for new users), then sign in (for existing users)
      const { error: supaSignUpError } = await supabase.auth.signUp({
        email: firebaseUser.email,
        password: firebaseUser.uid, // Use Firebase UID as deterministic password
        options: {
          data: {
            full_name: extraData.full_name || firebaseUser.displayName || 'Google User',
            role: expectedRole || 'patient',
            firebase_uid: firebaseUser.uid
          }
        }
      });

      if (supaSignUpError) {
        // User already exists in Supabase — sign in instead
        const { error: supaSignInError } = await supabase.auth.signInWithPassword({
          email: firebaseUser.email,
          password: firebaseUser.uid
        });
        if (supaSignInError) {
          console.warn("Supabase session sync failed (non-critical):", supaSignInError.message);
          // Non-critical: Firebase auth still works, some DB features may be limited
        }
      }
    } catch (supaErr) {
      console.warn("Supabase sync error (non-critical):", supaErr.message);
    }

    // ── Firestore profile ────────────────────────────────────────────────────
    const docRef = doc(db, 'users', firebaseUser.uid);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
      // New user via Google — create their profile
      const role = expectedRole || 'patient'; 
      const newUserData = {
        email: firebaseUser.email,
        role: role,
        full_name: extraData.full_name || firebaseUser.displayName || 'Google User',
        phone: firebaseUser.phoneNumber || '',
        avatar_url: firebaseUser.photoURL || null,
        created_at: new Date().toISOString(),
        ...extraData
      };
      await setDoc(docRef, newUserData);

      // Create portal-specific collections
      if (role === 'patient') {
        await setDoc(doc(db, 'patients', firebaseUser.uid), { user_id: firebaseUser.uid });
      } else if (role === 'doctor') {
        await setDoc(doc(db, 'doctors', firebaseUser.uid), { user_id: firebaseUser.uid, is_available: true });
      }

      // Also sync profile to Supabase profiles table
      try {
        const { data: supaUser } = await supabase.auth.getUser();
        if (supaUser?.user?.id) {
          await supabase.from('profiles').upsert({
            id: supaUser.user.id,
            email: firebaseUser.email,
            role: role,
            full_name: newUserData.full_name,
            firebase_uid: firebaseUser.uid,
            status: 'active'
          });

          if (role === 'patient') {
            await supabase.from('patients').upsert({ user_id: supaUser.user.id });
          }
        }
      } catch (profileErr) {
        console.warn("Supabase profile sync (non-critical):", profileErr.message);
      }

      // Explicitly set user state to avoid race condition with listener
      setUser({ id: firebaseUser.uid, ...newUserData });
    } else {
      // Existing user — verify role matches the portal
      const actualRole = docSnap.data().role;
      if (expectedRole && actualRole !== expectedRole) {
        await signOut(auth);
        await supabase.auth.signOut();
        throw new Error(`This Google account is registered as "${actualRole}". Please use the ${actualRole} portal to log in.`);
      }
      setUser({ id: firebaseUser.uid, email: firebaseUser.email, ...docSnap.data() });
    }
    
    return firebaseUser;
  };

  /**
   * register — creates Firebase Auth user AND syncs with Supabase/Firestore
   */
  const register = async ({ email, password, role, full_name, phone, institution, ...extra }) => {
    try {
      console.log("Starting multi-platform registration for:", email);

      // 1. Create user in Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const firebaseUid = userCredential.user.uid;

      // 2. Create user in Supabase Auth (Sync)
      const { data: supabaseAuth, error: supabaseError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: full_name,
            role: role || 'patient'
          }
        }
      });

      if (supabaseError) {
        console.error("Supabase signup failed:", supabaseError.message);
        // We keep Firebase user but log the sync error
      }

      const supabaseUid = supabaseAuth?.user?.id;

      // 3. Create profile in Firestore (Portal Source of Truth)
      const userData = {
        uid: firebaseUid,
        supabase_uid: supabaseUid || null,
        email,
        role: role || 'patient',
        full_name,
        phone: phone || '',
        institution: institution || '',
        ...extra,
        created_at: new Date().toISOString(),
        medicalProfileComplete: false
      };

      await setDoc(doc(db, 'users', firebaseUid), userData);

      // 4. Create profile in Supabase (AI/Reports Source of Truth)
      if (supabaseUid) {
        try {
          await supabase.from('profiles').upsert({
            id: supabaseUid,
            email,
            role: role || 'patient',
            full_name,
            firebase_uid: firebaseUid,
            hospital_name: role === 'hospital' ? institution : null,
            status: 'active'
          });

          // Role-specific Supabase records
          if (role === 'patient') {
            await supabase.from('patients').upsert({ user_id: supabaseUid });
            await setDoc(doc(db, 'patients', firebaseUid), { medicalProfileComplete: false });
          } else if (role === 'hospital') {
            await supabase.from('hospitals').upsert({ user_id: supabaseUid, name: institution || full_name });
          }
        } catch (sErr) {
          console.warn("Supabase data sync encountered an issue:", sErr.message);
        }
      }

      // 5. Update local state
      setUser(userData);
      return userCredential.user;

    } catch (error) {
      console.error("Registration failed:", error);
      throw error;
    }
  };

  const loginAsDemo = (role) => {
    const demoUser = {
      id: `demo-${role}`,
      email: `demo@${role}.ai`,
      role: role,
      full_name: `Demo ${role.charAt(0).toUpperCase() + role.slice(1)}`,
      demo_mode: true
    };
    setUser(demoUser);
    setToken(demoUser.id);
    localStorage.setItem('sehat_demo_mode', role);
    setLoading(false);
  };

  const logout = async () => {
    localStorage.removeItem('sehat_demo_mode');
    await signOut(auth);
    await supabase.auth.signOut();
    setUser(null);
    setToken(null);
  };

  /**
   * requestNotificationPermission — asks browser for permission
   * and saves the FCM token to Firestore.
   */
  const requestNotificationPermission = async (uid) => {
    if (!messaging) return;
    
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        const fcmToken = await getToken(messaging, {
          vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY
        });
        
        if (fcmToken) {
          console.log('FCM Token generated:', fcmToken);
          // Save to user profile in Firestore
          await updateDoc(doc(db, 'users', uid), {
            fcm_token: fcmToken,
            last_token_update: new Date().toISOString()
          });
        }
      }
    } catch (error) {
      console.error('Error getting notification permission:', error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, loginWithGoogle, loginAsDemo, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};
