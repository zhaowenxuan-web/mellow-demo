import { supabase, isSupabaseConfigured } from './supabase';

export interface Unit {
  id: string;
  invitation_code: string;
  title: string;
  description: string;
  content: string;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
}

export interface Inspiration {
  id: string;
  invitation_code: string;
  unit_id: string | null;
  content: string;
  status: 'pending' | 'archived';
  is_deleted: boolean;
  created_at: string;
}

export interface LocalDataSummary {
  units: number;
  inspirations: number;
}

export interface MigrationResult extends LocalDataSummary {
  createdUnits: number;
  updatedUnits: number;
  createdInspirations: number;
  updatedInspirations: number;
}

export const DEMO_SPACE_CODE = 'MELLOW-DEMO-LOCAL';

export const VALID_CODES = [DEMO_SPACE_CODE];

export const INITIAL_UNITS: Unit[] = [];

export const INITIAL_INSPIRATIONS: Inspiration[] = [];

const LOCAL_UNITS_KEY = 'mellow_demo_units_store';
const LOCAL_INS_KEY = 'mellow_demo_inspirations_store';

function readStoredUnits(invitationCode: string): Unit[] {
  try {
    const raw = localStorage.getItem(LOCAL_UNITS_KEY);
    if (!raw) return [];
    return (JSON.parse(raw) as Unit[]).filter(unit => unit.invitation_code === invitationCode);
  } catch {
    return [];
  }
}

function readStoredInspirations(invitationCode: string): Inspiration[] {
  try {
    const raw = localStorage.getItem(LOCAL_INS_KEY);
    if (!raw) return [];
    return (JSON.parse(raw) as Inspiration[]).filter(inspiration => inspiration.invitation_code === invitationCode);
  } catch {
    return [];
  }
}

function getLocalUnits(invitationCode: string): Unit[] {
  try {
    const raw = localStorage.getItem(LOCAL_UNITS_KEY);
    if (!raw) {
      const seeded = invitationCode === DEMO_SPACE_CODE ? INITIAL_UNITS : [];
      localStorage.setItem(LOCAL_UNITS_KEY, JSON.stringify(seeded));
      return seeded;
    }
    const parsed: Unit[] = JSON.parse(raw);
    const userUnits = parsed.filter(u => u.invitation_code === invitationCode);
    if (userUnits.length === 0 && invitationCode === DEMO_SPACE_CODE) {
      const seeded = INITIAL_UNITS;
      const updated = [...parsed, ...seeded];
      localStorage.setItem(LOCAL_UNITS_KEY, JSON.stringify(updated));
      return seeded;
    }
    return userUnits;
  } catch {
    return invitationCode === DEMO_SPACE_CODE ? INITIAL_UNITS : [];
  }
}

function saveLocalUnits(units: Unit[]) {
  try {
    const raw = localStorage.getItem(LOCAL_UNITS_KEY);
    const existing: Unit[] = raw ? JSON.parse(raw) : [];
    const currentCode = units[0]?.invitation_code;
    const otherUnits = currentCode ? existing.filter(u => u.invitation_code !== currentCode) : existing;
    localStorage.setItem(LOCAL_UNITS_KEY, JSON.stringify([...otherUnits, ...units]));
  } catch (e) {
    console.warn('Failed to persist units locally', e);
  }
}

function removeLocalUnit(unitId: string, invitationCode: string) {
  try {
    const raw = localStorage.getItem(LOCAL_UNITS_KEY);
    const existing: Unit[] = raw ? JSON.parse(raw) : [];
    localStorage.setItem(
      LOCAL_UNITS_KEY,
      JSON.stringify(existing.filter(u => !(u.id === unitId && u.invitation_code === invitationCode)))
    );
  } catch (e) {
    console.warn('Failed to remove unit locally', e);
  }
}

function getLocalInspirations(invitationCode: string): Inspiration[] {
  try {
    const raw = localStorage.getItem(LOCAL_INS_KEY);
    if (!raw) {
      const seeded = invitationCode === DEMO_SPACE_CODE ? INITIAL_INSPIRATIONS : [];
      localStorage.setItem(LOCAL_INS_KEY, JSON.stringify(seeded));
      return seeded;
    }
    const parsed: Inspiration[] = JSON.parse(raw);
    const userIns = parsed.filter(i => i.invitation_code === invitationCode);
    if (userIns.length === 0 && invitationCode === DEMO_SPACE_CODE) {
      const seeded = INITIAL_INSPIRATIONS;
      const updated = [...parsed, ...seeded];
      localStorage.setItem(LOCAL_INS_KEY, JSON.stringify(updated));
      return seeded;
    }
    return userIns;
  } catch {
    return invitationCode === DEMO_SPACE_CODE ? INITIAL_INSPIRATIONS : [];
  }
}

