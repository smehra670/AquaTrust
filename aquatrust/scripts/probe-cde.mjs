const q = process.argv[2] || 'River Thames'
const url = `https://environment.data.gov.uk/catchment-planning/search?q=${encodeURIComponent(q)}`
const res = await fetch(url, { headers: { Accept: 'application/json' } })
const text = (await res.text()).replace(/^\uFEFF/, '')
const data = JSON.parse(text)
for (const block of data) {
  console.log('block', block.type, 'n', (block.results || []).length)
  for (const r of (block.results || []).slice(0, 5)) {
    const pick = {}
    for (const k of Object.keys(r)) {
      if (k === 'catchment' || k === 'geometry') {
        pick[k] = typeof r[k] === 'object' ? '[geo]' : r[k]
      } else {
        pick[k] = r[k]
      }
    }
    console.log(JSON.stringify(pick).slice(0, 800))
  }
}
