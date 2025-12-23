
import React from 'react';
import { Company, FiscalYear } from '../types';

interface TopBarProps {
  selectedCompany: Company;
  selectedFY: FiscalYear;
  onSwitchWorkspace: () => void;
}

const TopBar: React.FC<TopBarProps> = ({
  selectedCompany,
  selectedFY,
  onSwitchWorkspace
}) => {
  return (
    <div className="h-12 bg-[#0d2a1d] border-b border-white/10 flex items-center justify-between px-4 sticky top-0 z-30 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 bg-black/20 px-3 py-1 rounded border border-white/5">
          <i className="fa-solid fa-lock text-[#a3e635] text-[10px]"></i>
          <span className="text-[11px] font-black text-white uppercase tracking-wider">{selectedCompany.name}</span>
          <span className="text-white/20 mx-1">|</span>
          <span className="text-[11px] font-bold text-white/60">{selectedFY.label}</span>
        </div>
        <button 
          onClick={onSwitchWorkspace}
          className="text-[9px] font-black text-[#a3e635] uppercase bg-white/5 px-2 py-1 rounded hover:bg-white/10 transition-colors border border-white/10"
        >
          Change Workspace
        </button>
      </div>

      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2 pr-4 border-r border-white/10">
           <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">Operator</span>
           <span className="text-[11px] font-bold text-white/80">M. RAY</span>
        </div>
        <div className="w-6 h-6 rounded bg-[#a3e635] flex items-center justify-center text-[10px] font-black text-[#0d2a1d]">
          MR
        </div>
      </div>
    </div>
  );
};

export default TopBar;