function saveLocalInspirations(inspirations: Inspiration[]) {
  try {
    const raw = localStorage.getItem(LOCAL_INS_KEY);
    const existing: Inspiration[] = raw ? JSON.parse(raw) : [];
    const currentCode = inspirations[0]?.invitation_code;
    const otherIns = currentCode ? existing.filter(i => i.invitation_code !== currentCode) : existing;
    localStorage.setItem(LOCAL_INS_KEY, JSON.stringify([...otherIns, ...inspirations]));
  } catch (e) {
    console.warn('Failed to persist inspirations locally', e);
  }
}

function detachLocalInspirations(unitId: string, invitationCode: string) {
  try {
    const raw = localStorage.getItem(LOCAL_INS_KEY);
    const existing: Inspiration[] = raw ? JSON.parse(raw) : [];
    const updated = existing.map(inspiration =>
      inspiration.invitation_code === invitationCode && inspiration.unit_id === unitId
        ? { ...inspiration, unit_id: null, status: 'pending' as const }
        : inspiration
    );
    localStorage.setItem(LOCAL_INS_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn('Failed to detach inspirations locally', e);
  }
}

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

async function ensureInvitationCode(invitationCode: string): Promise<void> {
  const { data, error: lookupError } = await supabase
    .from('invitation_codes')
    .select('code')
    .eq('code', invitationCode)
    .maybeSingle();

  if (lookupError) throw lookupError;
  if (data) return;

  const { error: insertError } = await supabase
    .from('invitation_codes')
    .insert({ code: invitationCode });

  if (insertError) throw insertError;
}

export const dataStore = {
  getLocalDataSummary(invitationCode: string): LocalDataSummary {
    return {
      units: readStoredUnits(invitationCode).length,
      inspirations: readStoredInspirations(invitationCode).length,
    };
  },

  async migrateLocalDataToCloud(invitationCode: string): Promise<MigrationResult> {
    if (!isSupabaseConfigured) {
      throw new Error('Supabase 尚未连接');
    }

    const localUnits = readStoredUnits(invitationCode);
    const localInspirations = readStoredInspirations(invitationCode);
    const result: MigrationResult = {
      units: localUnits.length,
      inspirations: localInspirations.length,
      createdUnits: 0,
      updatedUnits: 0,
      createdInspirations: 0,
      updatedInspirations: 0,
    };

    await ensureInvitationCode(invitationCode);

    const { data: remoteUnitsData, error: remoteUnitsError } = await supabase
      .from('units')
      .select('*')
      .eq('invitation_code', invitationCode);

    if (remoteUnitsError) throw remoteUnitsError;

    const remoteUnits = (remoteUnitsData || []) as Unit[];
    const unitIdMap = new Map<string, string>();

    for (const localUnit of localUnits) {
      const existingUnit = remoteUnits.find(unit =>
        (isUuid(localUnit.id) && unit.id === localUnit.id) || unit.title === localUnit.title
      );
      const payload = {
        invitation_code: invitationCode,
        title: localUnit.title,
        description: localUnit.description || '',
        content: localUnit.content || '',
        is_pinned: !!localUnit.is_pinned,
        created_at: localUnit.created_at,
        updated_at: localUnit.updated_at,
      };

      if (existingUnit) {
        const { error } = await supabase
          .from('units')
          .update(payload)
          .eq('id', existingUnit.id)
          .eq('invitation_code', invitationCode);
        if (error) throw error;
        unitIdMap.set(localUnit.id, existingUnit.id);
        result.updatedUnits += 1;
      } else {
        const { data, error } = await supabase
          .from('units')
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        const createdUnit = data as Unit;
        remoteUnits.push(createdUnit);
        unitIdMap.set(localUnit.id, createdUnit.id);
        result.createdUnits += 1;
      }
    }

    const { data: remoteInspirationsData, error: remoteInspirationsError } = await supabase
      .from('inspirations')
      .select('*')
      .eq('invitation_code', invitationCode);

    if (remoteInspirationsError) throw remoteInspirationsError;

    const remoteInspirations = (remoteInspirationsData || []) as Inspiration[];

    for (const localInspiration of localInspirations) {
      const existingInspiration = remoteInspirations.find(inspiration =>
        (isUuid(localInspiration.id) && inspiration.id === localInspiration.id) ||
        (inspiration.content === localInspiration.content && inspiration.created_at === localInspiration.created_at)
      );
      const mappedUnitId = localInspiration.unit_id
        ? unitIdMap.get(localInspiration.unit_id) ||
          (remoteUnits.some(unit => unit.id === localInspiration.unit_id) ? localInspiration.unit_id : null)
        : null;
      const payload = {
        invitation_code: invitationCode,
        unit_id: mappedUnitId,
        content: localInspiration.content,
        status: mappedUnitId ? localInspiration.status : 'pending',
        is_deleted: !!localInspiration.is_deleted,
        created_at: localInspiration.created_at,
      };

      if (existingInspiration) {
        const { error } = await supabase
          .from('inspirations')
          .update(payload)
          .eq('id', existingInspiration.id)
          .eq('invitation_code', invitationCode);
        if (error) throw error;
        result.updatedInspirations += 1;
      } else {
        const { data, error } = await supabase
          .from('inspirations')
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        remoteInspirations.push(data as Inspiration);
        result.createdInspirations += 1;
      }
    }

    return result;
  },

  async checkConnection(): Promise<{ ok: boolean; message: string }> {
    if (!isSupabaseConfigured) {
      return { ok: true, message: 'Local storage mode active' };
    }
    try {
      const { error } = await supabase.from('invitation_codes').select('code').limit(1);
      if (error) {
        console.warn('Supabase ping notice:', error.message);
        return { ok: false, message: error.message };
      }
      return { ok: true, message: 'Supabase connected' };
    } catch (err) {
      console.warn('Supabase connection check skipped:', err);
      return { ok: false, message: 'Offline mode active' };
    }
  },

  async verifyLogin(code: string): Promise<boolean> {
    const upperCode = code.trim().toUpperCase();
    if (VALID_CODES.includes(upperCode) || upperCode.startsWith('MELLOW-')) {
      return true;
    }

    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase
          .from('invitation_codes')
          .select('code')
          .eq('code', upperCode)
          .maybeSingle();
        if (!error && data) {
          return true;
        }
      } catch {
        // Fallback
      }
    }
    return false;
  },

  async loadUnits(invitationCode: string): Promise<Unit[]> {
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase
          .from('units')
          .select('*')
          .eq('invitation_code', invitationCode)
          .order('is_pinned', { ascending: false })
          .order('updated_at', { ascending: false });

        if (!error && data && data.length > 0) {
          saveLocalUnits(data as Unit[]);
          return data as Unit[];
        }
      } catch (err) {
        console.warn('Falling back to local units due to:', err);
      }
    }
    return getLocalUnits(invitationCode);
  },

  async loadInspirations(invitationCode: string): Promise<Inspiration[]> {
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase
          .from('inspirations')
          .select('*')
          .eq('invitation_code', invitationCode)
          .order('created_at', { ascending: false });

        if (!error && data) {
          saveLocalInspirations(data as Inspiration[]);
          return data as Inspiration[];
        }
      } catch (err) {
        console.warn('Falling back to local inspirations due to:', err);
      }
    }
    return getLocalInspirations(invitationCode);
  },

  async createUnit(invitationCode: string, title: string, description: string): Promise<Unit> {
    const newUnit: Unit = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'unit-' + Date.now(),
      invitation_code: invitationCode,
      title,
      description,
      content: '',
      is_pinned: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    if (isSupabaseConfigured) {
      try {
        const insertUnit = () => supabase.from('units').insert({
            invitation_code: invitationCode,
            title,
            description,
            content: '',
            is_pinned: false
          })
          .select()
          .single();

        let { data, error } = await insertUnit();
        if (error?.code === '23503') {
          await ensureInvitationCode(invitationCode);
          ({ data, error } = await insertUnit());
        }
        if (error) throw error;

        if (data) {
          const created = data as Unit;
          const current = getLocalUnits(invitationCode);
          saveLocalUnits([created, ...current]);
          return created;
        }
      } catch (err) {
        console.warn('Supabase createUnit fallback:', err);
      }
    }

    const current = getLocalUnits(invitationCode);
    saveLocalUnits([newUnit, ...current]);
    return newUnit;
  },

  async updateUnit(unitId: string, invitationCode: string, updates: Partial<Unit>): Promise<void> {
    const timestamp = new Date().toISOString();
    const updateData = { ...updates, updated_at: timestamp };

    if (isSupabaseConfigured) {
      try {
        await supabase.from('units').update(updateData).eq('id', unitId);
      } catch (err) {
        console.warn('Supabase updateUnit fallback:', err);
      }
    }

    const current = getLocalUnits(invitationCode);
    const updated = current.map(u => u.id === unitId ? { ...u, ...updateData } : u);
    saveLocalUnits(updated);
  },

  async deleteUnit(unitId: string, invitationCode: string): Promise<void> {
    // Seeded demo records use readable IDs such as "unit-1" and exist only in
    // local storage. Sending those IDs to a PostgreSQL UUID column causes an
    // invalid-input error, so only UUID records are sent to Supabase.
    if (isSupabaseConfigured && isUuid(unitId)) {
      const { error: detachError } = await supabase
        .from('inspirations')
        .update({ unit_id: null, status: 'pending' })
        .eq('unit_id', unitId)
        .eq('invitation_code', invitationCode);

      if (detachError) throw detachError;

      const { error: deleteError } = await supabase
        .from('units')
        .delete()
        .eq('id', unitId)
        .eq('invitation_code', invitationCode);

      if (deleteError) throw deleteError;
    }

    removeLocalUnit(unitId, invitationCode);
    detachLocalInspirations(unitId, invitationCode);
  },

  async createInspiration(
    invitationCode: string, 
    content: string, 
    unitId: string | null = null, 
    status: 'pending' | 'archived' = 'pending'
  ): Promise<Inspiration> {
    const newIns: Inspiration = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'ins-' + Date.now(),
      invitation_code: invitationCode,
      unit_id: unitId,
      content,
      status,
      is_deleted: false,
      created_at: new Date().toISOString()
    };

    if (isSupabaseConfigured) {
      try {
        const insertInspiration = () => supabase.from('inspirations').insert({
            invitation_code: invitationCode,
            content,
            unit_id: unitId,
            status,
            is_deleted: false
          })
          .select()
          .single();

        let { data, error } = await insertInspiration();
        if (error?.code === '23503') {
          await ensureInvitationCode(invitationCode);
          ({ data, error } = await insertInspiration());
        }
        if (error) throw error;

        if (data) {
          const created = data as Inspiration;
          const current = getLocalInspirations(invitationCode);
          saveLocalInspirations([created, ...current]);
          return created;
        }
      } catch (err) {
        console.warn('Supabase createInspiration fallback:', err);
      }
    }

    const current = getLocalInspirations(invitationCode);
    saveLocalInspirations([newIns, ...current]);
    return newIns;
  },

  async updateInspiration(insId: string, invitationCode: string, updates: Partial<Inspiration>): Promise<void> {
    if (isSupabaseConfigured) {
      try {
        await supabase.from('inspirations').update(updates).eq('id', insId);
      } catch (err) {
        console.warn('Supabase updateInspiration fallback:', err);
      }
    }

    const current = getLocalInspirations(invitationCode);
    const updated = current.map(i => i.id === insId ? { ...i, ...updates } : i);
    saveLocalInspirations(updated);
  },

  async deleteInspiration(insId: string, invitationCode: string, permanent = false): Promise<void> {
    if (isSupabaseConfigured) {
      try {
        if (permanent) {
          await supabase.from('inspirations').delete().eq('id', insId);
        } else {
          await supabase.from('inspirations').update({ is_deleted: true }).eq('id', insId);
        }
      } catch (err) {
        console.warn('Supabase deleteInspiration fallback:', err);
      }
    }

    const current = getLocalInspirations(invitationCode);
    const updated = permanent 
      ? current.filter(i => i.id !== insId)
      : current.map(i => i.id === insId ? { ...i, is_deleted: true } : i);
    saveLocalInspirations(updated);
  }
};
