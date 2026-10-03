import { useEffect, useState } from 'react'
import { getPlaceImages } from '../services/placeImages'

/**
 * Single hero image for the waterbody story panel.
 * Full gallery remains available via PlacePhotos elsewhere if needed.
 */
function PlaceHeroImage({ placeName, lat, lng }) {
  const [image, setImage] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setImage(null)
      try {
        const result = await getPlaceImages(placeName, lat, lng)
        if (!cancelled) setImage(result[0] || null)
      } catch {
        if (!cancelled) setImage(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [placeName, lat, lng])

  if (loading) {
    return (
      <div className="hero-photo hero-photo--loading">
        Finding photos of this location...
      </div>
    )
  }

  if (!image) {
    return (
      <div className="hero-photo hero-photo--empty">
        No public photos found for this location.
      </div>
    )
  }

  return (
    <a
      className="hero-photo"
      href={image.sourceUrl}
      target="_blank"
      rel="noreferrer"
    >
      <img
        src={image.thumbnailUrl}
        alt={image.title || placeName || 'Waterbody photo'}
        loading="lazy"
      />
      {image.matchType === 'nearby' ? (
        <span className="photo-nearby-tag">Nearby public photo</span>
      ) : null}
      {image.matchType === 'wikipedia' ? (
        <span className="photo-nearby-tag photo-wiki-tag">
          Wikipedia place image
        </span>
      ) : null}
      <div className="hero-photo-credit">
        <span>
          {image.author ? `Photo: ${image.author}` : 'Source: Wikimedia Commons'}
          {image.license ? ` · ${image.license}` : ''}
        </span>
        <span>View source</span>
      </div>
    </a>
  )
}

export default PlaceHeroImage
