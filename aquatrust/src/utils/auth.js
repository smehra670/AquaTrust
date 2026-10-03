/**
 * Lightweight local auth for the hackathon demo.
 * Credentials stay in the browser (localStorage) — not a production auth system.
 */

const USERS_KEY = 'aquatrust_users_v1'
const SESSION_KEY = 'aquatrust_session_v1'

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
}

/** Tiny non-cryptographic hash — enough to avoid storing plain passwords in demo. */
export function hashPassword(password) {
  const text = String(password || '')
  let h = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return `h${(h >>> 0).toString(16)}`
}

export function getUsers() {
  return readJson(USERS_KEY, [])
}

export function getSession() {
  return readJson(SESSION_KEY, null)
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY)
}

export function signUp({ name, email, password }) {
  const cleanName = String(name || '').trim()
  const cleanEmail = String(email || '').trim().toLowerCase()
  const cleanPassword = String(password || '')

  if (cleanName.length < 2) {
    return { ok: false, error: 'Please enter your name.' }
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return { ok: false, error: 'Enter a valid email address.' }
  }
  if (cleanPassword.length < 6) {
    return { ok: false, error: 'Password must be at least 6 characters.' }
  }

  const users = getUsers()
  if (users.some((u) => u.email === cleanEmail)) {
    return { ok: false, error: 'An account with this email already exists.' }
  }

  const user = {
    id: `u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    name: cleanName,
    email: cleanEmail,
    passwordHash: hashPassword(cleanPassword),
    createdAt: new Date().toISOString(),
  }
  writeJson(USERS_KEY, [...users, user])

  const session = {
    userId: user.id,
    name: user.name,
    email: user.email,
  }
  writeJson(SESSION_KEY, session)
  return { ok: true, session }
}

export function logIn({ email, password }) {
  const cleanEmail = String(email || '').trim().toLowerCase()
  const users = getUsers()
  const user = users.find((u) => u.email === cleanEmail)
  if (!user || user.passwordHash !== hashPassword(password)) {
    return { ok: false, error: 'Incorrect email or password.' }
  }
  const session = {
    userId: user.id,
    name: user.name,
    email: user.email,
  }
  writeJson(SESSION_KEY, session)
  return { ok: true, session }
}

export function logOut() {
  clearSession()
}
