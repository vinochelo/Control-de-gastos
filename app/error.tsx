'use client'

import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 p-4">
      <h2 className="text-2xl font-bold text-slate-900 mb-4">¡Algo salió mal!</h2>
      <p className="text-slate-500 mb-8 max-w-md text-center">
        Ocurrió un error inesperado. Por favor, intenta de nuevo.
      </p>
      <button
        onClick={() => reset()}
        className="bg-indigo-600 hover:bg-indigo-700 text-white py-2 px-4 rounded-lg font-medium transition-colors"
      >
        Intentar de nuevo
      </button>
    </div>
  )
}
