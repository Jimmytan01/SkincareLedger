import React from 'react'

export function getChannelBadgeStyle(channel: string | null | undefined) {
  const normalized = (channel || '').toUpperCase()
  switch (normalized) {
    case 'SHOPEE':
      return 'bg-orange-50 text-orange-800 border-orange-200/90 font-semibold'
    case 'TIKTOK':
      return 'bg-fuchsia-50 text-fuchsia-800 border-fuchsia-200/90 font-semibold'
    case 'INTERNAL':
      return 'bg-slate-100 text-slate-700 border-slate-200 font-mono'
    case 'OFFLINE':
      return 'bg-indigo-50 text-indigo-700 border-indigo-200/90 font-semibold'
    default:
      return 'bg-slate-100 text-slate-600 border-slate-200 font-mono'
  }
}

export default function ChannelBadge({ channel, className = '' }: { channel: string | null | undefined; className?: string }) {
  if (!channel) return null
  const style = getChannelBadgeStyle(channel)
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono border ${style} ${className}`}>
      {channel}
    </span>
  )
}
