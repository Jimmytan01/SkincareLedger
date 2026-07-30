'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, BookOpen, Package, PackageOpen, Undo2, ClipboardCheck, AlertTriangle, MonitorPlay, Keyboard, LogOut, Menu, X } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'

export default function Sidebar() {
  const pathname = usePathname()
  const [isOpen, setIsOpen] = useState(false)

  // Auto-close drawer when route changes
  useEffect(() => {
    setIsOpen(false)
  }, [pathname])

  // Close drawer on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const links = [
    { href: '/', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
    { href: '/ledger', label: 'Buku Besar (Ledger)', icon: <BookOpen size={20} /> },
    { href: '/products', label: 'Master Produk', icon: <Package size={20} /> },
    { href: '/bundles', label: 'Resep Bundle', icon: <PackageOpen size={20} /> },
    { href: '/returns', label: 'Inbox Retur', icon: <Undo2 size={20} /> },
    { href: '/opname', label: 'Stok Opname', icon: <ClipboardCheck size={20} /> },
    { href: '/anomalies', label: 'Worklist Anomali', icon: <AlertTriangle size={20} /> },
    { href: '/manual-entry', label: 'Input Manual', icon: <Keyboard size={20} /> },
    { href: '/simulation', label: 'Simulasi Sistem', icon: <MonitorPlay size={20} /> },
  ]

  return (
    <>
      {/* Mobile / Tablet Header Bar (Visible on < 1024px) */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-white border-b border-slate-200 px-4 flex items-center justify-between z-30 shadow-xs">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsOpen(true)}
            className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
            aria-label="Buka Menu Sidebar"
          >
            <Menu size={22} />
          </button>
          <h1 className="font-bold text-base text-jade-700 tracking-tight">Skincare Ledger</h1>
        </div>

        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 text-xs font-bold">
            AD
          </div>
        </div>
      </header>

      {/* Backdrop (Visible on mobile when drawer is open) */}
      {isOpen && (
        <div 
          onClick={() => setIsOpen(false)}
          className="lg:hidden fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-40 transition-opacity duration-300 animate-in fade-in"
          aria-hidden="true"
        />
      )}

      {/* Sidebar / Drawer Navigation */}
      <aside 
        className={`w-64 bg-white border-r border-slate-200 h-screen flex flex-col fixed top-0 left-0 z-50 transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Sidebar Header */}
        <div className="h-16 flex items-center justify-between px-6 border-b border-slate-100">
          <h1 className="font-bold text-lg text-jade-700 tracking-tight">Skincare Ledger</h1>
          {/* Close button inside drawer for mobile */}
          <button 
            onClick={() => setIsOpen(false)}
            className="lg:hidden p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
            aria-label="Tutup Menu"
          >
            <X size={20} />
          </button>
        </div>
        
        {/* Navigation Items */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 flex flex-col gap-1">
          {links.map((link) => {
            const isActive = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href))
            return (
              <Link 
                key={link.href} 
                href={link.href}
                onClick={() => setIsOpen(false)}
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

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3 px-2 py-1 text-sm text-slate-500 overflow-hidden">
            <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-bold shrink-0">
              AD
            </div>
            <div className="truncate">
              <p className="font-medium text-slate-700 leading-none truncate">Admin</p>
              <p className="text-xs text-slate-400 mt-1 truncate">Gudang Utama</p>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors shrink-0"
            title="Logout"
          >
            <LogOut size={18} />
          </button>
        </div>
      </aside>
    </>
  )
}
