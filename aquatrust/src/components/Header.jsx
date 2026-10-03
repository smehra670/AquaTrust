const NAV_ITEMS = [
  { id: 'home', label: 'Home' },
  { id: 'map', label: 'Map' },
  { id: 'graphs', label: 'Graphs' },
  { id: 'my-readings', label: 'My readings' },
  { id: 'about', label: 'How it works' },
]

function Header({
  activeView = 'home',
  onNavigate,
  onAddReading,
  user = null,
  onSignIn,
  onSignOut,
}) {
  return (
    <header className="topbar">
      <button
        type="button"
        className="brand brand-button"
        onClick={() => onNavigate?.('home')}
        aria-label="AquaTrust home"
      >
        <svg
          className="brand-mark"
          viewBox="0 0 32 32"
          aria-hidden="true"
          focusable="false"
        >
          <path
            fill="currentColor"
            d="M16 2.8c.5 0 .9.3 1.1.7C20.6 9 26.5 16.8 26.5 21.6c0 5.3-4.7 9.6-10.5 9.6S5.5 26.9 5.5 21.6C5.5 16.8 11.4 9 14.9 3.5c.2-.4.6-.7 1.1-.7z"
          />
          <path
            fill="#fff"
            opacity="0.28"
            d="M12.2 20.8c0-3.2 1.8-6.4 3.8-9.4 2 3 3.8 6.2 3.8 9.4a3.8 3.8 0 1 1-7.6 0z"
          />
        </svg>

        <div className="brand-copy">
          <h1>AquaTrust</h1>
          <p>Validated data in, trustworthy stories out.</p>
        </div>
      </button>

      <nav className="site-nav" aria-label="Main navigation">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={activeView === item.id ? 'is-active' : ''}
            onClick={() => onNavigate?.(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className="topbar-actions">
        {user ? (
          <div className="topbar-user">
            <span className="topbar-user-name">{user.name}</span>
            <button
              type="button"
              className="nav-auth-button"
              onClick={onSignOut}
            >
              Sign out
            </button>
          </div>
        ) : (
          <button type="button" className="nav-auth-button" onClick={onSignIn}>
            Sign in
          </button>
        )}
        <button
          type="button"
          className="nav-reading-button"
          onClick={onAddReading}
        >
          File a reading
        </button>
      </div>
    </header>
  )
}

export default Header
