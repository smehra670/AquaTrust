import { useEffect, useState } from 'react'
import { getPlaceImages } from '../services/placeImages'

function PlacePhotos({ placeName, lat, lng }) {
  const [images, setImages] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setImages([])
      try {
        const result = await getPlaceImages(placeName, lat, lng)
        if (!cancelled) setImages(result)
      } catch (error) {
        console.warn('[PlacePhotos]', error)
        if (!cancelled) setImages([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [placeName, lat, lng])

  return (
    <section className="panel-section">
      <h3>Photos</h3>

      {loading ? (
        <p className="panel-status">Finding photos of this location...</p>
      ) : null}

      {!loading && images.length === 0 ? (
        <p className="panel-status">No public photos found for this location.</p>
      ) : null}

      {!loading && images.length > 0 ? (
        <>
          <div className="photo-grid">
            {images.map((image) => (
              <a
                key={image.sourceUrl || image.thumbnailUrl}
                className="photo-card"
                href={image.sourceUrl}
                target="_blank"
                rel="noreferrer"
              >
                <img
                  src={image.thumbnailUrl}
                  alt={image.title || placeName || 'Place photo'}
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
                <div className="photo-caption">
                  <p className="photo-title">{image.title}</p>
                  {image.author ? (
                    <p className="photo-meta">Photo: {image.author}</p>
                  ) : null}
                  {image.license ? (
                    <p className="photo-meta">Licence: {image.license}</p>
                  ) : null}
                  <p className="photo-meta">
                    Source:{' '}
                    {image.matchType === 'wikipedia'
                      ? 'Wikipedia / Wikimedia'
                      : 'Wikimedia Commons'}
                  </p>
                  <span className="photo-source-link">View source</span>
                </div>
              </a>
            ))}
          </div>
          <p className="photo-footer">Source: Wikimedia Commons</p>
        </>
      ) : null}
    </section>
  )
}

export default PlacePhotos
