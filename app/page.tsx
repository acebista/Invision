'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { extractInvoiceData } from '../lib/geminiService';
import { createInvoice, fetchInvoices } from '../lib/invoiceService';
import { supabase } from '../lib/supabaseClient';
import {
    fetchCompanies,
    createCompany,
    fetchFiscalYears,
    createFiscalYear,
    ensureWorkspace,
    getDefaultFirm,
    Company as DBCompany,
    FiscalYear as DBFiscalYear
} from '@/lib/companyService';
import { convertPdfToImages } from '@/lib/pdfService';
import { v4 as uuidv4 } from 'uuid';

// Types
enum InvoiceStatus {
    PENDING_REVIEW = 'pending_review',
    APPROVED = 'approved',
    REJECTED = 'rejected'
}

interface InvoiceFlags {
    math_mismatch: boolean;
    vat_inconsistent: boolean;
    missing_fields: boolean;
}

interface LineItem {
    description: string;
    quantity: number | null;
    unit_price: number | null;
    amount: number | null;
}

interface OtherCharge {
    name: string;
    amount: number;
}

interface InvoiceData {
    invoice_id: string;
    company_id: string;
    fiscal_year: string;
    vendor_name: string | null;
    invoice_number: string | null;
    invoice_date_raw: string | null;
    taxable_amount: number | null;
    vat_amount: number | null;
    grand_total: number | null;
    currency: string;
    line_items?: LineItem[];
    other_charges?: OtherCharge[];
    flags: InvoiceFlags;
    status: InvoiceStatus;
    confidence_score: number;
    image_urls: string[];
    created_at: string;
}

interface Company {
    id: string;
    name: string;
}

interface FiscalYear {
    id: string;
    label: string;
}

// Mock Data
const MOCK_COMPANIES: Company[] = [
    { id: '1', name: 'Valley Traders P. Ltd.' },
];

const MOCK_YEARS: FiscalYear[] = [
    { id: '1', label: '2080/81' },
    { id: '2', label: '2079/80' },
];

// ==================== SIDEBAR COMPONENT ====================
interface SidebarProps {
    activeTab: string;
    setActiveTab: (tab: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab }) => {
    const menuItems = [
        { id: 'ingest', icon: 'fa-plus-circle', label: 'Ingest' },
        { id: 'review', icon: 'fa-list-check', label: 'Review' },
        { id: 'export', icon: 'fa-file-export', label: 'Export' },
    ];

    return (
        <>
            {/* Desktop Sidebar */}
            <div className="hidden md:flex w-16 lg:w-20 bg-[#0d2a1d] min-h-screen flex-col items-center py-4 border-r border-white/5 z-40">
                <div className="mb-8">
                    <div className="w-8 h-8 bg-[#a3e635] rounded-md flex items-center justify-center text-[#0d2a1d] font-black text-sm">
                        IV
                    </div>
                </div>

                <nav className="flex flex-col gap-2 w-full px-1.5">
                    {menuItems.map((item) => (
                        <button
                            key={item.id}
                            onClick={() => setActiveTab(item.id)}
                            className={`flex flex-col items-center justify-center py-3 rounded-lg transition-all gap-1.5 ${activeTab === item.id
                                ? 'bg-[#a3e635] text-[#0d2a1d] shadow-lg shadow-[#a3e635]/10'
                                : 'text-white/30 hover:text-white/60 hover:bg-white/5'
                                }`}
                        >
                            <i className={`fa-solid ${item.icon} text-sm`}></i>
                            <span className="text-[8px] font-black uppercase tracking-widest hidden lg:block">{item.label}</span>
                        </button>
                    ))}
                </nav>

                <div className="mt-auto flex flex-col gap-4 pb-2">
                    <div className="h-[1px] w-8 bg-white/5 mx-auto"></div>
                    <button title="Settings" className="text-white/20 hover:text-white/60">
                        <i className="fa-solid fa-gear text-xs"></i>
                    </button>
                </div>
            </div>

            {/* Mobile Bottom Navigation */}
            <div className="md:hidden fixed bottom-0 left-0 right-0 bg-[#0d2a1d] border-t border-white/10 z-50 safe-area-inset-bottom">
                <nav className="flex justify-around items-center h-14">
                    {menuItems.map((item) => (
                        <button
                            key={item.id}
                            onClick={() => setActiveTab(item.id)}
                            className={`flex flex-col items-center justify-center py-2 px-4 rounded-lg transition-all gap-1 ${activeTab === item.id
                                ? 'text-[#a3e635]'
                                : 'text-white/40'
                                }`}
                        >
                            <i className={`fa-solid ${item.icon} text-lg`}></i>
                            <span className="text-[9px] font-bold uppercase">{item.label}</span>
                        </button>
                    ))}
                </nav>
            </div>
        </>
    );
};

// ==================== TOPBAR COMPONENT ====================
interface TopBarProps {
    selectedCompany: DBCompany | null;
    selectedFY: DBFiscalYear | null;
    companies: DBCompany[];
    fiscalYears: DBFiscalYear[];
    onSwitchCompany: (c: DBCompany) => void;
    onAddCompany: () => void;
    onSwitchFY: (fy: DBFiscalYear) => void;
    onAddFY: () => void;
}

