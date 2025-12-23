
import React from 'react';

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
    <div className="w-20 bg-[#0d2a1d] min-h-screen flex flex-col items-center py-4 border-r border-white/5 z-40">
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
            className={`flex flex-col items-center justify-center py-3 rounded-lg transition-all gap-1.5 ${
              activeTab === item.id
                ? 'bg-[#a3e635] text-[#0d2a1d] shadow-lg shadow-[#a3e635]/10'
                : 'text-white/30 hover:text-white/60 hover:bg-white/5'
            }`}
          >
            <i className={`fa-solid ${item.icon} text-sm`}></i>
            <span className="text-[8px] font-black uppercase tracking-widest">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-4 pb-2">
        <div className="h-[1px] w-8 bg-white/5 mx-auto"></div>
        <button title="Shortcuts" className="text-white/20 hover:text-white/60">
          <i className="fa-solid fa-keyboard text-xs"></i>
        </button>
        <button title="Settings" className="text-white/20 hover:text-white/60">
          <i className="fa-solid fa-gear text-xs"></i>
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
