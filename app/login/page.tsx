import LoginForm from './LoginForm'

export default function LoginPage() {
  return (
    <main
      style={{ backgroundColor: '#0A0A0A', minHeight: '100vh' }}
      className="flex items-center justify-center px-4"
    >
      <div style={{ width: '100%', maxWidth: '380px' }}>

        {/* Logo + Brand */}
        <div className="text-center mb-10">
          <div
            style={{
              width: '48px',
              height: '48px',
              border: '1px solid #2A2A2A',
              borderRadius: '2px',
              display: 'inline-block',
              marginBottom: '20px',
            }}
          />
          <p style={{
            color: '#999999',
            fontSize: '10px',
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
          }}>
            Collezioni Design Syndicate
          </p>
        </div>

        <LoginForm />
      </div>
    </main>
  )
}
