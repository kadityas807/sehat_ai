import { supabase } from './supabaseClient';

export const hospitalService = {
  async getEscalations(hospitalId) {
    const { data, error } = await supabase
      .from('escalations')
      .select('*, patients(full_name)')
      .eq('hospital_id', hospitalId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },

  async createEscalation(escalationData) {
    const { data, error } = await supabase
      .from('escalations')
      .insert([escalationData])
      .select();
    if (error) throw error;
    return data?.[0];
  },

  async resolveEscalation(escalationId, overrideNotes) {
    const { data, error } = await supabase
      .from('escalations')
      .update({
        resolved: true,
        overridden_at: new Date().toISOString(),
        override_reason: overrideNotes
      })
      .eq('id', escalationId)
      .select();
    if (error) throw error;
    return data?.[0];
  },

  async getWards(hospitalId) {
    const { data, error } = await supabase
      .from('wards')
      .select('*, beds(*, patients(*))')
      .eq('hospital_id', hospitalId);
    if (error) throw error;
    return data;
  },

  async updateBedStatus(bedId, status, patientId = null) {
    console.log(`Updating bed ${bedId} to ${status} (Patient: ${patientId})`);
    const { data, error } = await supabase
      .from('beds')
      .update({ status: status, patient_id: patientId })
      .eq('id', bedId)
      .select();
    
    if (error) {
      console.error('Bed update failed:', error);
      throw error;
    }
    return data?.[0];
  },

  async getAuditLogs(hospitalId) {
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(50);
    if (error) throw error;
    return data;
  },

  async logAction(userId, action, table = null, recordId = null) {
    const { error } = await supabase
      .from('audit_logs')
      .insert([{ 
        user_id: userId, 
        action: action, 
        table_affected: table, 
        record_id: recordId 
      }]);
    if (error) console.error("Audit log failed:", error);
  },

  async getStaff(hospitalId) {
    const { data, error } = await supabase
      .from('hospital_staff')
      .select('*')
      .eq('hospital_id', hospitalId)
      .order('name', { ascending: true });
    if (error) throw error;
    return data;
  },

  async addStaff(hospitalId, staffData) {
    const { data, error } = await supabase
      .from('hospital_staff')
      .upsert({ ...staffData, hospital_id: hospitalId })
      .select();
    if (error) throw error;
    return data?.[0];
  },

  async updateStaff(staffId, staffData) {
    const { data, error } = await supabase
      .from('hospital_staff')
      .update(staffData)
      .eq('id', staffId)
      .select();
    if (error) throw error;
    return data?.[0];
  },

  async deleteStaff(staffId) {
    const { error } = await supabase
      .from('hospital_staff')
      .delete()
      .eq('id', staffId);
    if (error) throw error;
    return true;
  },

  async getShifts(hospitalId) {
    const { data, error } = await supabase
      .from('staff_shifts')
      .select('*')
      .eq('hospital_id', hospitalId)
      .order('shift_date', { ascending: true });
    if (error) throw error;
    return data;
  },

  async assignShift(hospitalId, shiftData) {
    const { data, error } = await supabase
      .from('staff_shifts')
      .insert([{ ...shiftData, hospital_id: hospitalId }])
      .select();
    if (error) throw error;
    return data;
  },

  async getHospitalByAdmin(adminId) {
    const { data, error } = await supabase
      .from('hospitals')
      .select('*')
      .eq('admin_id', adminId)
      .limit(1);
    if (error) throw error;
    return data?.[0] || null;
  },

  async getMyHospital() {
    // 🔥 HACKATHON OVERRIDE: 
    // Always return the Master Seeded Hospital so the user sees all demo data!
    const MASTER_HOSPITAL_ID = '11111111-1111-1111-1111-111111111111';
    const { data: masterHospital } = await supabase
      .from('hospitals')
      .select('*')
      .eq('id', MASTER_HOSPITAL_ID)
      .limit(1);
      
    if (masterHospital && masterHospital[0]) {
      return masterHospital[0];
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.warn('Supabase user not found in getMyHospital, checking session...');
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return null;
    }

    // Fallback if Master Hospital doesn't exist
    const targetUser = user || (await supabase.auth.getSession()).data.session.user;
    let hospital = await this.getHospitalByAdmin(targetUser.id);
    
    // Auto-provision if missing (crucial for demo/hackathon stability)
    if (!hospital) {
      console.log('Hospital missing for user, checking profile...');
      
      // Ensure profile exists first (to avoid FK violation in hospitals table)
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .limit(1);
      
      const profile = profiles?.[0];
        
      if (!profile) {
        console.log('Profile missing, creating profile...');
        await supabase.from('profiles').insert([{
          id: user.id,
          role: user.user_metadata?.role || 'doctor',
          full_name: user.user_metadata?.full_name || user.email,
          email: user.email
        }]);
      }

      console.log('Auto-provisioning clinic...');
      const hospitalName = user.user_metadata?.hospital_name || `${user.user_metadata?.full_name || 'My'} Clinic`;
      const { data, error } = await supabase
        .from('hospitals')
        .insert([{
          admin_id: user.id,
          hospital_name: hospitalName,
          is_verified: true
        }])
        .select();
      
      if (error) {
        console.error('Auto-provisioning failed:', error);
        throw new Error(`Clinic setup failed: ${error.message}. This usually means your user profile is missing or permissions are restricted.`);
      }
      
      if (!data || data.length === 0) {
        throw new Error('Clinic was created but could not be retrieved. Row Level Security (RLS) is likely blocking the read.');
      }
      hospital = data[0];
    }
    return hospital;
  },
  
  async seedHospitalInfrastructure(hospitalId) {
    console.log('Seeding defaults for hospital:', hospitalId);
    
    const defaultWards = [
      { name: 'Intensive Care Unit (ICU)', type: 'Specialized' },
      { name: 'General Medical Ward', type: 'General' },
      { name: 'Emergency Observation', type: 'Emergency' }
    ];

    const results = [];
    
    for (const ward of defaultWards) {
      // 1. Create Ward
      const { data: wardData, error: wardError } = await supabase
        .from('wards')
        .insert([{ hospital_id: hospitalId, name: ward.name, type: ward.type }])
        .select();
      
      if (wardError) throw wardError;
      const newWard = wardData[0];

      // 2. Create 4 Beds for this ward
      const bedsToInsert = [1, 2, 3, 4].map(num => ({
        ward_id: newWard.id,
        bed_number: `${ward.name[0]}${num}`,
        status: 'available'
      }));

      const { error: bedError } = await supabase.from('beds').insert(bedsToInsert);
      if (bedError) throw bedError;
      
      results.push(newWard);
    }
    
    return results;
  },

  // Real-time subscriptions
  subscribeToEscalations(hospitalId, callback) {
    return supabase
      .channel('escalations_realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'escalations', filter: `hospital_id=eq.${hospitalId}` },
        callback
      )
      .subscribe();
  },

  subscribeToBeds(hospitalId, callback) {
    // Use a unique channel per hospital to prevent cross-hospital data leaks.
    // Supabase realtime doesn't support nested JOIN filters, so we scope by
    // channel name and re-filter in the callback using the loaded ward list.
    return supabase
      .channel(`beds_hospital_${hospitalId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'beds' },
        async (payload) => {
          // Verify the changed bed belongs to this hospital's wards before firing callback
          if (!payload.new?.ward_id) { callback(payload); return; }
          const { data } = await supabase
            .from('wards')
            .select('id')
            .eq('id', payload.new.ward_id)
            .eq('hospital_id', hospitalId)
            .limit(1);
          if (data && data.length > 0) callback(payload);
        }
      )
      .subscribe();
  },

  async searchStaff(hospitalId, query) {
    if (!query) return [];
    console.log('Searching staff:', query);
    const { data, error } = await supabase
      .from('hospital_staff')
      .select('*')
      .eq('hospital_id', hospitalId)
      .ilike('name', `%${query}%`);
    
    if (error) throw error;
    return data || [];
  },

  async getAllHospitals() {
    const { data, error } = await supabase
      .from('hospitals')
      .select('*')
      .order('hospital_name', { ascending: true });
    
    if (error) throw error;
    return data || [];
  },

  async updateHospitalSettings(hospitalId, settings) {
    const { data, error } = await supabase
      .from('hospitals')
      .update(settings)
      .eq('id', hospitalId)
      .select();
    if (error) throw error;
    return data?.[0];
  },

  // Alias used by HospitalSettings page
  async updateHospital(hospitalId, settings) {
    return this.updateHospitalSettings(hospitalId, settings);
  }
};
