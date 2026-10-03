/**
 * Persist citizen readings owned by logged-in users (localStorage).
 */

const READINGS_KEY = 'aquatrust_user_readings_v1'

function readAll() {
  try {
    const raw = localStorage.getItem(READINGS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeAll(rows) {
  localStorage.setItem(READINGS_KEY, JSON.stringify(rows))
}

export function loadAllUserReadings() {
  return readAll()
}

export function loadUserReadings(userId) {
  if (!userId) return []
  return readAll().filter((row) => row.ownerId === userId)
}

export function saveUserReading(reading) {
  const all = readAll()
  const next = [...all.filter((row) => row.id !== reading.id), reading]
  writeAll(next)
  return reading
}

export function deleteUserReading(readingId, userId) {
  const all = readAll()
  const next = all.filter(
    (row) => !(row.id === readingId && row.ownerId === userId)
  )
  writeAll(next)
  return next.filter((row) => row.ownerId === userId)
}

export function replaceUserReadings(userId, readings) {
  const others = readAll().filter((row) => row.ownerId !== userId)
  writeAll([...others, ...readings])
}
