import React, { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import { Navigation, Compass } from 'lucide-react'

export interface GeoPet {
  id: string
  pet_name: string
  pet_type: string
  breed?: string
  status: 'Lost' | 'Found' | 'Reunited' | 'Closed'
  location: string
  latitude: number
  longitude: number
  image?: string
  distance_km?: number | null
}

interface MapViewProps {
  pets: GeoPet[]
  center?: [number, number] | null
  selectedRadius?: number | null
  onRadiusChange?: (radius: number | null) => void
  onPetSelect?: (pet: GeoPet) => void
}

export const MapView: React.FC<MapViewProps> = ({
  pets,
  center = null,
  selectedRadius = null,
  onRadiusChange,
  onPetSelect,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)
  const circleRef = useRef<L.Circle | null>(null)
  const markersRef = useRef<L.LayerGroup | null>(null)
  const [activeCenter, setActiveCenter] = useState<[number, number]>(center || [18, 0])
  const [hasUserCenter, setHasUserCenter] = useState(Boolean(center))
  const [locationError, setLocationError] = useState('')

  // Initialize Leaflet map
  useEffect(() => {
    if (!mapContainerRef.current) return

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: activeCenter,
        zoom: hasUserCenter ? 12 : 2,
        zoomControl: true,
      })

      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://openstreetmap.org">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map)

      markersRef.current = L.layerGroup().addTo(map)
      mapInstanceRef.current = map
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
  }, [])

  // Update markers and circle when pets or radius change
  useEffect(() => {
    const map = mapInstanceRef.current
    const markers = markersRef.current
    if (!map || !markers) return

    markers.clearLayers()

    // Draw radius circle if selected
    if (circleRef.current) {
      circleRef.current.remove()
      circleRef.current = null
    }

    if (hasUserCenter && selectedRadius && selectedRadius > 0) {
      circleRef.current = L.circle(activeCenter, {
        radius: selectedRadius * 1000,
        color: '#10b981',
        fillColor: '#10b981',
        fillOpacity: 0.12,
        weight: 2,
        dashArray: '6, 6',
      }).addTo(map)

      map.fitBounds(circleRef.current.getBounds(), { padding: [20, 20] })
    }

    // Add marker for center location
    if (hasUserCenter) {
    const centerIcon = L.divIcon({
      className: 'custom-center-pin',
      html: `
        <div style="background-color: #0f172a; width: 28px; height: 28px; border-radius: 50%; border: 3px solid white; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 10px rgba(0,0,0,0.3);">
          <div style="width: 8px; height: 8px; border-radius: 50%; background-color: #38bdf8;"></div>
        </div>
      `,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    })
    L.marker(activeCenter, { icon: centerIcon })
      .bindTooltip('Search Radius Center', { permanent: false, direction: 'top' })
      .addTo(markers)
    }

    // Add pet markers
    pets.forEach((pet) => {
      if (!Number.isFinite(pet.latitude) || !Number.isFinite(pet.longitude)) return

      const isLost = pet.status === 'Lost'
      const pinColor = isLost ? '#e11d48' : '#059669'
      const pinText = isLost ? 'LOST' : 'FOUND'

      const customIcon = L.divIcon({
        className: 'custom-pet-pin',
        html: `
          <div style="cursor: pointer; display: flex; flex-direction: column; align-items: center; transition: transform 0.2s;">
            <div style="background-color: ${pinColor}; color: white; font-weight: 800; font-size: 10px; padding: 2px 7px; border-radius: 9999px; box-shadow: 0 2px 6px rgba(0,0,0,0.25); border: 2px solid white; text-transform: uppercase;">
              ${pinText}
            </div>
            <div style="width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 6px solid ${pinColor};"></div>
          </div>
        `,
        iconSize: [80, 36],
        iconAnchor: [40, 36],
      })

      const popupContent = document.createElement('div')
      const title = document.createElement('strong')
      title.textContent = pet.pet_name || 'Pet report'
      const details = document.createElement('p')
      details.textContent = `${pet.status} · ${pet.breed || pet.pet_type} · ${pet.location}`
      const reportLink = document.createElement('a')
      reportLink.href = `/pets/${encodeURIComponent(pet.id)}`
      reportLink.textContent = 'View report'
      reportLink.className = 'leaflet-popup-link'
      popupContent.append(title, details, reportLink)
      if (pet.distance_km != null) {
        const distance = document.createElement('p')
        distance.textContent = `Approximately ${pet.distance_km} km away`
        popupContent.append(distance)
      }

      const marker = L.marker([pet.latitude, pet.longitude], { icon: customIcon })
        .bindPopup(popupContent, { maxWidth: 260 })
        .addTo(markers)

      marker.on('click', () => {
        if (onPetSelect) onPetSelect(pet)
      })
    })
  }, [pets, selectedRadius, activeCenter])

  const handleUseMyLocation = () => {
    setLocationError('')
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const newCenter: [number, number] = [pos.coords.latitude, pos.coords.longitude]
          setActiveCenter(newCenter)
          setHasUserCenter(true)
          if (mapInstanceRef.current) {
            mapInstanceRef.current.setView(newCenter, 13)
          }
        },
        () => {
          setLocationError('Location access was not granted; no nearby radius is applied.')
        },
      )
    } else {
      setLocationError('This browser does not support location access.')
    }
  }

  return (
    <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/90 px-5 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <Compass className="h-5 w-5 text-emerald-700" />
          <span className="text-sm font-bold text-slate-800">Smart Geo-Location Radius</span>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto">
          {[
            { label: 'All', val: null },
            { label: '1 km', val: 1 },
            { label: '5 km', val: 5 },
            { label: '10 km', val: 10 },
            { label: '25 km', val: 25 },
          ].map((r) => (
            <button
              key={r.label}
              onClick={() => onRadiusChange && onRadiusChange(r.val)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                selectedRadius === r.val
                  ? 'bg-emerald-700 text-white shadow-sm'
                  : 'bg-white text-slate-600 hover:bg-emerald-50 hover:text-emerald-800 border border-slate-200'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        <button
          onClick={handleUseMyLocation}
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-emerald-300 hover:text-emerald-800"
        >
          <Navigation className="h-3.5 w-3.5 text-emerald-600" />
          Center on Me
        </button>
      </div>

      {locationError && <p role="alert" className="border-b border-amber-200 bg-amber-50 px-5 py-2 text-xs text-amber-900">{locationError}</p>}
      <div ref={mapContainerRef} className="h-[480px] w-full z-0" />

      <div className="flex items-center justify-between border-t border-slate-100 bg-white px-5 py-2.5 text-xs text-slate-500">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 font-medium text-slate-700">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-600"></span> Lost Pet Pins
          </span>
          <span className="flex items-center gap-1.5 font-medium text-slate-700">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-600"></span> Found Pet Pins
          </span>
          {hasUserCenter && <span className="flex items-center gap-1.5 font-medium text-slate-700"><span className="h-2.5 w-2.5 rounded-full bg-sky-500"></span> Radius Center</span>}
        </div>
        <span className="text-[11px] text-slate-400">Displaying {pets.length} active location reports</span>
      </div>
    </div>
  )
}
