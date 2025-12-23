
import React from 'react';
import { InvoiceData, InvoiceStatus } from '../types';

interface InvoiceInboxProps {
  invoices: InvoiceData[];
  onReview: (invoice: InvoiceData) => void;
}

const InvoiceInbox: React.FC<InvoiceInboxProps> = ({ invoices, onReview }) => {
  const flagged = invoices.filter(i => Object.values(i.flags).some(f => f));
  const clean = invoices.filter(i => !Object.values(i.flags).some(f => f));
  const hasFlags = flagged.length > 0;

  const renderTable = (list: InvoiceData[], title: string, isFlagged: boolean) => (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-4">
        <h3 className={`text-[10px] font-black uppercase tracking-[0.1em] ${isFlagged ? 'text-red-500' : 'text-gray-400'}`}>
          {title}
        </h3>
        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${isFlagged ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500'}`}>
          {list.length}
        </span>
      </div>
      <div className="bg-white border border-gray-200 shadow-sm rounded-sm">
        <table className="w-full text-left border-collapse table-fixed">
          <thead>
            <tr className="bg-gray-50/80 border-b border-gray-200">
              <th className="w-12 px-4 py-2 text-[9px] font-black text-gray-400 uppercase">Action</th>
              <th className="px-4 py-2 text-[9px] font-black text-gray-400 uppercase">Vendor & Reference</th>
              <th className="w-48 px-4 py-2 text-[9px] font-black text-gray-400 uppercase">Header Totals</th>
              <th className="w-40 px-4 py-2 text-[9px] font-black text-gray-400 uppercase">Discrepancy</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {list.map((inv) => (
              <tr key={inv.invoice_id} className={`group transition-colors ${isFlagged ? 'bg-red-50/30 hover:bg-red-50/50' : 'hover:bg-gray-50'}`}>
                <td className="px-4 py-2 border-l-2 border-transparent group-hover:border-[#0d2a1d] group-[.bg-red-50\/30]:border-red-500/20">
                  <button 
                    onClick={() => onReview(inv)}
                    className="w-7 h-7 bg-[#0d2a1d] text-[#a3e635] rounded flex items-center justify-center text-[10px] shadow hover:bg-black transition-all"
                    title="Review Item"
                  >
                    <i className="fa-solid fa-pen-to-square"></i>
                  </button>
                </td>
                <td className="px-4 py-2">
                  <div className="font-black text-gray-900 text-[11px] truncate uppercase">{(inv.vendor_name || 'UNIDENTIFIED VENDOR')}</div>
                  <div className="text-[9px] text-gray-400 font-bold uppercase tracking-tighter">Doc #{inv.invoice_number || 'NULL'} • {inv.invoice_date_raw || '??'}</div>
                </td>
                <td className="px-4 py-2 font-mono text-[10px]">
                  <div className="flex justify-between text-gray-400 font-bold">
                    <span>Tax/VAT</span>
                    <span className="text-gray-900">{inv.taxable_amount?.toLocaleString()} / {inv.vat_amount?.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between border-t border-gray-100 mt-1 pt-0.5">
                    <span className="font-bold text-gray-400 uppercase text-[8px]">Total</span>
                    <span className="font-black text-gray-900">{inv.grand_total?.toLocaleString()}</span>
                  </div>
                </td>
                <td className="px-4 py-2">
                  <div className="flex flex-wrap gap-1">
                    {inv.flags.math_mismatch && <span className="bg-red-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded tracking-tighter uppercase">Math Fail</span>}
                    {inv.flags.vat_inconsistent && <span className="bg-orange-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded tracking-tighter uppercase">VAT @ 13%?</span>}
                    {inv.flags.missing_fields && <span className="bg-gray-800 text-white text-[8px] font-black px-1.5 py-0.5 rounded tracking-tighter uppercase">Incomplete</span>}
                    {!Object.values(inv.flags).some(f => f) && <span className="text-[8px] font-black text-green-600 uppercase"><i className="fa-solid fa-check mr-1"></i> Clean</span>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="p-4 space-y-6 animate-fadeIn bg-gray-50/50 min-h-full">
      {/* Urgency Banner */}
      {hasFlags && (
        <div className="bg-[#0d2a1d] text-white p-3 rounded flex items-center justify-between border-l-4 border-red-500 shadow-md">
           <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-red-500 rounded flex items-center justify-center animate-pulse">
                <i className="fa-solid fa-triangle-exclamation text-white"></i>
              </div>
              <div>
                <p className="text-[11px] font-black uppercase tracking-widest">Urgency Warning: Verification Required</p>
                <p className="text-[10px] text-white/60 font-medium">You have {flagged.length} items with critical discrepancies. These must be resolved for ledger accuracy.</p>
              </div>
           </div>
           <button onClick={() => onReview(flagged[0])} className="bg-[#a3e635] text-[#0d2a1d] px-3 py-1.5 rounded text-[10px] font-black uppercase tracking-widest hover:bg-white transition-all">
             Begin Resolve
           </button>
        </div>
      )}

      <div className="flex justify-between items-center px-1">
        <div>
          <h2 className="text-lg font-black text-gray-900 uppercase tracking-tighter">Review Queue</h2>
          <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">Manual checkpoint for extraction accuracy</p>
        </div>
        <div className="flex gap-2">
           <button className="px-3 py-1 bg-white border border-gray-300 text-[9px] font-black uppercase tracking-widest rounded hover:bg-gray-50">
             Clear Queue
           </button>
        </div>
      </div>

      <div className="space-y-8">
        {flagged.length > 0 && renderTable(flagged, "Priority: High Variance Items", true)}
        {clean.length > 0 && renderTable(clean, "Secondary: Baseline Verification", false)}
      </div>

      {invoices.length === 0 && (
        <div className="py-24 text-center">
          <i className="fa-solid fa-box-open text-4xl text-gray-200 mb-4 block"></i>
          <p className="text-[10px] font-black uppercase text-gray-400 tracking-[0.2em]">All items cleared</p>
        </div>
      )}
    </div>
  );
};

export default InvoiceInbox;