const TopBar: React.FC<TopBarProps> = ({
    selectedCompany,
    selectedFY,
    companies,
    fiscalYears,
    onSwitchCompany,
    onAddCompany,
    onSwitchFY,
    onAddFY
}) => {
    return (
        <div className="h-12 bg-[#0d2a1d] border-b border-white/10 flex items-center justify-between px-2 md:px-4 sticky top-0 z-30 shadow-sm">
            {/* Mobile: Logo */}
            <div className="md:hidden w-7 h-7 bg-[#a3e635] rounded flex items-center justify-center text-[#0d2a1d] font-black text-xs mr-2">
                IV
            </div>

            <div className="flex items-center gap-2 md:gap-3 flex-1 min-w-0">
                <div className="flex items-center gap-1 md:gap-2 bg-black/20 px-2 md:px-3 py-1 rounded border border-white/5 min-w-0">
                    <i className="fa-solid fa-building text-[#a3e635] text-[10px] hidden md:block"></i>

                    {/* Company Dropdown */}
                    <select
                        className="bg-transparent text-[10px] md:text-[11px] font-black text-white uppercase tracking-wider outline-none cursor-pointer max-w-[100px] md:max-w-none truncate"
                        value={selectedCompany?.id || ''}
                        onChange={(e) => {
                            if (e.target.value === 'NEW') {
                                onAddCompany();
                            } else {
                                const c = companies.find(Comp => Comp.id === e.target.value);
                                if (c) onSwitchCompany(c);
                            }
                        }}
                    >
                        <option value="" disabled>Company</option>
                        {companies.map(c => (
                            <option key={c.id} value={c.id} className="text-black">{c.name}</option>
                        ))}
                        <option value="NEW" className="text-black font-bold">+ New</option>
                    </select>

                    <span className="text-white/20 mx-0.5 md:mx-1">|</span>

                    {/* FY Dropdown */}
                    <select
                        className="bg-transparent text-[10px] md:text-[11px] font-bold text-white/60 outline-none cursor-pointer"
                        value={selectedFY?.id || ''}
                        onChange={(e) => {
                            if (e.target.value === 'NEW') {
                                onAddFY();
                            } else {
                                const fy = fiscalYears.find(f => f.id === e.target.value);
                                if (fy) onSwitchFY(fy);
                            }
                        }}
                    >
                        <option value="" disabled>FY</option>
                        {fiscalYears.map(fy => (
                            <option key={fy.id} value={fy.id} className="text-black">{fy.label}</option>
                        ))}
                        <option value="NEW" className="text-black font-bold">+ New</option>
                    </select>
                </div>
            </div>

            {/* User Info - Hidden on mobile */}
            <div className="hidden md:flex items-center gap-6">
                <div className="flex items-center gap-2 pr-4 border-r border-white/10">
                    <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">Operator</span>
                    <span className="text-[11px] font-bold text-white/80">M. RAY</span>
                </div>
                <div className="w-6 h-6 rounded bg-[#a3e635] flex items-center justify-center text-[10px] font-black text-[#0d2a1d]">
                    MR
                </div>
            </div>

            {/* Mobile: Just avatar */}
            <div className="md:hidden w-7 h-7 rounded bg-[#a3e635] flex items-center justify-center text-[9px] font-black text-[#0d2a1d]">
                MR
            </div>
        </div>
    );
};

// ==================== UPLOAD VIEW COMPONENT ====================
interface UploadViewProps {
    onComplete: (invoice: InvoiceData) => void;
    onBatchUpload: (files: File[]) => Promise<void>;
    stats: {
        total: number;
        flagged: number;
        clean: number;
    };
}

