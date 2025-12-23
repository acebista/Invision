
import React, { useState, useRef, useEffect } from 'react';
import { extractInvoiceData } from '../services/geminiService';
import { InvoiceData, InvoiceStatus } from '../types';

interface UploadViewProps {
  onComplete: (invoice: InvoiceData) => void;
  sessionCount: number;
}

const UploadView: React.FC<UploadViewProps> = ({ onComplete, sessionCount }) => {
  const [preview, setPreview] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [tempData, setTempData] = useState<Partial<InvoiceData> | null>(null);
  const [lastActionTime, setLastActionTime] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
        processImage(reader.result as string);
      };
      reader.readAsDataURL(selected);
    }
  };

  const processImage = async (base64: string) => {
    setIsProcessing(true);
    try {
      const extracted = await extractInvoiceData(base64);
      setTempData(extracted);
    } catch (err) {
      alert("Extraction failed. Check API key.");
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

    const newInvoice: InvoiceData = {
      invoice_id: Math.random().toString(36).substring(7),
      company_id: 'default',
      fiscal_year: '2080/81',
      ...tempData as any,
      flags: {
        math_mismatch: Math.abs((taxable + vat) - total) > 0.01,
        vat_inconsistent: Math.abs(vat - (taxable * 0.13)) > (taxable * 0.01),
        missing_fields: !tempData.invoice_number || !tempData.vendor_name
      },
      status: InvoiceStatus.PENDING_REVIEW,
      confidence_score: 0.9,
      image_urls: [preview],
      created_at: new Date().toISOString()
    };
    
    onComplete(newInvoice);
    setLastActionTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    setPreview(null);
    setTempData(null);
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
    <div className="flex h-[calc(100vh-48px)] overflow-hidden bg-gray-50/50">
      {/* Sidebar-style session stats */}
      <div className="w-48 bg-white border-r border-gray-200 p-4 flex flex-col gap-6">
        <div>
          <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Session Metrics</h4>
          <div className="space-y-4">
             <div>
                <p className="text-2xl font-black text-[#0d2a1d]">{sessionCount}</p>
                <p className="text-[10px] font-bold text-gray-500 uppercase">Invoices Ingested</p>
             </div>
             {lastActionTime && (
               <div>
                  <p className="text-xs font-black text-[#a3e635] bg-[#0d2a1d] inline-block px-1.5 py-0.5 rounded uppercase">Success</p>
                  <p className="text-[10px] font-bold text-gray-400 mt-1 uppercase">Last: {lastActionTime}</p>
               </div>
             )}
          </div>
        </div>
        <div className="mt-auto p-3 bg-[#a3e635]/5 rounded-lg border border-[#a3e635]/10">
           <p className="text-[9px] font-bold text-[#0d2a1d] uppercase leading-tight">Pro Tip: Press ENTER to approve and advance instantly.</p>
        </div>
      </div>

      {/* Main Work Area */}
      {!preview ? (
        <div className="flex-1 flex flex-col items-center justify-start pt-24 p-12">
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
              <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" />
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
                  onChange={(e) => setTempData({...tempData, vendor_name: e.target.value})}
                  className="w-full bg-gray-100/50 border border-gray-200 px-3 py-1.5 text-xs font-black focus:ring-1 focus:ring-[#a3e635] outline-none rounded"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-tighter">Invoice #</label>
                  <input 
                    type="text" 
                    value={tempData?.invoice_number || ''} 
                    onChange={(e) => setTempData({...tempData, invoice_number: e.target.value})}
                    className="w-full bg-gray-100/50 border border-gray-200 px-3 py-1.5 text-xs font-bold focus:ring-1 focus:ring-[#a3e635] outline-none rounded"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-tighter">Date</label>
                  <input 
                    type="text" 
                    value={tempData?.invoice_date_raw || ''} 
                    onChange={(e) => setTempData({...tempData, invoice_date_raw: e.target.value})}
                    className="w-full bg-gray-100/50 border border-gray-200 px-3 py-1.5 text-xs font-bold focus:ring-1 focus:ring-[#a3e635] outline-none rounded"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-tighter">Taxable Amount</label>
                <input 
                  type="number" 
                  value={tempData?.taxable_amount || 0} 
                  onChange={(e) => setTempData({...tempData, taxable_amount: parseFloat(e.target.value)})}
                  className="w-full bg-gray-100/50 border border-gray-200 px-3 py-1.5 text-xs font-black focus:ring-1 focus:ring-[#a3e635] outline-none text-right rounded"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-tighter">VAT (13%)</label>
                <input 
                  type="number" 
                  value={tempData?.vat_amount || 0} 
                  onChange={(e) => setTempData({...tempData, vat_amount: parseFloat(e.target.value)})}
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
                  onChange={(e) => setTempData({...tempData, grand_total: parseFloat(e.target.value)})}
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

export default UploadView;
