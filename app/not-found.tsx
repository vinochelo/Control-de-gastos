import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50">
      <h2 className="text-2xl font-bold text-slate-900 mb-4">Página no encontrada</h2>
      <p className="text-slate-500 mb-8">No pudimos encontrar el recurso solicitado.</p>
      <Link href="/" className="bg-indigo-600 hover:bg-indigo-700 text-white py-2 px-4 rounded-lg font-medium transition-colors">
        Volver al inicio
      </Link>
    </div>
  )
}
