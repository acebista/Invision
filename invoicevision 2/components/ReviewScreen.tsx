
import React, { useState, useEffect } from 'react';
import { InvoiceData, InvoiceStatus } from '../types';

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
    onSave({ ...formData, status: InvoiceStatus.APPROVED });
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

export default ReviewScreen;