const UploadView: React.FC<UploadViewProps> = ({ onComplete, onBatchUpload, stats }) => {
    const [preview, setPreview] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [uploadStatus, setUploadStatus] = useState<{ current: number; total: number; message: string } | null>(null);
    const [tempData, setTempData] = useState<Partial<InvoiceData> | null>(null);
    const [lastActionTime, setLastActionTime] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isDragOver, setIsDragOver] = useState(false);

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);

        const files = Array.from(e.dataTransfer.files);
        if (files.length === 0) return;

        const file = files[0]; // Handle primary file

        // Handle PDF
        if (file.type === 'application/pdf') {
            setIsProcessing(true);
            setUploadStatus({ current: 0, total: 0, message: 'Analyzing PDF...' });

            try {
                const images = await convertPdfToImages(file, (curr, total) => {
                    setUploadStatus({ current: curr, total, message: `Converting page ${curr} of ${total}...` });
                });

                if (images.length > 0) {
                    setUploadStatus({ current: 0, total: images.length, message: 'Starting cloud upload...' });
                    await onBatchUpload(images);
                    setUploadStatus(null);
                    // Optional: Toast "Batch upload started"
                }
            } catch (err) {
                console.error("PDF Error:", err);
                alert("Failed to process PDF.");
            } finally {
                setIsProcessing(false);
                setUploadStatus(null);
            }
            return;
        }

        // Handle Image
        if (file.type.startsWith('image/')) {
            processImageFile(file);
        }
    };

    const processImageFile = (file: File) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result as string;
            setPreview(result);
            processImage(result);
        };
        reader.readAsDataURL(file);
    };

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            if (file.type === 'application/pdf') {
                // Reuse PDF logic (duplicate for now or refactor, keeping inline for safety)
                setIsProcessing(true);
                setUploadStatus({ current: 0, total: 0, message: 'Analyzing PDF...' });
                try {
                    const images = await convertPdfToImages(file, (curr, total) => {
                        setUploadStatus({ current: curr, total, message: `Converting page ${curr} of ${total}...` });
                    });
                    if (images.length > 0) {
                        setUploadStatus({ current: 0, total: images.length, message: 'Uploading batch...' });
                        await onBatchUpload(images);
                    }
                } catch (err) {
                    console.error(err);
                    alert("PDF Processing Failed");
                } finally {
                    setIsProcessing(false);
                    setUploadStatus(null);
                }
            } else {
                processImageFile(file);
            }
        }
    };

    const processImage = async (base64: string) => {
        setIsProcessing(true);
        try {
            // Call Qwen AI extraction via OpenRouter
            const extracted = await extractInvoiceData(base64);

            // Check for Auto-Approval eligibility
            const taxable = extracted.taxable_amount || 0;
            const vat = extracted.vat_amount || 0;
            const total = extracted.grand_total || 0;
            // Handle other charges in math check
            const otherChargesTotal = (extracted.other_charges || []).reduce((sum: number, c: OtherCharge) => sum + c.amount, 0);

            // Validation Logic
            const mathMismatch = Math.abs((taxable + vat + otherChargesTotal) - total) > 1.0;
            const vatInconsistent = Math.abs(vat - (taxable * 0.13)) > (taxable * 0.01 + 1.0); // mild tolerance
            const missingFields = !extracted.invoice_number || !extracted.vendor_name;

            if (!mathMismatch && !vatInconsistent && !missingFields) {
                // AUTO-APPROVE
                const newInvoice: InvoiceData = {
                    invoice_id: Math.random().toString(36).substring(7),
                    company_id: 'default',
                    fiscal_year: '2080/81',
                    vendor_name: extracted.vendor_name || null,
                    invoice_number: extracted.invoice_number || null,
                    invoice_date_raw: extracted.invoice_date_raw || null,
                    taxable_amount: extracted.taxable_amount || null,
                    vat_amount: extracted.vat_amount || null,
                    grand_total: extracted.grand_total || null,
                    currency: extracted.currency || 'NPR',
                    line_items: extracted.line_items || [],
                    other_charges: extracted.other_charges || [],
                    flags: {
                        math_mismatch: false,
                        vat_inconsistent: false,
                        missing_fields: false
                    },
                    status: InvoiceStatus.APPROVED, // Auto-approved!
                    confidence_score: 0.95,
                    image_urls: [base64],
                    created_at: new Date().toISOString()
                };

                // Save immediately
                await onComplete(newInvoice);
                setPreview(null);
                setTempData(null);
                // Notification (via toast or alert, or just silent)
                // alert('Invoice auto-verified and saved!'); // Optional
            } else {
                // SHOW FOR REVIEW
                setTempData(extracted);
            }

        } catch (err) {
            console.error('Extraction error:', err);
            alert(`Extraction failed: ${err instanceof Error ? err.message : 'Check API key in .env.local'}`);
            setPreview(null);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleConfirm = () => {
        if (!tempData || !preview) return;

        const taxable = tempData.taxable_amount || 0;
        const vat = tempData.vat_amount || 0;
        const total = tempData.grand_total || 0;

        // Sum up other charges
        const otherChargesTotal = (tempData.other_charges || []).reduce((sum: number, c: OtherCharge) => sum + c.amount, 0);

        // Calculated total should be: Taxable + VAT + Other Charges
        // Note: Sometimes Taxable already includes Service Charge depending on accounting practice, 
        // but typically Grand Total = Taxable + VAT (where Taxable = Subtotal + SC).
        // Let's assume standard: Grand Total = Taxable + VAT + (Any non-taxable charges if any, usually 0).
        // Actually in Nepal:
        // Subtotal + Service Charge (10%) = Taxable Amount
        // Taxable Amount + VAT (13%) = Grand Total
        // So mathematically: Taxable + VAT should close to Grand Total.
        // If 'other_charges' are extracted separately (like Service Charge), they might be part of Taxable already.

        // Let's stick to the basic check: Taxable + VAT ≈ Grand Total
        // If there's a mismatch, it might be due to nontaxable charges.

        const newInvoice: InvoiceData = {
            invoice_id: Math.random().toString(36).substring(7), // Temp ID until DB insert
            company_id: 'default',
            fiscal_year: '2080/81',
            vendor_name: tempData.vendor_name || null,
            invoice_number: tempData.invoice_number || null,
            invoice_date_raw: tempData.invoice_date_raw || null,
            taxable_amount: tempData.taxable_amount || null,
            vat_amount: tempData.vat_amount || null,
            grand_total: tempData.grand_total || null,
            currency: tempData.currency || 'NPR',
            line_items: tempData.line_items || [],
            other_charges: tempData.other_charges || [],
            flags: {
                math_mismatch: Math.abs((taxable + vat + otherChargesTotal) - total) > 1.0,
                vat_inconsistent: Math.abs(vat - (taxable * 0.13)) > (taxable * 0.01),
                missing_fields: !tempData.invoice_number || !tempData.vendor_name
            },
            status: InvoiceStatus.PENDING_REVIEW,
            confidence_score: 0.9,
            image_urls: [preview],
            created_at: new Date().toISOString()
        };

        // Pass to parent to handle saving
        onComplete(newInvoice);
        setTempData(null);
        setPreview(null);
        setLastActionTime(new Date().toLocaleTimeString());
    };
    // Keyboard shortcut for Enter
    useEffect(() => {
        const handleKeydown = (e: KeyboardEvent) => {
            if (e.key === 'Enter' && tempData && !isProcessing) {
                handleConfirm();
            }
        };
        window.addEventListener('keydown', handleKeydown);
        return () => window.removeEventListener('keydown', handleKeydown);
    }, [tempData, isProcessing]);

    return (
        <div className="flex flex-col md:flex-row min-h-[calc(100vh-48px-56px)] md:h-[calc(100vh-48px)] pb-16 md:pb-0 overflow-auto md:overflow-hidden bg-gray-50/50">
            {/* Stats Panel - Horizontal on mobile, Sidebar on desktop */}
            <div className="md:w-48 bg-white border-b md:border-b-0 md:border-r border-gray-200 p-3 md:p-4 flex md:flex-col gap-4 md:gap-6 overflow-x-auto md:overflow-visible">
                <div className="flex md:block items-center gap-4 md:gap-0">
                    <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap md:mb-3">Status</h4>
                    <div className="flex md:flex-col gap-4 md:space-y-4">
                        <div className="text-center md:text-left">
                            <p className="text-2xl md:text-3xl font-black text-[#0d2a1d]">{stats.total}</p>
                            <p className="text-[9px] md:text-[10px] font-bold text-gray-500 uppercase">Total</p>
                        </div>

                        {/* Pending Queue Indicator */}
                        {stats.total > (stats.clean + stats.flagged) && (
                            <div className="animate-pulse text-center md:text-left">
                                <p className="text-lg md:text-xl font-black text-blue-600">{stats.total - (stats.clean + stats.flagged)}</p>
                                <p className="text-[8px] md:text-[9px] font-bold text-blue-400 uppercase">Queue</p>
                            </div>
                        )}

                        <div className="flex gap-3 md:gap-4">
                            <div className="text-center md:text-left">
                                <p className="text-lg md:text-xl font-black text-gray-700">{stats.clean}</p>
                                <p className="text-[8px] md:text-[9px] font-bold text-gray-400 uppercase">Clean</p>
                            </div>
                            <div className="text-center md:text-left">
                                <p className="text-lg md:text-xl font-black text-red-500">{stats.flagged}</p>
                                <p className="text-[8px] md:text-[9px] font-bold text-red-300 uppercase">Flag</p>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="hidden md:block mt-auto p-3 bg-[#a3e635]/5 rounded-lg border border-[#a3e635]/10">
                    <p className="text-[9px] font-bold text-[#0d2a1d] uppercase leading-tight">Pro Tip: Press ENTER to approve instantly.</p>
                </div>
            </div>

            {/* Main Work Area */}
            {!preview ? (
                <div className="flex-1 flex flex-col items-center justify-start pt-8 md:pt-24 p-4 md:p-12">
                    <div className="max-w-md w-full space-y-8 animate-fadeIn">
                        <div className="text-center space-y-2">
                            <h1 className="text-xl font-black text-gray-900 tracking-tighter uppercase">Document Ingestion</h1>
                            <p className="text-xs font-medium text-gray-400 uppercase tracking-widest">Awaiting source material...</p>
                        </div>

                        <div
                            onClick={() => fileInputRef.current?.click()}
                            className="aspect-video w-full bg-white border-2 border-dashed border-gray-300 rounded-2xl flex flex-col items-center justify-center gap-4 cursor-pointer hover:border-[#a3e635] hover:bg-white transition-all group shadow-sm active:scale-[0.98]"
                        >
                            <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center text-gray-300 group-hover:text-[#a3e635] group-hover:bg-[#0d2a1d] transition-all">
                                <i className="fa-solid fa-camera text-xl"></i>
                            </div>
                            <p className="font-bold text-gray-700 text-sm uppercase tracking-tight">Drop or Click to Upload</p>
                            <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" accept="image/*,application/pdf" />
                        </div>

                        <div className="flex items-center gap-4 text-[9px] font-black text-gray-300 justify-center uppercase tracking-[0.2em]">
                            <span>Arabic Numerals</span>
                            <span className="w-1 h-1 bg-gray-200 rounded-full"></span>
                            <span>Nepali Hand-writing</span>
                            <span className="w-1 h-1 bg-gray-200 rounded-full"></span>
                            <span>VAT 13%</span>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="flex-1 flex flex-col md:flex-row animate-fadeIn">
                    {/* Document Preview */}
                    <div className="flex-1 bg-gray-200 flex items-center justify-center p-4 overflow-hidden relative border-r border-gray-300">
                        <img src={preview} alt="Verify" className="max-h-full shadow-2xl ring-1 ring-black/10" />
                        {isProcessing && (
                            <div className="absolute inset-0 bg-white/40 backdrop-blur-sm flex flex-col items-center justify-center z-10">
                                <div className="w-12 h-12 border-4 border-gray-200 border-t-[#0d2a1d] rounded-full animate-spin"></div>
                                <p className="font-black text-[#0d2a1d] uppercase tracking-[0.2em] text-[10px] mt-4">AI extraction in progress...</p>
                            </div>
                        )}
                    </div>

                    {/* High-Density Verify Panel */}
                    <div className="w-full md:w-[340px] bg-white flex flex-col shadow-2xl">
                        <div className="px-5 py-3 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                            <span className="font-black text-gray-900 uppercase text-[10px] tracking-widest">Verify Extracted Data</span>
                            <button onClick={() => setPreview(null)} className="text-gray-400 hover:text-red-500 text-xs"><i className="fa-solid fa-xmark"></i></button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-5 space-y-3.5">
                            <div className="space-y-1">
                                <label className="text-[9px] font-black text-gray-400 uppercase tracking-tighter">Vendor Identity</label>
                                <input
                                    type="text"
                                    value={tempData?.vendor_name || ''}
                                    onChange={(e) => setTempData({ ...tempData, vendor_name: e.target.value })}
                                    className="w-full bg-gray-100/50 border border-gray-200 px-3 py-1.5 text-xs font-black focus:ring-1 focus:ring-[#a3e635] outline-none rounded"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-tighter">Invoice #</label>
                                    <input
                                        type="text"
                                        value={tempData?.invoice_number || ''}
                                        onChange={(e) => setTempData({ ...tempData, invoice_number: e.target.value })}
                                        className="w-full bg-gray-100/50 border border-gray-200 px-3 py-1.5 text-xs font-bold focus:ring-1 focus:ring-[#a3e635] outline-none rounded"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-tighter">Date</label>
                                    <input
                                        type="text"
                                        value={tempData?.invoice_date_raw || ''}
                                        onChange={(e) => setTempData({ ...tempData, invoice_date_raw: e.target.value })}
                                        className="w-full bg-gray-100/50 border border-gray-200 px-3 py-1.5 text-xs font-bold focus:ring-1 focus:ring-[#a3e635] outline-none rounded"
                                    />
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[9px] font-black text-gray-400 uppercase tracking-tighter">Taxable Amount</label>
                                <input
                                    type="number"
                                    value={tempData?.taxable_amount || 0}
                                    onChange={(e) => setTempData({ ...tempData, taxable_amount: parseFloat(e.target.value) })}
                                    className="w-full bg-gray-100/50 border border-gray-200 px-3 py-1.5 text-xs font-black focus:ring-1 focus:ring-[#a3e635] outline-none text-right rounded"
                                />
                            </div>

                            {/* Other Charges Display */}
                            {tempData?.other_charges && tempData.other_charges.length > 0 && (
                                <div className="space-y-1 border-l-2 border-[#a3e635] pl-2 my-2">
                                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-tighter">Add'l Charges</label>
                                    {tempData.other_charges.map((charge: OtherCharge, idx: number) => (
                                        <div key={idx} className="flex justify-between text-[10px] text-gray-600 font-medium">
                                            <span>{charge.name}</span>
                                            <span>{charge.amount}</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="space-y-1">
                                <label className="text-[9px] font-black text-gray-400 uppercase tracking-tighter">VAT (13%)</label>
                                <input
                                    type="number"
                                    value={tempData?.vat_amount || 0}
                                    onChange={(e) => setTempData({ ...tempData, vat_amount: parseFloat(e.target.value) })}
                                    className="w-full bg-gray-100/50 border border-gray-200 px-3 py-1.5 text-xs font-black focus:ring-1 focus:ring-[#a3e635] outline-none text-right rounded"
                                />
                            </div>

                            <div className="mt-4 p-3 bg-[#0d2a1d] rounded-lg shadow-inner">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-[9px] font-black text-[#a3e635]/40 uppercase tracking-widest">Final Grand Total</span>
                                    <span className="text-[9px] font-black text-[#a3e635]/60">NPR</span>
                                </div>
                                <input
                                    type="number"
                                    value={tempData?.grand_total || 0}
                                    onChange={(e) => setTempData({ ...tempData, grand_total: parseFloat(e.target.value) })}
                                    className="w-full bg-transparent text-[#a3e635] text-xl font-black outline-none text-right placeholder-[#a3e635]/20"
                                />
                            </div>
                        </div>

                        <div className="p-5 border-t border-gray-100">
                            <button
                                onClick={handleConfirm}
                                disabled={isProcessing}
                                className="w-full bg-[#a3e635] text-[#0d2a1d] py-3 font-black uppercase tracking-widest text-[11px] rounded shadow-lg shadow-[#a3e635]/20 hover:bg-[#bef264] transition-all disabled:opacity-50 active:scale-[0.98]"
                            >
                                Approve (ENTER)
                            </button>
                            <div className="flex items-center justify-center gap-2 mt-4 opacity-40">
                                <span className="w-1 h-1 bg-gray-400 rounded-full"></span>
                                <p className="text-[9px] font-bold text-gray-600 uppercase">Conveyor-belt mode active</p>
                                <span className="w-1 h-1 bg-gray-400 rounded-full"></span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// ==================== INVOICE INBOX COMPONENT ====================
interface InvoiceInboxProps {
    invoices: InvoiceData[];
    onReview: (invoice: InvoiceData) => void;
}

const InvoiceInbox: React.FC<InvoiceInboxProps> = ({ invoices, onReview }) => {
    const [searchTerm, setSearchTerm] = useState('');

    // Filter logic
    const filtered = invoices.filter(inv => {
        const term = searchTerm.toLowerCase();
        return (
            (inv.vendor_name || '').toLowerCase().includes(term) ||
            (inv.invoice_number || '').toLowerCase().includes(term) ||
            (inv.fiscal_year || '').toLowerCase().includes(term)
        );
    });

    const flagged = filtered.filter(i => Object.values(i.flags).some(f => f));
    const clean = filtered.filter(i => !Object.values(i.flags).some(f => f));
    const hasFlags = flagged.length > 0;

    const renderTable = (list: InvoiceData[], title: string, isFlagged: boolean) => (
        <div className="space-y-4">
            <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                    <h3 className={`text-[10px] font-black uppercase tracking-[0.1em] ${isFlagged ? 'text-red-500' : 'text-gray-400'}`}>
                        {title}
                    </h3>
                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${isFlagged ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500'}`}>
                        {list.length}
                    </span>
                </div>
            </div>

            <div className="bg-white border border-gray-200 shadow-sm rounded-sm overflow-hidden">
                <table className="w-full text-left border-collapse table-fixed">
                    <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                            <th className="w-10 px-4 py-2 text-[9px] font-black text-gray-400 uppercase text-center">Act</th>
                            <th className="w-1/4 px-4 py-2 text-[9px] font-black text-gray-400 uppercase">Vendor & Date</th>
                            <th className="px-4 py-2 text-[9px] font-black text-gray-400 uppercase">Financial Breakdown (NPR)</th>
                            <th className="w-32 px-4 py-2 text-[9px] font-black text-gray-400 uppercase text-right">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {list.map((inv) => {
                            const otherChargesSum = (inv.other_charges || []).reduce((sum, c) => sum + c.amount, 0);
                            return (
                                <tr key={inv.invoice_id} className={`group transition-all ${isFlagged ? 'bg-red-50/10 hover:bg-red-50/30' : 'hover:bg-gray-50'}`}>
                                    <td className="px-2 py-3 text-center border-l-2 border-transparent group-hover:border-[#0d2a1d] group-[.bg-red-50\/10]:border-red-500/20">
                                        <button
                                            onClick={() => onReview(inv)}
                                            className="w-6 h-6 bg-[#0d2a1d] text-[#a3e635] rounded inline-flex items-center justify-center text-[10px] shadow hover:scale-110 transition-all opacity-0 group-hover:opacity-100"
                                            title="Review Invoice"
                                        >
                                            <i className="fa-solid fa-pen"></i>
                                        </button>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="font-black text-gray-900 text-[11px] truncate uppercase leading-tight mb-1">
                                            {(inv.vendor_name || 'UNIDENTIFIED VENDOR')}
                                        </div>
                                        <div className="flex gap-2 text-[9px] font-bold text-gray-400 uppercase tracking-tighter">
                                            <span className="bg-gray-100 px-1 rounded text-gray-500">#{inv.invoice_number || '---'}</span>
                                            <span>•</span>
                                            <span>{inv.invoice_date_raw || 'No Date'}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex gap-4 text-[10px] items-center">
                                            <div className="flex flex-col">
                                                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-tighter">Taxable</span>
                                                <span className="font-mono font-medium text-gray-600">{inv.taxable_amount?.toLocaleString()}</span>
                                            </div>

                                            {/* Show Other Charges if exist */}
                                            {inv.other_charges && inv.other_charges.length > 0 && (
                                                <>
                                                    <span className="text-gray-300 text-[9px]">+</span>
                                                    <div className="flex flex-col">
                                                        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-tighter">Charges</span>
                                                        <div className="group/charges relative cursor-help">
                                                            <span className="font-mono font-medium text-gray-600 underline decoration-dotted decoration-gray-300">{otherChargesSum.toLocaleString()}</span>
                                                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover/charges:block bg-gray-900 text-white text-[9px] p-2 rounded whitespace-nowrap z-10 shadow-xl">
                                                                {inv.other_charges.map((c, i) => (
                                                                    <div key={i} className="flex justify-between gap-3">
                                                                        <span>{c.name}:</span>
                                                                        <span>{c.amount}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </>
                                            )}

                                            <span className="text-gray-300 text-[9px]">+</span>
                                            <div className="flex flex-col">
                                                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-tighter">VAT</span>
                                                <span className="font-mono font-medium text-gray-600">{inv.vat_amount?.toLocaleString()}</span>
                                            </div>

                                            <span className="text-gray-300 text-[9px]">=</span>
                                            <div className="flex flex-col">
                                                <span className="text-[9px] font-bold text-[#0d2a1d] uppercase tracking-tighter">Total</span>
                                                <span className="font-mono font-black text-[#0d2a1d] text-xs bg-[#a3e635]/20 px-1 rounded">{inv.grand_total?.toLocaleString()}</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        {Object.values(inv.flags).some(f => f) ? (
                                            <span className="inline-flex items-center gap-1 text-[9px] font-black text-red-600 bg-red-50 border border-red-100 px-2 py-1 rounded-full uppercase tracking-wider">
                                                <i className="fa-solid fa-triangle-exclamation"></i> CHECK
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 text-[9px] font-black text-[#0d2a1d] bg-[#a3e635] px-2 py-1 rounded-full uppercase tracking-wider shadow-sm shadow-[#a3e635]/30">
                                                <i className="fa-solid fa-check"></i> Clean
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                        {list.length === 0 && (
                            <tr>
                                <td colSpan={4} className="px-4 py-8 text-center text-[10px] text-gray-400 italic">
                                    No invoices found matching your filters.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );

    return (
        <div className="p-8 max-w-5xl mx-auto space-y-8">
            {/* Search / Filter Bar */}
            <div className="flex items-center justify-between mb-8">
                <div className="space-y-1">
                    <h2 className="text-2xl font-black uppercase tracking-tighter text-[#0d2a1d]">Ledger Inbox</h2>
                    <p className="text-[11px] text-gray-400 font-bold uppercase tracking-widest">Review & Post to Accounting</p>
                </div>
                <div className="relative group">
                    <i className="fa-solid fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
                    <input
                        type="text"
                        placeholder="Filter by Vendor, Inv #, Year..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-xs font-bold outline-none focus:border-[#0d2a1d] focus:ring-1 focus:ring-[#0d2a1d] w-64 transition-all"
                    />
                </div>
            </div>

            {/* Flagged Section (Always visible if any) */}
            {hasFlags && renderTable(flagged, 'Exceptions detected', true)}

            {/* Clean Section */}
            {renderTable(clean, 'Ready for Posting', false)}
        </div>
    );
};

// ==================== REVIEW SCREEN COMPONENT ====================
interface ReviewScreenProps {
    invoice: InvoiceData;
    onSave: (data: Partial<InvoiceData>) => void;
    onCancel: () => void;
}

const ReviewScreen: React.FC<ReviewScreenProps> = ({ invoice, onSave, onCancel }) => {
    const [formData, setFormData] = useState<Partial<InvoiceData>>({ ...invoice });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value, type } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'number' ? parseFloat(value) || 0 : value
        }));
    };

    const handleApprove = () => {
        onSave({ ...formData, status: InvoiceStatus.APPROVED, flags: { math_mismatch: false, vat_inconsistent: false, missing_fields: false } });
    };

    // Keyboard support for Review
    useEffect(() => {
        const handleKeydown = (e: KeyboardEvent) => {
            if (e.key === 'Enter') handleApprove();
            if (e.key === 'Escape') onCancel();
        };
        window.addEventListener('keydown', handleKeydown);
        return () => window.removeEventListener('keydown', handleKeydown);
    }, [formData]);

    const hasFlags = Object.values(invoice.flags).some(f => f);

    return (
        <div className="fixed inset-0 z-50 bg-[#0d2a1d]/90 backdrop-blur-sm flex items-center justify-center p-0 md:p-12">
            <div className="bg-white w-full h-full md:rounded-lg shadow-2xl flex flex-col md:flex-row overflow-hidden max-w-[1400px]">

                {/* Left: Document View */}
                <div className="flex-1 bg-[#f1f5f9] flex flex-col relative overflow-hidden border-r border-gray-200">
                    <div className="absolute top-4 left-4 z-10">
                        <button
                            onClick={onCancel}
                            className="px-3 py-1.5 bg-white rounded shadow-lg text-[10px] font-black uppercase tracking-widest text-gray-700 hover:bg-gray-50 flex items-center gap-2 border border-gray-100"
                        >
                            <i className="fa-solid fa-arrow-left"></i> ESC to Close
                        </button>
                    </div>

                    <div className="flex-1 overflow-auto p-8 flex items-center justify-center">
                        <img
                            src={invoice.image_urls[0]}
                            alt="Document Reference"
                            className="max-w-full shadow-2xl ring-1 ring-black/5 rounded-sm"
                        />
                    </div>

                    <div className="h-10 bg-white/50 backdrop-blur-md border-t border-gray-200 flex items-center justify-center gap-6 px-6">
                        <button className="text-gray-400 hover:text-[#0d2a1d] transition-colors text-xs"><i className="fa-solid fa-magnifying-glass-plus"></i></button>
                        <button className="text-gray-400 hover:text-[#0d2a1d] transition-colors text-xs"><i className="fa-solid fa-magnifying-glass-minus"></i></button>
                        <div className="w-[1px] h-4 bg-gray-300 mx-2"></div>
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Reference Inbound Image 01</span>
                    </div>
                </div>

                {/* Right: Operational Panel */}
                <div className="w-full md:w-[400px] bg-white flex flex-col shadow-2xl z-10">
                    <div className="p-6 space-y-6 flex-1 overflow-y-auto">
                        <div className="flex items-start justify-between border-b border-gray-50 pb-4">
                            <div>
                                <h2 className="text-sm font-black text-gray-900 uppercase tracking-widest">Resolve Discrepancy</h2>
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tight">System Confidence: {Math.round(invoice.confidence_score * 100)}%</p>
                            </div>
                        </div>

                        {hasFlags && (
                            <div className="bg-red-600 p-4 rounded text-white space-y-1 shadow-md">
                                <p className="text-[9px] font-black uppercase tracking-widest flex items-center gap-2">
                                    <i className="fa-solid fa-triangle-exclamation"></i> Action Required
                                </p>
                                <div className="text-[11px] font-bold opacity-90 leading-tight">
                                    {invoice.flags.math_mismatch && <p>• Total does not equal Sum of Parts.</p>}
                                    {invoice.flags.vat_inconsistent && <p>• Tax rate variance detected.</p>}
                                    {invoice.flags.missing_fields && <p>• Mandatory header fields are NULL.</p>}
                                </div>
                            </div>
                        )}

                        <div className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-[9px] font-black text-gray-400 uppercase tracking-tighter">Vendor (Audit Label)</label>
                                <input
                                    type="text"
                                    name="vendor_name"
                                    value={formData.vendor_name || ''}
                                    onChange={handleChange}
                                    className="w-full bg-gray-50 border border-gray-200 px-3 py-2 text-xs font-black focus:ring-1 focus:ring-[#a3e635] outline-none rounded"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-tighter">Invoice #</label>
                                    <input
                                        type="text"
                                        name="invoice_number"
                                        value={formData.invoice_number || ''}
                                        onChange={handleChange}
                                        className="w-full bg-gray-50 border border-gray-200 px-3 py-2 text-xs font-bold focus:ring-1 focus:ring-[#a3e635] outline-none rounded"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-tighter">Raw Date</label>
                                    <input
                                        type="text"
                                        name="invoice_date_raw"
                                        value={formData.invoice_date_raw || ''}
                                        onChange={handleChange}
                                        className="w-full bg-gray-50 border border-gray-200 px-3 py-2 text-xs font-bold focus:ring-1 focus:ring-[#a3e635] outline-none rounded"
                                    />
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[9px] font-black text-gray-400 uppercase tracking-tighter">Taxable Value</label>
                                <input
                                    type="number"
                                    name="taxable_amount"
                                    value={formData.taxable_amount || 0}
                                    onChange={handleChange}
                                    className="w-full bg-gray-50 border border-gray-200 px-3 py-2 text-xs font-black focus:ring-1 focus:ring-[#a3e635] outline-none rounded"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-tighter">VAT Value</label>
                                    <input
                                        type="number"
                                        name="vat_amount"
                                        value={formData.vat_amount || 0}
                                        onChange={handleChange}
                                        className="w-full bg-gray-50 border border-gray-200 px-3 py-2 text-xs font-black focus:ring-1 focus:ring-[#a3e635] outline-none rounded"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-tighter">Currency</label>
                                    <input
                                        type="text"
                                        name="currency"
                                        value={formData.currency || 'NPR'}
                                        onChange={handleChange}
                                        className="w-full bg-gray-50 border border-gray-200 px-3 py-2 text-xs font-bold focus:ring-1 focus:ring-[#a3e635] outline-none rounded"
                                    />
                                </div>
                            </div>

                            <div className="pt-4 border-t border-gray-100">
                                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2 block">Corrected Grand Total</label>
                                <div className="flex bg-[#0d2a1d] text-[#a3e635] p-4 rounded shadow-inner items-center">
                                    <span className="text-xs font-bold opacity-40 mr-4">NPR</span>
                                    <input
                                        type="number"
                                        name="grand_total"
                                        value={formData.grand_total || 0}
                                        onChange={handleChange}
                                        className="flex-1 bg-transparent text-2xl font-black outline-none text-right"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="p-6 bg-gray-50 border-t border-gray-100 flex flex-col gap-3">
                        <button
                            onClick={handleApprove}
                            className="w-full bg-[#a3e635] text-[#0d2a1d] py-4 rounded font-black uppercase tracking-[0.2em] text-xs shadow-lg shadow-[#a3e635]/20 hover:scale-[1.02] transition-all"
                        >
                            Approve (ENTER)
                        </button>
                        <div className="text-center">
                            <span className="text-[9px] font-black text-gray-300 uppercase tracking-widest">Audit Trail Logged on Approval</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ==================== EXPORT VIEW COMPONENT ====================
interface ExportViewProps {
    invoices: InvoiceData[];
    flaggedCount: number;
    onNavigateToReview: () => void;
}

const ExportView: React.FC<ExportViewProps> = ({ invoices, flaggedCount, onNavigateToReview }) => {
    const handleExportCSV = () => {
        const approvedInvoices = invoices.filter(i => i.status === InvoiceStatus.APPROVED || !Object.values(i.flags).some(f => f));

        // Generate CSV content
        const headers = ['Invoice ID', 'Vendor', 'Invoice #', 'Date', 'Taxable', 'VAT', 'Grand Total', 'Currency', 'Status'];
        const rows = approvedInvoices.map(inv => [
            inv.invoice_id,
            inv.vendor_name || 'N/A',
            inv.invoice_number || 'N/A',
            inv.invoice_date_raw || 'N/A',
            inv.taxable_amount?.toString() || '0',
            inv.vat_amount?.toString() || '0',
            inv.grand_total?.toString() || '0',
            inv.currency,
            inv.status
        ]);

        const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `invoices_export_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="p-12 max-w-xl mx-auto space-y-8">
            <div className="text-center space-y-2">
                <h2 className="text-2xl font-black uppercase tracking-tighter">Export Control</h2>
                <p className="text-[11px] text-gray-400 font-bold uppercase tracking-widest">Ledger Integrity Checkpoint</p>
            </div>

            {flaggedCount > 0 ? (
                <div className="bg-red-50 border-2 border-red-100 p-8 rounded-2xl text-center space-y-4">
                    <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto text-2xl">
                        <i className="fa-solid fa-hand"></i>
                    </div>
                    <h3 className="text-red-900 font-black uppercase text-sm tracking-widest">Export Gated</h3>
                    <p className="text-red-700/60 text-xs font-medium">You cannot export while {flaggedCount} invoices remain flagged. All discrepancies must be resolved to maintain audit compliance.</p>
                    <button
                        onClick={onNavigateToReview}
                        className="inline-block bg-[#0d2a1d] text-white px-6 py-3 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-black"
                    >
                        Resolve Flagged Items
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4">
                    <button
                        onClick={handleExportCSV}
                        className="bg-[#a3e635] text-[#0d2a1d] p-10 rounded-2xl border-2 border-transparent hover:scale-[1.02] transition-all flex flex-col items-center gap-4"
                    >
                        <i className="fa-solid fa-file-csv text-4xl"></i>
                        <span className="font-black uppercase text-[12px] tracking-widest">Generate Audit CSV</span>
                    </button>
                    <button className="bg-white border-2 border-gray-100 p-10 rounded-2xl hover:border-[#a3e635] transition-all flex flex-col items-center gap-4">
                        <i className="fa-solid fa-file-excel text-4xl text-gray-300"></i>
                        <span className="font-black uppercase text-[12px] tracking-widest text-gray-400">Generate Excel</span>
                    </button>
                </div>
            )}

            <div className="p-4 bg-gray-100 rounded text-left border border-gray-200">
                <h4 className="text-[9px] font-black text-gray-400 uppercase mb-3 tracking-[0.2em]">Workset Summary</h4>
                <div className="flex justify-between text-[11px] font-bold text-gray-700">
                    <span className="uppercase opacity-40">Clean Ledger Invoices</span>
                    <span>{invoices.filter(i => i.status === InvoiceStatus.APPROVED || !Object.values(i.flags).some(f => f)).length}</span>
                </div>
                <div className={`flex justify-between text-[11px] font-bold mt-2 ${flaggedCount > 0 ? 'text-red-500' : 'text-gray-400 opacity-20'}`}>
                    <span className="uppercase opacity-40">Flagged Exceptions</span>
                    <span>{flaggedCount}</span>
                </div>
            </div>
        </div>
    );
};

// ==================== MAIN APP COMPONENT ====================
// ==================== MAIN APP COMPONENT ====================
// ==================== MAIN APP COMPONENT ====================
// ==================== MAIN APP COMPONENT ====================
export default function InvoiceVisionApp() {
    const [activeTab, setActiveTab] = useState('ingest');

    // Data States
    const [companies, setCompanies] = useState<DBCompany[]>([]);
    const [selectedCompany, setSelectedCompany] = useState<DBCompany | null>(null);
    const [fiscalYears, setFiscalYears] = useState<DBFiscalYear[]>([]);
    const [selectedFY, setSelectedFY] = useState<DBFiscalYear | null>(null);

    const [invoices, setInvoices] = useState<InvoiceData[]>([]);
    const [pendingCount, setPendingCount] = useState(0);
    const [reviewingInvoice, setReviewingInvoice] = useState<InvoiceData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [sessionCount, setSessionCount] = useState(0);

    // Initial Load
    useEffect(() => {
        const loadInitialData = async () => {
            try {
                const firms = await getDefaultFirm();
                const list = await fetchCompanies();
                setCompanies(list);

                if (list.length > 0) {
                    const first = list[0];
                    setSelectedCompany(first);
                    // Load FYs for first company
                    const fylist = await fetchFiscalYears(first.id);
                    setFiscalYears(fylist);
                    if (fylist.length > 0) {
                        setSelectedFY(fylist[0]);
                    } else {
                        const newFy = await createFiscalYear(first.id, '2080/81');
                        setFiscalYears([newFy]);
                        setSelectedFY(newFy);
                    }
                }
            } catch (e) {
                console.error("Init Error", e);
            } finally {
                setIsLoading(false);
            }
        };
        loadInitialData();
    }, []);

    // Load Invoices and Queue
    const updateWorkspaceAndLoadInvoices = useCallback(async () => {
        if (!selectedCompany) return;

        const fyLabel = selectedFY?.label || '2080/81';

        try {
            const wsId = await ensureWorkspace(selectedCompany.id, fyLabel);
            const data = await fetchInvoices(wsId);

            // Map DB Invoice to Frontend Type
            const mapped: InvoiceData[] = data.map((inv: any) => ({
                invoice_id: inv.id,
                company_id: inv.workspace_id,
                fiscal_year: inv.invoice_date_raw || fyLabel,
                vendor_name: inv.vendor_name_en,
                invoice_number: inv.invoice_number_en,
                invoice_date_raw: inv.invoice_date_raw,
                taxable_amount: inv.taxable_amount,
                vat_amount: inv.vat_amount,
                grand_total: inv.grand_total,
                currency: inv.currency,
                flags: {
                    math_mismatch: inv.invoice_flags?.[0]?.math_mismatch || false,
                    vat_inconsistent: inv.invoice_flags?.[0]?.vat_inconsistent || false,
                    missing_fields: inv.invoice_flags?.[0]?.missing_fields || false
                },
                status: inv.status as InvoiceStatus,
                confidence_score: 0.9,
                image_urls: [],
                created_at: inv.created_at,
                line_items: inv.line_items || [],
                other_charges: inv.other_charges || []
            }));

            setInvoices(mapped);

            // Fetch Queue Count
            const { count } = await supabase
                .from('processing_queue')
                .select('*', { count: 'exact', head: true })
                .eq('workspace_id', wsId)
                .eq('status', 'pending');

            setPendingCount(count || 0);

        } catch (e) {
            console.error("Load Error", e);
        }
    }, [selectedCompany, selectedFY]);

    // Effect to update data when selection changes
    useEffect(() => {
        if (!isLoading) {
            updateWorkspaceAndLoadInvoices();
        }
    }, [selectedCompany, selectedFY, updateWorkspaceAndLoadInvoices, isLoading]);

    // Poll for pending items
    useEffect(() => {
        if (pendingCount > 0) {
            const interval = setInterval(() => {
                updateWorkspaceAndLoadInvoices();
            }, 5000);
            return () => clearInterval(interval);
        }
    }, [pendingCount, updateWorkspaceAndLoadInvoices]);


    // Handlers
    const handleSwitchCompany = async (c: DBCompany) => {
        setSelectedCompany(c);
        const fylist = await fetchFiscalYears(c.id);
        setFiscalYears(fylist);
        if (fylist.length > 0) setSelectedFY(fylist[0]);
    };

    const handleSwitchFY = (fy: DBFiscalYear) => setSelectedFY(fy);

    const handleAddCompany = async () => {
        const name = prompt("Company Name:");
        if (!name) return;
        try {
            const firm = await getDefaultFirm();
            const newC = await createCompany(name, firm.id);
            setCompanies(prev => [...prev, newC]);
            handleSwitchCompany(newC);
        } catch (e) { alert(e); }
    };

    const handleAddFY = async () => {
        if (!selectedCompany) return;
        const label = prompt("Fiscal Year:");
        if (!label) return;
        try {
            const newFy = await createFiscalYear(selectedCompany.id, label);
            setFiscalYears(prev => [newFy, ...prev]);
            setSelectedFY(newFy);
        } catch (e) { alert(e); }
    };

    const handleUploadComplete = async (newInv: InvoiceData) => {
        if (!selectedCompany) return;
        try {
            const fyLabel = selectedFY?.label || '2080/81';
            const wsId = await ensureWorkspace(selectedCompany.id, fyLabel);
            await createInvoice(newInv, wsId);
            updateWorkspaceAndLoadInvoices();
            setSessionCount(prev => prev + 1);
        } catch (e) { alert(e); }
    };

    const handleBatchUpload = async (files: File[]) => {
        if (!selectedCompany) {
            alert("No Company Selected");
            return;
        }

        const fyLabel = selectedFY?.label || '2080/81';
        try {
            const wsId = await ensureWorkspace(selectedCompany.id, fyLabel);
            const bucket = 'invoice_uploads';

            // Upload 5 at a time
            const CHUNK_SIZE = 5;
            for (let i = 0; i < files.length; i += CHUNK_SIZE) {
                const chunk = files.slice(i, i + CHUNK_SIZE);
                await Promise.all(chunk.map(async (file) => {
                    const ext = file.name.split('.').pop();
                    const path = `${wsId}/${uuidv4()}.${ext}`;

                    const { error } = await supabase.storage.from(bucket).upload(path, file);
                    if (!error) {
                        await supabase.from('processing_queue').insert({
                            workspace_id: wsId,
                            file_path: path,
                            status: 'pending'
                        });
                    }
                }));
            }

            // Immediate update to show pending count
            updateWorkspaceAndLoadInvoices();

        } catch (e) {
            console.error(e);
            alert("Upload Error");
        }
    };

    const handleSaveReview = (data: Partial<InvoiceData>) => {
        if (!reviewingInvoice) return;
        setInvoices(prev => prev.map(i => i.invoice_id === reviewingInvoice.invoice_id ? { ...i, ...data } : i));
        setReviewingInvoice(null);
    };

    const filteredInvoices = invoices;
    const flaggedCount = filteredInvoices.filter(i => Object.values(i.flags).some(f => f)).length;


    return (
        <div className="flex min-h-screen bg-[#f8fafc] text-gray-800 antialiased selection:bg-[#a3e635] selection:text-[#0d2a1d]">
            <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
            <main className="flex-1 flex flex-col min-h-screen md:h-screen md:overflow-hidden">
                <TopBar
                    selectedCompany={selectedCompany}
                    selectedFY={selectedFY}
                    companies={companies}
                    fiscalYears={fiscalYears}
                    onSwitchCompany={handleSwitchCompany}
                    onAddCompany={handleAddCompany}
                    onSwitchFY={handleSwitchFY}
                    onAddFY={handleAddFY}
                />
                <div className="flex-1 overflow-y-auto">
                    {activeTab === 'ingest' && (
                        <UploadView
                            onComplete={handleUploadComplete}
                            onBatchUpload={handleBatchUpload}
                            stats={{
                                total: filteredInvoices.length + pendingCount,
                                flagged: flaggedCount,
                                clean: filteredInvoices.length - flaggedCount
                            }}
                        />
                    )}
                    {activeTab === 'review' && (
                        <InvoiceInbox
                            invoices={filteredInvoices}
                            onReview={setReviewingInvoice}
                        />
                    )}
                    {activeTab === 'export' && (
                        <ExportView
                            invoices={invoices}
                            flaggedCount={flaggedCount}
                            onNavigateToReview={() => setActiveTab('review')}
                        />
                    )}
                </div>
            </main>
            {reviewingInvoice && (
                <ReviewScreen
                    invoice={reviewingInvoice}
                    onCancel={() => setReviewingInvoice(null)}
                    onSave={handleSaveReview}
                />
            )}
            <style jsx global>{`
                @keyframes fadeIn {
                  from { opacity: 0; transform: translateY(2px); }
                  to { opacity: 1; transform: translateY(0); }
                }
                .animate-fadeIn { animation: fadeIn 0.1s ease-out forwards; }
                ::-webkit-scrollbar { width: 4px; }
                ::-webkit-scrollbar-thumb { background: #0d2a1d; border-radius: 0; }
                ::-webkit-scrollbar-track { background: #f1f5f9; }
            `}</style>
        </div>
    );
}
