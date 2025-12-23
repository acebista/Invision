import { supabase } from './supabaseClient';

export interface Firm {
    id: string;
    name: string;
}

export interface Company {
    id: string;
    name: string;
    firm_id: string;
}

export interface FiscalYear {
    id: string;
    label: string;
    company_id: string;
}

export interface Workspace {
    id: string;
    company_id: string;
    fiscal_year_id: string;
    is_locked: boolean;
}

// Fetch all companies (assuming user belongs to the firm of the first company found, or all public for now given anonymous key)
// In a real app with auth, we'd filter by user's firm.
export async function fetchCompanies() {
    const { data, error } = await supabase
        .from('companies')
        .select('*')
        .order('name');

    if (error) throw error;
    return data as Company[];
}

export async function createCompany(name: string, firmId: string) {
    const { data, error } = await supabase
        .from('companies')
        .insert({ name, firm_id: firmId })
        .select()
        .single();

    if (error) throw error;
    return data as Company;
}

export async function fetchFiscalYears(companyId: string) {
    const { data, error } = await supabase
        .from('fiscal_years')
        .select('*')
        .eq('company_id', companyId)
        .order('label', { ascending: false });

    if (error) throw error;
    return data as FiscalYear[];
}

export async function createFiscalYear(companyId: string, label: string) {
    const { data, error } = await supabase
        .from('fiscal_years')
        .insert({ company_id: companyId, label })
        .select()
        .single();

    if (error) throw error;
    return data as FiscalYear;
}

// Simplification: We need a firm ID to create a company. 
// We'll expose a function to get the 'default' firm (first one) since we don't have full auth context in UI yet.
export async function getDefaultFirm() {
    const { data, error } = await supabase
        .from('firms')
        .select('*')
        .limit(1)
        .single();

    if (error) {
        // If no firm exists, seed one
        const { data: newFirm, error: createError } = await supabase
            .from('firms')
            .insert({ name: 'Default Firm' })
            .select()
            .single();

        if (createError) throw createError;
        return newFirm as Firm;
    }
    return data as Firm;
}

export async function ensureWorkspace(companyId: string, fiscalYearLabel: string) {
    // 1. Check if FY exists, if not create
    let fyId: string;
    const { data: fyData } = await supabase
        .from('fiscal_years')
        .select('id')
        .eq('company_id', companyId)
        .eq('label', fiscalYearLabel)
        .single();

    if (fyData) {
        fyId = fyData.id;
    } else {
        const { data: newFy, error: fyError } = await supabase
            .from('fiscal_years')
            .insert({ company_id: companyId, label: fiscalYearLabel })
            .select()
            .single();
        if (fyError) throw fyError;
        fyId = newFy.id;
    }

    // 2. Check if Workspace exists, if not create
    const { data: wsData } = await supabase
        .from('workspaces')
        .select('id')
        .eq('company_id', companyId)
        .eq('fiscal_year_id', fyId)
        .single();

    if (wsData) return wsData.id;

    // Need firm_id for workspace
    const { data: company } = await supabase.from('companies').select('firm_id').eq('id', companyId).single();
    if (!company) throw new Error('Company not found');

    const { data: newWs, error: wsError } = await supabase
        .from('workspaces')
        .insert({
            firm_id: company.firm_id,
            company_id: companyId,
            fiscal_year_id: fyId,
            is_locked: false
        })
        .select()
        .single();

    if (wsError) throw wsError;
    return newWs.id;
}
