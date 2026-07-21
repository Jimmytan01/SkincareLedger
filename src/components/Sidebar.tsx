'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutDashboard, BookOpen, Package, Undo2, ClipboardCheck, AlertTriangle, MonitorPlay, Keyboard, LogOut } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const links = [
    { href: '/', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
    { href: '/ledger', label: 'Buku Besar (Ledger)', icon: <BookOpen size={20} /> },
    { href: '/products', label: 'Master Produk', icon: <Package size={20} /> },
    { href: '/returns', label: 'Inbox Retur', icon: <Undo2 size={20} /> },
    { href: '/opname', label: 'Stok Opname', icon: <ClipboardCheck size={20} /> },
    { href: '/anomalies', label: 'Worklist Anomali', icon: <AlertTriangle size={20} /> },
    { href: '/manual-entry', label: 'Input Manual', icon: <Keyboard size={20} /> },
    { href: '/simulation', label: 'Simulasi Sistem', icon: <MonitorPlay size={20} /> },
  ]

  return (
    <aside className="w-64 bg-white border-r border-slate-200 h-screen flex flex-col fixed top-0 left-0">
      <div className="h-16 flex items-center px-6 border-b border-slate-100">
        <h1 className="font-bold text-lg text-jade-700 tracking-tight">Skincare Ledger</h1>
      </div>
      
      <nav className="flex-1 overflow-y-auto py-4 px-3 flex flex-col gap-1">
        {links.map((link) => {
          const isActive = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href))
          return (
            <Link 
              key={link.href} 
              href={link.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                isActive 
                  ? 'bg-jade-50 text-jade-600 font-semibold' 
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <span className={`${isActive ? 'text-jade-500' : 'text-slate-400'}`}>
                {link.icon}
              </span>
              <span className="text-sm tracking-wide">{link.label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="p-4 border-t border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-3 px-3 py-2 text-sm text-slate-500">
          <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-bold">
            AD
          </div>
          <div>
            <p className="font-medium text-slate-700 leading-none">Admin</p>
            <p className="text-xs mt-1">Gudang Utama</p>
          </div>
        </div>
        <button 
          onClick={handleLogout}
          className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
          title="Logout"
        >
          <LogOut size={18} />
        </button>
      </div>
    </aside>
  )
}
