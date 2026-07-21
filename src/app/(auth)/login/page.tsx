import { login } from './actions'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const resolvedSearchParams = await searchParams;
  return (
    <div className="flex h-screen items-center justify-center bg-sage-50 font-sans">
      <form className="flex flex-col gap-5 w-[380px] p-8 bg-white rounded-xl shadow-sm border border-slate-100">
        <div className="text-center mb-2">
          <h1 className="font-bold text-2xl text-jade-700 tracking-tight mb-1">Skincare Ledger</h1>
          <p className="text-sm text-slate-500 font-medium">Admin Login</p>
        </div>
        
        {resolvedSearchParams.error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm font-medium border border-red-100">
            Email atau password tidak valid.
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-sm font-semibold text-slate-700">Email</label>
          <input 
            id="email" 
            name="email" 
            type="email" 
            required 
            className="p-2.5 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-jade-500/20 focus:border-jade-500 transition-all bg-slate-50 focus:bg-white"
            placeholder="admin@skincare.com"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-sm font-semibold text-slate-700">Password</label>
          <input 
            id="password" 
            name="password" 
            type="password" 
            required 
            className="p-2.5 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-jade-500/20 focus:border-jade-500 transition-all bg-slate-50 focus:bg-white"
            placeholder="••••••••"
          />
        </div>

        <button 
          formAction={login} 
          type="submit"
          className="mt-2 p-3 bg-jade-600 hover:bg-jade-700 text-white rounded-lg font-bold transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-jade-500/50"
        >
          Masuk ke Sistem
        </button>
      </form>
    </div>
  )
}
