
import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import InvoiceInbox from './components/InvoiceInbox';
import UploadView from './components/UploadView';
import ReviewScreen from './components/ReviewScreen';
import { InvoiceData, Company, FiscalYear, InvoiceStatus } from './types';

const MOCK_COMPANIES: Company[] = [
  { id: '1', name: 'Valley Traders P. Ltd.' },
];

const MOCK_FY: FiscalYear[] = [
  { id: '2080-81', label: 'FY 2080/81' },
];

const INITIAL_INVOICES: InvoiceData[] = [
  {
    invoice_id: '102',
    company_id: '1',
    fiscal_year: '2080-81',
    vendor_name: null,
    invoice_number: '881',
    invoice_date_raw: 'Aug 22, 2024',
    taxable_amount: 1000,
    vat_amount: 130,
    grand_total: 1200,
    currency: 'NPR',
    flags: { math_mismatch: true, vat_inconsistent: false, missing_fields: true },
    status: InvoiceStatus.PENDING_REVIEW,
    confidence_score: 0.65,
    image_urls: ['https://picsum.photos/seed/inv2/800/1200'],
    created_at: new Date().toISOString()
  }
];

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('ingest');
  const [selectedCompany, setSelectedCompany] = useState(MOCK_COMPANIES[0]);
  const [selectedFY, setSelectedFY] = useState(MOCK_FY[0]);
  const [invoices, setInvoices] = useState<InvoiceData[]>(INITIAL_INVOICES);
  const [sessionCount, setSessionCount] = useState(0);
  const [reviewingInvoice, setReviewingInvoice] = useState<InvoiceData | null>(null);

  const filteredInvoices = invoices.filter(
    inv => inv.company_id === selectedCompany.id || inv.company_id === 'default'
  );

  const flaggedCount = filteredInvoices.filter(i => Object.values(i.flags).some(f => f)).length;

  const handleUploadComplete = (newInv: InvoiceData) => {
    setInvoices(prev => [newInv, ...prev]);
    setSessionCount(prev => prev + 1);
  };

  const handleSaveReview = (updatedData: Partial<InvoiceData>) => {
    if (!reviewingInvoice) return;
    setInvoices(prev => prev.map(inv => 
      inv.invoice_id === reviewingInvoice.invoice_id ? { ...inv, ...updatedData } : inv
    ));
    setReviewingInvoice(null);
  };

  return (
    <div className="flex min-h-screen bg-[#f8fafc] text-gray-800 antialiased overflow-hidden selection:bg-[#a3e635] selection:text-[#0d2a1d]">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <TopBar 
          selectedCompany={selectedCompany}
          selectedFY={selectedFY}
          onSwitchWorkspace={() => alert("Workspace switching is locked. Resolve current session first.")}
        />

        <div className="flex-1 overflow-y-auto">
          {activeTab === 'ingest' && (
            <UploadView 
              onComplete={handleUploadComplete} 
              sessionCount={sessionCount} 
            />
          )}
          {activeTab === 'review' && (
            <InvoiceInbox 
              invoices={filteredInvoices} 
              onReview={setReviewingInvoice} 
            />
          )}
          {activeTab === 'export' && (
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
                      onClick={() => setActiveTab('review')}
                      className="inline-block bg-[#0d2a1d] text-white px-6 py-3 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-black"
                    >
                      Resolve Flagged Items
                    </button>
                 </div>
               ) : (
                 <div className="grid grid-cols-1 gap-4">
                   <button className="bg-[#a3e635] text-[#0d2a1d] p-10 rounded-2xl border-2 border-transparent hover:scale-[1.02] transition-all flex flex-col items-center gap-4">
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

      <style>{`
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
};

export default App;
