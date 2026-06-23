'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { LogIn, Loader2 } from 'lucide-react'

export default function LoginForm() {
  const router = useRouter()
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [emailFocus, setEmailFocus] = useState(false)
  const [passFocus, setPassFocus] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError('E-Mail oder Passwort ungültig.')
      setLoading(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">

      <div className="mb-1">
        <h1 className="page-title">Anmelden</h1>
        <p className="mt-1.5 text-sm text-text-secondary">
          Mit deinem Konto anmelden, um zum Campaign Manager zu gelangen.
        </p>
      </div>

      {/* Email */}
      <div>
        <label className="field-label">E-Mail</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onFocus={() => setEmailFocus(true)}
          onBlur={() => setEmailFocus(false)}
          required
          autoComplete="email"
          placeholder="mail@domain.com"
          className="field-input"
        />
      </div>

      {/* Password */}
      <div>
        <label className="field-label">Passwort</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onFocus={() => setPassFocus(true)}
          onBlur={() => setPassFocus(false)}
          required
          autoComplete="current-password"
          placeholder="••••••••"
          className="field-input"
        />
      </div>

      {/* Error */}
      {error && (
        <p className="text-sm text-warning">{error}</p>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={loading}
        className="btn-primary mt-2 w-full justify-center"
      >
        {loading ? (
          <>
            <Loader2 size={16} strokeWidth={1.75} className="animate-spin" />
            Anmelden…
          </>
        ) : (
          <>
            <LogIn size={16} strokeWidth={1.75} />
            Anmelden
          </>
        )}
      </button>

    </form>
  )
}
