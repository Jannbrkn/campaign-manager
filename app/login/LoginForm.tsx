'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const inputStyle: React.CSSProperties = {
  width: '100%',
  backgroundColor: '#1A1A1A',
  border: '1px solid #2A2A2A',
  color: '#FFFFFF',
  padding: '12px 16px',
  fontSize: '14px',
  borderRadius: '2px',
  outline: 'none',
  transition: 'border-color 0.15s',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  color: '#999999',
  fontSize: '10px',
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  marginBottom: '8px',
}

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
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* Email */}
      <div>
        <label style={labelStyle}>E-Mail</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onFocus={() => setEmailFocus(true)}
          onBlur={() => setEmailFocus(false)}
          required
          autoComplete="email"
          placeholder="mail@domain.com"
          style={{
            ...inputStyle,
            borderColor: emailFocus ? '#EDE8E3' : '#2A2A2A',
          }}
        />
      </div>

      {/* Password */}
      <div>
        <label style={labelStyle}>Passwort</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onFocus={() => setPassFocus(true)}
          onBlur={() => setPassFocus(false)}
          required
          autoComplete="current-password"
          placeholder="••••••••"
          style={{
            ...inputStyle,
            borderColor: passFocus ? '#EDE8E3' : '#2A2A2A',
          }}
        />
      </div>

      {/* Error */}
      {error && (
        <p style={{ color: '#E65100', fontSize: '13px', margin: 0 }}>{error}</p>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={loading}
        style={{
          width: '100%',
          backgroundColor: loading ? '#C8C3BE' : '#EDE8E3',
          color: '#0A0A0A',
          fontSize: '12px',
          fontWeight: '500',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          padding: '14px',
          borderRadius: '2px',
          border: 'none',
          cursor: loading ? 'not-allowed' : 'pointer',
          transition: 'background-color 0.15s',
          marginTop: '8px',
        }}
        onMouseEnter={(e) => { if (!loading) (e.target as HTMLButtonElement).style.backgroundColor = '#FFFFFF' }}
        onMouseLeave={(e) => { if (!loading) (e.target as HTMLButtonElement).style.backgroundColor = '#EDE8E3' }}
      >
        {loading ? 'Anmelden…' : 'Anmelden'}
      </button>

    </form>
  )
}
