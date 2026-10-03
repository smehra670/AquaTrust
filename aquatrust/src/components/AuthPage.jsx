import { useState } from 'react'
import heroImage from '../../1mAup9.webp'
import { logIn, signUp } from '../utils/auth'

/**
 * Minimal sign-in / sign-up — same visual language as the homepage hero.
 */
function AuthPage({ onAuthenticated, onCancel }) {
  const [mode, setMode] = useState('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  function handleSubmit(event) {
    event.preventDefault()
    setError('')
    const result =
      mode === 'signup'
        ? signUp({ name, email, password })
        : logIn({ email, password })
    if (!result.ok) {
      setError(result.error || 'Authentication failed.')
      return
    }
    onAuthenticated?.(result.session)
  }

  return (
    <main className="auth-page">
      <div
        className="home-backdrop"
        style={{ '--hero-image': `url("${heroImage}")` }}
        aria-hidden="true"
      />
      <div className="home-hero-mist" aria-hidden="true" />

      <section className="auth-shell" aria-labelledby="auth-title">
        <p className="auth-kicker">AquaTrust</p>
        <h1 id="auth-title">
          {mode === 'login' ? 'Welcome back' : 'Join AquaTrust'}
        </h1>
        <p className="auth-lead">
          {mode === 'login'
            ? 'Sign in to file readings and manage your findings.'
            : 'Create an account to contribute verified river readings.'}
        </p>

        <div className="auth-tabs" role="tablist" aria-label="Auth mode">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'login'}
            className={mode === 'login' ? 'is-active' : ''}
            onClick={() => {
              setMode('login')
              setError('')
            }}
          >
            Sign in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'signup'}
            className={mode === 'signup' ? 'is-active' : ''}
            onClick={() => {
              setMode('signup')
              setError('')
            }}
          >
            Sign up
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === 'signup' ? (
            <label>
              Name
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                required
              />
            </label>
          ) : null}

          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </label>

          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={
                mode === 'signup' ? 'new-password' : 'current-password'
              }
              minLength={6}
              required
            />
          </label>

          {error ? (
            <p className="auth-error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="auth-actions">
            <button
              type="submit"
              className="home-button home-button--dark auth-submit"
            >
              {mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
            {onCancel ? (
              <button
                type="button"
                className="home-button home-button--ghost"
                onClick={onCancel}
              >
                Back
              </button>
            ) : null}
          </div>
        </form>
      </section>
    </main>
  )
}

export default AuthPage
