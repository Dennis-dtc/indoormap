import { useEffect, useMemo, useRef, useState } from "react"
import "leaflet/dist/leaflet.css"
import L from "leaflet"
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet"
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png"
import markerIcon from "leaflet/dist/images/marker-icon.png"
import markerShadow from "leaflet/dist/images/marker-shadow.png"
import {
  Building2,
  ChevronDown,
  Crosshair,
  Edit3,
  ImagePlus,
  Layers,
  MapPin,
  Menu,
  Navigation,
  PlayCircle,
  Plus,
  RefreshCcw,
  StopCircle,
  Target,
  Trash2,
  X,
} from "lucide-react"

import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ScrollArea } from "@/components/ui/scroll-area"

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
})

const categories = [
  {
    key: "Amenities",
    color: "from-cyan-400 to-blue-500",
    dot: "bg-cyan-300",
    types: ["Toilet", "Kitchen", "Water Point", "Reception"],
  },
  {
    key: "Rooms",
    color: "from-violet-400 to-fuchsia-500",
    dot: "bg-violet-300",
    types: ["Room", "Office", "Lab", "Class"],
  },
  {
    key: "Shops",
    color: "from-amber-300 to-orange-500",
    dot: "bg-amber-300",
    types: ["Shop", "Kiosk", "Store"],
  },
  {
    key: "Exits",
    color: "from-emerald-300 to-teal-500",
    dot: "bg-emerald-300",
    types: ["Main Exit", "Emergency Exit", "Gate"],
  },
]

const defaultCenter = [-1.2921, 36.8219]
const indoorUser = { indoor_x: 500, indoor_y: 500 }

function haversineMeters(a, b) {
  if (!a || !b) return null

  const R = 6371000
  const toRad = (value) => (value * Math.PI) / 180

  const dLat = toRad(b.latitude - a.latitude)
  const dLng = toRad(b.longitude - a.longitude)
  const lat1 = toRad(a.latitude)
  const lat2 = toRad(b.latitude)

  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2)

  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
}

function bearingDegrees(a, b) {
  if (!a || !b) return 0

  const toRad = (value) => (value * Math.PI) / 180
  const toDeg = (value) => (value * 180) / Math.PI

  const lat1 = toRad(a.latitude)
  const lat2 = toRad(b.latitude)
  const dLng = toRad(b.longitude - a.longitude)

  const y = Math.sin(dLng) * Math.cos(lat2)
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng)

  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

function indoorDistance(a, b) {
  if (!a || !b) return null
  const dx = b.indoor_x - a.indoor_x
  const dy = b.indoor_y - a.indoor_y
  return Math.sqrt(dx * dx + dy * dy)
}

function LiveMapClickHandler({ onPick }) {
  useMapEvents({
    click(event) {
      onPick({
        latitude: event.latlng.lat,
        longitude: event.latlng.lng,
      })
    },
  })

  return null
}

function RecenterMap({ currentPosition, shouldRecenter }) {
  const map = useMap()

  useEffect(() => {
    if (currentPosition?.latitude && currentPosition?.longitude && shouldRecenter) {
      map.setView([currentPosition.latitude, currentPosition.longitude], 19)
    }
  }, [currentPosition, shouldRecenter, map])

  return null
}

function DirectionArrow({ bearing, active, hasDestination, compact = false }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={`relative flex items-center justify-center rounded-full border shadow-2xl transition-all ${
          compact ? "h-20 w-20" : "h-24 w-24"
        } ${
          active
            ? "border-emerald-300/50 bg-emerald-400/15 shadow-emerald-950/40"
            : "border-cyan-300/30 bg-slate-950/65 shadow-cyan-950/30"
        }`}
      >
        <div className="absolute inset-3 rounded-full border border-white/10" />
        <div className="absolute top-1 text-[9px] font-semibold text-slate-400">
          N
        </div>

        <div
          className="transition-transform duration-500"
          style={{ transform: `rotate(${bearing}deg)` }}
        >
          <div
            style={{
              width: 0,
              height: 0,
              borderLeft: compact ? "11px solid transparent" : "13px solid transparent",
              borderRight: compact ? "11px solid transparent" : "13px solid transparent",
              borderBottom: `${compact ? 38 : 45}px solid ${
                active ? "#34d399" : "#22d3ee"
              }`,
              filter: active
                ? "drop-shadow(0 0 14px rgba(52, 211, 153, 0.8))"
                : "drop-shadow(0 0 14px rgba(34, 211, 238, 0.65))",
            }}
          />
        </div>
      </div>

      {!compact && (
        <div className="text-center text-xs text-slate-300">
          {!hasDestination
            ? "Choose a destination"
            : active
              ? "Tracking active"
              : "Ready to start"}
        </div>
      )}
    </div>
  )
}

function LiveMap({
  places,
  selectedPlace,
  currentPosition,
  onPickLocation,
  pickingCategory,
  navigationActive,
}) {
  const center = currentPosition
    ? [currentPosition.latitude, currentPosition.longitude]
    : defaultCenter

  const hasLiveDestination =
    selectedPlace?.latitude !== null &&
    selectedPlace?.latitude !== undefined &&
    selectedPlace?.longitude !== null &&
    selectedPlace?.longitude !== undefined

  const hasCurrentPosition =
    currentPosition?.latitude !== null &&
    currentPosition?.latitude !== undefined &&
    currentPosition?.longitude !== null &&
    currentPosition?.longitude !== undefined

  return (
    <div className="relative h-full min-h-0 overflow-hidden rounded-3xl border border-white/15 bg-white/10 p-2 shadow-2xl shadow-cyan-950/30">
      {pickingCategory && (
        <div className="absolute left-4 top-20 z-[500] rounded-2xl border border-cyan-300/40 bg-slate-950/80 px-4 py-3 text-sm text-cyan-100 shadow-xl backdrop-blur">
          Click the map to place a new <b>{pickingCategory}</b> location.
        </div>
      )}

      {navigationActive && hasLiveDestination && hasCurrentPosition && (
        <div className="absolute bottom-5 left-1/2 z-[500] hidden -translate-x-1/2 rounded-2xl border border-emerald-300/40 bg-emerald-500/20 px-4 py-3 text-sm font-semibold text-emerald-50 shadow-xl backdrop-blur md:block">
          Tracking active · follow the green direction arrow
        </div>
      )}

      <MapContainer center={center} zoom={18} scrollWheelZoom className="z-0">
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <LiveMapClickHandler onPick={onPickLocation} />
        <RecenterMap
          currentPosition={currentPosition}
          shouldRecenter={navigationActive}
        />

        {navigationActive && hasLiveDestination && hasCurrentPosition && (
          <Polyline
            positions={[
              [currentPosition.latitude, currentPosition.longitude],
              [selectedPlace.latitude, selectedPlace.longitude],
            ]}
            pathOptions={{
              color: "#34d399",
              weight: 5,
              opacity: 0.9,
              dashArray: "12 12",
            }}
          />
        )}

        {hasCurrentPosition && (
          <CircleMarker
            center={[currentPosition.latitude, currentPosition.longitude]}
            radius={10}
            pathOptions={{
              color: "#ffffff",
              fillColor: "#22d3ee",
              fillOpacity: 1,
              weight: 3,
            }}
          >
            <Popup>
              <b>You are here</b>
              <br />
              Accuracy: {Math.round(currentPosition.accuracy || 0)}m
            </Popup>
          </CircleMarker>
        )}

        {places
          .filter(
            (place) =>
              place.latitude !== null &&
              place.latitude !== undefined &&
              place.longitude !== null &&
              place.longitude !== undefined &&
              place.id !== selectedPlace?.id
          )
          .map((place) => (
            <CircleMarker
              key={place.id}
              center={[place.latitude, place.longitude]}
              radius={7}
              pathOptions={{
                color: "#f8fafc",
                fillColor: "#a855f7",
                fillOpacity: 0.95,
                weight: 2,
              }}
            >
              <Popup>
                <b>{place.name}</b>
                <br />
                {place.category} · {place.type || "Place"}
              </Popup>
            </CircleMarker>
          ))}

        {hasLiveDestination && (
          <Marker position={[selectedPlace.latitude, selectedPlace.longitude]}>
            <Popup>
              <b>Destination</b>
              <br />
              {selectedPlace.name}
            </Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  )
}

function IndoorPlan({
  places,
  selectedPlace,
  onPickLocation,
  pickingCategory,
  navigationActive,
  indoorMapImage,
  onUploadClick,
}) {
  const [zoom, setZoom] = useState(1)

  function handleClick(event) {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = (event.clientX - rect.left) / zoom
    const y = (event.clientY - rect.top) / zoom

    onPickLocation({
      indoor_x: Number(x.toFixed(2)),
      indoor_y: Number(y.toFixed(2)),
    })
  }

  const hasIndoorDestination =
    selectedPlace?.indoor_x !== null &&
    selectedPlace?.indoor_x !== undefined &&
    selectedPlace?.indoor_y !== null &&
    selectedPlace?.indoor_y !== undefined

  return (
    <div className="relative h-full min-h-0 overflow-hidden rounded-3xl border border-white/15 bg-slate-950/55 p-2 shadow-2xl shadow-violet-950/30">
      <Button
        type="button"
        onClick={onUploadClick}
        className="absolute right-4 top-20 z-30 bg-gradient-to-r from-violet-400 to-fuchsia-500 text-white shadow-xl shadow-violet-950/40"
      >
        <ImagePlus className="mr-2 h-4 w-4" />
        <span className="hidden sm:inline">Add indoor map</span>
        <span className="sm:hidden">Map</span>
      </Button>

      <div className="absolute left-4 top-20 z-20 flex items-center gap-2 rounded-2xl border border-white/15 bg-slate-950/75 px-3 py-2 text-sm backdrop-blur">
        <Layers className="h-4 w-4 text-violet-300" />
        <span className="hidden sm:inline">Indoor</span>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setZoom((value) => Math.max(0.5, value - 0.15))}
        >
          -
        </Button>
        <span className="w-10 text-center text-xs">{zoom.toFixed(1)}x</span>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setZoom((value) => Math.min(2, value + 0.15))}
        >
          +
        </Button>
      </div>

      {pickingCategory && (
        <div className="absolute left-4 top-36 z-20 max-w-[260px] rounded-2xl border border-violet-300/40 bg-slate-950/80 px-4 py-3 text-sm text-violet-100 shadow-xl backdrop-blur">
          Click the indoor plan to place a new <b>{pickingCategory}</b>.
        </div>
      )}

      <div
        onClick={handleClick}
        className="h-full w-full cursor-crosshair overflow-hidden rounded-2xl border border-white/10 bg-[linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px)] bg-[size:40px_40px]"
      >
        <div
          className="relative h-full min-h-[520px] w-full origin-top-left transition-transform"
          style={{ transform: `scale(${zoom})` }}
        >
          {indoorMapImage && (
            <img
              src={indoorMapImage}
              alt="Indoor map"
              className="pointer-events-none absolute inset-0 h-full w-full object-contain opacity-85"
            />
          )}

          {navigationActive && hasIndoorDestination && (
            <svg className="pointer-events-none absolute inset-0 h-full w-full">
              <line
                x1={indoorUser.indoor_x}
                y1={indoorUser.indoor_y}
                x2={selectedPlace.indoor_x}
                y2={selectedPlace.indoor_y}
                stroke="rgba(52,211,153,.95)"
                strokeWidth="5"
                strokeDasharray="12 12"
              />
            </svg>
          )}

          <div
            className="absolute rounded-full border-[3px] border-white bg-cyan-300 shadow-xl shadow-cyan-950/40"
            style={{
              left: indoorUser.indoor_x,
              top: indoorUser.indoor_y,
              width: 22,
              height: 22,
              transform: "translate(-50%, -50%)",
            }}
            title="Your location"
          />

          {places
            .filter(
              (place) =>
                place.indoor_x !== null &&
                place.indoor_x !== undefined &&
                place.indoor_y !== null &&
                place.indoor_y !== undefined
            )
            .map((place) => (
              <div
                key={place.id}
                className={`absolute flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold shadow-xl ${
                  selectedPlace?.id === place.id
                    ? "bg-gradient-to-r from-emerald-300 to-teal-400 text-slate-950"
                    : "bg-white/90 text-slate-900"
                }`}
                style={{
                  left: place.indoor_x,
                  top: place.indoor_y,
                  transform: "translate(-50%, -50%)",
                }}
              >
                <MapPin className="h-4 w-4" />
                {place.name}
              </div>
            ))}
        </div>
      </div>
    </div>
  )
}

function PlaceDialog({
  open,
  onOpenChange,
  draft,
  setDraft,
  onSubmit,
  editingPlace,
}) {
  const selectedCategory = categories.find((item) => item.key === draft.category)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-white/15 bg-slate-950/95 text-white backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle>
            {editingPlace ? "Update saved place" : "Save new place"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <label className="text-sm text-slate-300">Name</label>
            <Input
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              placeholder="Example: Main Toilet"
              className="border-white/15 bg-white/10 text-white placeholder:text-slate-500"
            />
          </div>

          <div className="grid gap-2">
            <label className="text-sm text-slate-300">Category</label>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-sm font-semibold text-white">
              {draft.category}
            </div>
            <p className="text-xs text-slate-500">
              Category is locked from the sidebar add button.
            </p>
          </div>

          <div className="grid gap-2">
            <label className="text-sm text-slate-300">Type</label>
            <Select
              value={draft.type}
              onValueChange={(value) => setDraft({ ...draft, type: value })}
            >
              <SelectTrigger className="border-white/15 bg-white/10 text-white">
                <SelectValue placeholder="Choose type" />
              </SelectTrigger>
              <SelectContent
                position="popper"
                side="bottom"
                align="start"
                sideOffset={8}
                avoidCollisions={false}
                className="z-[1000] border-white/15 bg-slate-950 text-white shadow-2xl"
              >
                {(selectedCategory?.types || []).map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <label className="text-sm text-slate-300">Description</label>
            <Input
              value={draft.description}
              onChange={(event) =>
                setDraft({ ...draft, description: event.target.value })
              }
              placeholder="Example: Near the main corridor"
              className="border-white/15 bg-white/10 text-white placeholder:text-slate-500"
            />
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-slate-300">
            <div>Map mode: {draft.map_mode}</div>
            {draft.map_mode === "live" ? (
              <div>
                Lat: {draft.latitude || "not set"} · Lng:{" "}
                {draft.longitude || "not set"}
              </div>
            ) : (
              <div>
                X: {draft.indoor_x || "not set"} · Y:{" "}
                {draft.indoor_y || "not set"}
              </div>
            )}
          </div>

          <Button
            onClick={onSubmit}
            className="bg-gradient-to-r from-cyan-400 via-blue-500 to-violet-500 text-white shadow-lg shadow-cyan-950/30"
          >
            {editingPlace ? "Update place" : "Save place"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function DestinationDialog({
  open,
  onOpenChange,
  place,
  liveDistance,
  indoorDistanceValue,
  onStart,
}) {
  if (!place) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-white/15 bg-slate-950/95 text-white backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target className="h-5 w-5 text-emerald-300" />
            Start navigation?
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
            <div className="text-sm text-slate-400">Destination</div>
            <div className="text-2xl font-semibold text-white">{place.name}</div>
            <div className="mt-1 text-sm text-slate-300">
              {place.category} · {place.type || "Place"}
            </div>
            {place.description && (
              <div className="mt-3 text-sm text-slate-300">{place.description}</div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-cyan-300/20 bg-cyan-400/10 p-3">
              <div className="text-xs text-cyan-100">Live distance</div>
              <div className="text-xl font-bold text-white">
                {liveDistance !== null ? `${liveDistance.toFixed(1)} m` : "—"}
              </div>
            </div>

            <div className="rounded-2xl border border-violet-300/20 bg-violet-400/10 p-3">
              <div className="text-xs text-violet-100">Indoor units</div>
              <div className="text-xl font-bold text-white">
                {indoorDistanceValue !== null ? indoorDistanceValue.toFixed(0) : "—"}
              </div>
            </div>
          </div>

          <Button
            onClick={onStart}
            className="w-full bg-gradient-to-r from-emerald-300 via-teal-400 to-cyan-400 text-slate-950 shadow-lg shadow-emerald-950/30"
          >
            <PlayCircle className="mr-2 h-5 w-5" />
            Start tracking
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function SidebarContent({
  mode,
  groupedPlaces,
  openCategories,
  toggleCategory,
  startAdd,
  chooseDestination,
  setSelectedPlaceId,
  selectedPlaceId,
  startEdit,
  deletePlace,
  loadPlaces,
  closeMobileMenu,
}) {
  function handlePlaceClick(place) {
    if (mode === "user") {
      chooseDestination(place)
      closeMobileMenu?.()
      return
    }

    setSelectedPlaceId(place.id)
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="mb-3 flex shrink-0 items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">
            {mode === "admin" ? "Manage places" : "Destinations"}
          </h2>
          <p className="text-xs text-slate-300">
            {mode === "admin"
              ? "Add, update, or delete mapped points."
              : "Choose from saved categories."}
          </p>
        </div>

        <Button size="icon" variant="secondary" onClick={loadPlaces}>
          <RefreshCcw className="h-4 w-4" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/25">
        <ScrollArea className="h-full">
          <div className="space-y-2 p-2 pr-3">
            {categories.map((category) => {
              const categoryPlaces = groupedPlaces[category.key] || []
              const isOpen = openCategories[category.key]

              return (
                <Card
                  key={category.key}
                  onClick={() => toggleCategory(category.key)}
                  className={`cursor-pointer overflow-hidden border-white/15 text-white transition-all duration-200 active:scale-[0.99] ${
                    isOpen
                      ? "bg-slate-950/65 shadow-lg shadow-slate-950/20"
                      : "bg-slate-950/35 hover:-translate-y-0.5 hover:border-cyan-300/25 hover:bg-slate-950/55 hover:shadow-lg hover:shadow-cyan-950/20"
                  }`}
                >
                  <div className="flex w-full items-center justify-between gap-2 p-3">
                    <div className="flex flex-1 items-center gap-2 text-left">
                      <span
                        className={`h-3 w-3 rounded-full bg-gradient-to-r ${category.color}`}
                      />
                      <div>
                        <div className="text-sm font-semibold">{category.key}</div>
                        <div className="text-[11px] text-slate-400">
                          {categoryPlaces.length} saved
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      {mode === "admin" && (
                        <Button
                          size="icon"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            startAdd(category.key)
                          }}
                          className={`h-8 w-8 bg-gradient-to-r ${category.color} text-white`}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      )}

                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={(event) => {
                          event.stopPropagation()
                          toggleCategory(category.key)
                        }}
                        className="h-8 w-8 text-slate-300 hover:bg-white/10 hover:text-white"
                      >
                        <ChevronDown
                          className={`h-4 w-4 transition-transform ${
                            isOpen ? "rotate-180" : ""
                          }`}
                        />
                      </Button>
                    </div>
                  </div>

                  {isOpen && (
                    <CardContent
                      className="space-y-2 px-3 pb-3 pt-0"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {categoryPlaces.length === 0 && (
                        <p className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-slate-400">
                          No places yet.
                        </p>
                      )}

                      {categoryPlaces.map((place) => (
                        <div
                          key={place.id}
                          className={`rounded-xl border p-2.5 transition ${
                            selectedPlaceId === place.id
                              ? "border-emerald-300/40 bg-emerald-400/10"
                              : "border-white/10 bg-white/5 hover:bg-white/10"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => handlePlaceClick(place)}
                              className="flex flex-1 items-start gap-2 text-left"
                            >
                              <span
                                className={`mt-1 h-2.5 w-2.5 rounded-full ${category.dot}`}
                              />
                              <span>
                                <div className="text-sm font-semibold text-white">
                                  {place.name}
                                </div>
                                <div className="text-[11px] text-slate-400">
                                  {place.type || "Place"} · {place.map_mode}
                                </div>
                              </span>
                            </button>

                            {mode === "admin" && (
                              <div className="flex gap-1">
                                <Button
                                  size="icon"
                                  variant="secondary"
                                  className="h-8 w-8"
                                  onClick={() => startEdit(place)}
                                >
                                  <Edit3 className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="destructive"
                                  className="h-8 w-8"
                                  onClick={() => deletePlace(place)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  )}
                </Card>
              )
            })}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}

export default function App() {
  const [places, setPlaces] = useState([])
  const [mode, setMode] = useState("user")
  const [mapMode, setMapMode] = useState("live")
  const [pickingCategory, setPickingCategory] = useState(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [destinationDialogOpen, setDestinationDialogOpen] = useState(false)
  const [editingPlace, setEditingPlace] = useState(null)
  const [selectedPlaceId, setSelectedPlaceId] = useState("")
  const [pendingPlaceId, setPendingPlaceId] = useState("")
  const [navigationActive, setNavigationActive] = useState(false)
  const [currentPosition, setCurrentPosition] = useState(null)
  const [locationStatus, setLocationStatus] = useState(
    "Waiting for location permission"
  )
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const indoorFileInputRef = useRef(null)
  const [indoorMapImage, setIndoorMapImage] = useState(null)

  const [openCategories, setOpenCategories] = useState({
    Amenities: false,
    Rooms: false,
    Shops: false,
    Exits: false,
  })

  const [draft, setDraft] = useState({
    name: "",
    category: "Amenities",
    type: "",
    description: "",
    map_mode: "live",
    latitude: null,
    longitude: null,
    indoor_x: null,
    indoor_y: null,
  })

  const selectedPlace = places.find((place) => place.id === selectedPlaceId)
  const pendingPlace = places.find((place) => place.id === pendingPlaceId)

  const groupedPlaces = useMemo(() => {
    return categories.reduce((acc, category) => {
      acc[category.key] = places.filter((place) => place.category === category.key)
      return acc
    }, {})
  }, [places])

  const liveDistance = useMemo(() => {
    if (
      !currentPosition ||
      selectedPlace?.latitude === null ||
      selectedPlace?.latitude === undefined ||
      selectedPlace?.longitude === null ||
      selectedPlace?.longitude === undefined
    ) {
      return null
    }

    return haversineMeters(currentPosition, selectedPlace)
  }, [currentPosition, selectedPlace])

  const pendingLiveDistance = useMemo(() => {
    if (
      !currentPosition ||
      pendingPlace?.latitude === null ||
      pendingPlace?.latitude === undefined ||
      pendingPlace?.longitude === null ||
      pendingPlace?.longitude === undefined
    ) {
      return null
    }

    return haversineMeters(currentPosition, pendingPlace)
  }, [currentPosition, pendingPlace])

  const liveBearing = useMemo(() => {
    if (
      !currentPosition ||
      selectedPlace?.latitude === null ||
      selectedPlace?.latitude === undefined ||
      selectedPlace?.longitude === null ||
      selectedPlace?.longitude === undefined
    ) {
      return 0
    }

    return bearingDegrees(currentPosition, selectedPlace)
  }, [currentPosition, selectedPlace])

  const indoorDistanceValue = useMemo(() => {
    if (
      selectedPlace?.indoor_x === null ||
      selectedPlace?.indoor_x === undefined ||
      selectedPlace?.indoor_y === null ||
      selectedPlace?.indoor_y === undefined
    ) {
      return null
    }

    return indoorDistance(indoorUser, selectedPlace)
  }, [selectedPlace])

  const pendingIndoorDistanceValue = useMemo(() => {
    if (
      pendingPlace?.indoor_x === null ||
      pendingPlace?.indoor_x === undefined ||
      pendingPlace?.indoor_y === null ||
      pendingPlace?.indoor_y === undefined
    ) {
      return null
    }

    return indoorDistance(indoorUser, pendingPlace)
  }, [pendingPlace])

  async function loadPlaces() {
    const { data, error } = await supabase
      .from("places")
      .select("*")
      .order("created_at", { ascending: false })

    if (error) {
      console.error(error)
      return
    }

    setPlaces(data || [])
  }

  useEffect(() => {
    loadPlaces()

    const channel = supabase
      .channel("places-live-updates")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "places" },
        () => loadPlaces()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationStatus("Geolocation is not supported in this browser")
      return
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setCurrentPosition({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        })
        setLocationStatus(
          `Location active · accuracy ${Math.round(position.coords.accuracy)}m`
        )
      },
      (error) => {
        setLocationStatus(error.message)
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 15000,
      }
    )

    return () => navigator.geolocation.clearWatch(watchId)
  }, [])

  function toggleCategory(category) {
    setOpenCategories((current) => ({
      ...current,
      [category]: !current[category],
    }))
  }

  function handleIndoorMapUpload(event) {
    const file = event.target.files?.[0]
    if (!file) return

    const allowedTypes = [
      "image/png",
      "image/jpeg",
      "image/webp",
      "image/svg+xml",
    ]

    if (!allowedTypes.includes(file.type)) {
      alert("Please upload PNG, JPG, JPEG, WEBP, or SVG.")
      return
    }

    const imageUrl = URL.createObjectURL(file)
    setIndoorMapImage(imageUrl)
  }

  function startAdd(category) {
    setMode("admin")
    setPickingCategory(category)
    setEditingPlace(null)
    setDraft({
      name: "",
      category,
      type: "",
      description: "",
      map_mode: mapMode,
      latitude: null,
      longitude: null,
      indoor_x: null,
      indoor_y: null,
    })

    setOpenCategories((current) => ({
      ...current,
      [category]: true,
    }))
  }

  function handlePickLocation(coords) {
    if (!pickingCategory && !editingPlace) return

    const nextDraft = {
      ...draft,
      map_mode: mapMode,
      ...coords,
    }

    setDraft(nextDraft)
    setDialogOpen(true)
  }

  function startEdit(place) {
    setMode("admin")
    setEditingPlace(place)
    setPickingCategory(place.category)
    setDraft({
      name: place.name || "",
      category: place.category || "Amenities",
      type: place.type || "",
      description: place.description || "",
      map_mode: place.map_mode || "live",
      latitude: place.latitude,
      longitude: place.longitude,
      indoor_x: place.indoor_x,
      indoor_y: place.indoor_y,
    })
    setDialogOpen(true)
  }

  function chooseDestination(place) {
    setPendingPlaceId(place.id)
    setDestinationDialogOpen(true)
  }

  function startNavigation() {
    setSelectedPlaceId(pendingPlaceId)
    setNavigationActive(true)
    setDestinationDialogOpen(false)
  }

  function stopNavigation() {
    setNavigationActive(false)
  }

  function resetNavigation() {
    setSelectedPlaceId("")
    setPendingPlaceId("")
    setNavigationActive(false)
    setDestinationDialogOpen(false)
  }

  async function savePlace() {
    if (!draft.name.trim()) return

    const payload = {
      name: draft.name.trim(),
      category: draft.category,
      type: draft.type,
      description: draft.description,
      map_mode: draft.map_mode,
      latitude: draft.latitude,
      longitude: draft.longitude,
      indoor_x: draft.indoor_x,
      indoor_y: draft.indoor_y,
    }

    if (editingPlace) {
      const { error } = await supabase
        .from("places")
        .update(payload)
        .eq("id", editingPlace.id)

      if (error) console.error(error)
    } else {
      const { error } = await supabase.from("places").insert(payload)
      if (error) console.error(error)
    }

    setDialogOpen(false)
    setPickingCategory(null)
    setEditingPlace(null)
    await loadPlaces()
  }

  async function deletePlace(place) {
    const confirmed = window.confirm(`Delete ${place.name}?`)
    if (!confirmed) return

    const { error } = await supabase.from("places").delete().eq("id", place.id)
    if (error) {
      console.error(error)
      return
    }

    if (selectedPlaceId === place.id) {
      resetNavigation()
    }

    await loadPlaces()
  }

  return (
    <main className="h-screen overflow-hidden p-2 md:p-4">
      <div className="mx-auto flex h-full max-w-[1600px] flex-col gap-3">
        <header className="flex shrink-0 flex-col gap-3 rounded-3xl border border-white/15 bg-white/10 p-3 shadow-2xl shadow-slate-950/30 backdrop-blur-xl md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-300 via-blue-500 to-violet-500 shadow-lg shadow-cyan-950/40">
              <Navigation className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-white md:text-2xl">
                Indoor Wayfinder
              </h1>
              <p className="text-xs text-slate-300 md:text-sm">
                Live Map + Indoor Plan prototype
              </p>
            </div>
          </div>

          <div className="flex flex-nowrap items-center gap-2 min-w-0">
            <Badge
              className={`truncate ${
                navigationActive
                  ? "border-emerald-300/30 bg-emerald-400/15 text-emerald-100"
                  : "border-cyan-300/30 bg-cyan-400/15 text-cyan-100"
              }`}
            >
              {navigationActive ? "Tracking active" : locationStatus}
            </Badge>

            <Button
              variant={mode === "user" ? "default" : "secondary"}
              onClick={() => setMode("user")}
              className={`shrink-0 ${mode === "user" ? "bg-cyan-500 text-white" : ""}`}
              size="sm"
            >
              User
            </Button>

            <Button
              variant={mode === "admin" ? "default" : "secondary"}
              onClick={() => setMode("admin")}
              className={`shrink-0 ${mode === "admin" ? "bg-violet-500 text-white" : ""}`}
              size="sm"
            >
              Admin
            </Button>

            <Button
              size="icon"
              variant="secondary"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden shrink-0"
            >
              <Menu className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <section className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[300px_1fr]">
          <aside className="hidden min-h-0 overflow-hidden rounded-3xl border border-white/15 bg-white/10 p-3 shadow-2xl shadow-slate-950/25 backdrop-blur-xl lg:flex lg:flex-col">
            {mode === "user" && (
              <Card className="mb-3 shrink-0 border-white/15 bg-slate-950/45 text-white">
                <CardContent className="space-y-3 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[11px] text-slate-400">
                        Current destination
                      </div>
                      <div className="text-sm font-semibold text-white">
                        {selectedPlace?.name || "Not started"}
                      </div>
                    </div>

                    {navigationActive ? (
                      <Button size="sm" variant="destructive" onClick={stopNavigation}>
                        Stop
                      </Button>
                    ) : (
                      <Badge className="bg-cyan-400/15 text-cyan-100">Ready</Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-2xl border border-cyan-300/20 bg-cyan-400/10 p-2">
                      <div className="text-[10px] text-cyan-100">Live distance</div>
                      <div className="text-base font-bold text-white">
                        {liveDistance !== null ? `${liveDistance.toFixed(1)} m` : "—"}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-violet-300/20 bg-violet-400/10 p-2">
                      <div className="text-[10px] text-violet-100">Indoor units</div>
                      <div className="text-base font-bold text-white">
                        {indoorDistanceValue !== null
                          ? indoorDistanceValue.toFixed(0)
                          : "—"}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <DirectionArrow
                      bearing={liveBearing}
                      active={navigationActive}
                      hasDestination={Boolean(selectedPlace)}
                      compact
                    />

                    <Button size="sm" variant="secondary" onClick={resetNavigation}>
                      Reset
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="min-h-0 flex-1 overflow-hidden">
              <SidebarContent
                mode={mode}
                groupedPlaces={groupedPlaces}
                openCategories={openCategories}
                toggleCategory={toggleCategory}
                startAdd={startAdd}
                chooseDestination={chooseDestination}
                setSelectedPlaceId={setSelectedPlaceId}
                selectedPlaceId={selectedPlaceId}
                startEdit={startEdit}
                deletePlace={deletePlace}
                loadPlaces={loadPlaces}
              />
            </div>
          </aside>

          <section className="relative min-h-0 overflow-hidden rounded-3xl border border-white/15 bg-white/10 p-0 shadow-2xl shadow-slate-950/25 backdrop-blur-xl md:p-3">
            <Tabs value={mapMode} onValueChange={setMapMode} className="relative h-full">
              <div className="absolute left-1/2 top-4 z-[600] -translate-x-1/2">
                <TabsList className="border border-white/15 bg-slate-950/75 shadow-xl backdrop-blur">
                  <TabsTrigger value="live" className="gap-2">
                    <Crosshair className="h-4 w-4" />
                    <span className="hidden sm:inline">Live Map</span>
                    <span className="sm:hidden">Live</span>
                  </TabsTrigger>
                  <TabsTrigger value="indoor" className="gap-2">
                    <Building2 className="h-4 w-4" />
                    <span className="hidden sm:inline">Indoor Plan</span>
                    <span className="sm:hidden">Indoor</span>
                  </TabsTrigger>
                </TabsList>
              </div>

              {pickingCategory && (
                <div className="absolute right-4 top-4 z-[600] rounded-2xl border border-violet-300/30 bg-slate-950/75 px-4 py-2 text-sm text-violet-100 shadow-xl backdrop-blur">
                  Placing: <b>{pickingCategory}</b>
                </div>
              )}

              <TabsContent value="live" className="mt-0 h-full">
                <LiveMap
                  places={places}
                  selectedPlace={selectedPlace}
                  currentPosition={currentPosition}
                  onPickLocation={handlePickLocation}
                  pickingCategory={mapMode === "live" ? pickingCategory : null}
                  navigationActive={navigationActive}
                />
              </TabsContent>

              <TabsContent value="indoor" className="mt-0 h-full">
                <IndoorPlan
                  places={places}
                  selectedPlace={selectedPlace}
                  onPickLocation={handlePickLocation}
                  pickingCategory={mapMode === "indoor" ? pickingCategory : null}
                  navigationActive={navigationActive}
                  indoorMapImage={indoorMapImage}
                  onUploadClick={() => indoorFileInputRef.current?.click()}
                />
              </TabsContent>
            </Tabs>

            {mode === "user" && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[650] px-2 pb-2 md:inset-x-auto md:bottom-4 md:left-1/2 md:-translate-x-1/2 lg:hidden">
                <div className="pointer-events-auto mx-auto grid max-w-[520px] grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-b-[1.35rem] md:rounded-[1.35rem] bg-slate-950/88 p-3 shadow-[0_-14px_35px_rgba(2,6,23,0.28)] md:shadow-lg md:shadow-slate-950/40">
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-wide text-slate-400">
                      {mapMode === "live" ? "Live destination" : "Indoor destination"}
                    </div>
                    <div className="truncate text-sm font-semibold text-white">
                      {selectedPlace?.name || "Not started"}
                    </div>
                    <div className="mt-1 text-lg font-bold text-cyan-100">
                      {mapMode === "live"
                        ? liveDistance !== null
                          ? `${liveDistance.toFixed(1)} m`
                          : "—"
                        : indoorDistanceValue !== null
                          ? `${indoorDistanceValue.toFixed(0)} units`
                          : "—"}
                    </div>
                  </div>

                  <DirectionArrow
                    bearing={liveBearing}
                    active={navigationActive}
                    hasDestination={Boolean(selectedPlace)}
                    compact
                  />

                  <div className="flex flex-col items-end gap-2">
                    {navigationActive ? (
                      <Button size="sm" variant="destructive" onClick={stopNavigation}>
                        Stop
                      </Button>
                    ) : (
                      <Badge className="bg-cyan-400/15 text-cyan-100">Ready</Badge>
                    )}

                    <Button size="sm" variant="secondary" onClick={resetNavigation}>
                      Reset
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </section>
        </section>
      </div>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[900] bg-slate-950/70 backdrop-blur-sm lg:hidden">
          <div className="absolute left-3 top-3 flex max-h-[calc(100vh-1.5rem)] w-[min(360px,calc(100vw-1.5rem))] flex-col rounded-3xl border border-white/15 bg-slate-950/95 p-3 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-base font-semibold text-white">
                  {mode === "admin" ? "Manage places" : "Destinations"}
                </div>
                <div className="text-xs text-slate-400">
                  Mobile menu
                </div>
              </div>

              <Button
                size="icon"
                variant="secondary"
                onClick={() => setMobileMenuOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="min-h-0 flex-1">
              <SidebarContent
                mode={mode}
                groupedPlaces={groupedPlaces}
                openCategories={openCategories}
                toggleCategory={toggleCategory}
                startAdd={startAdd}
                chooseDestination={chooseDestination}
                setSelectedPlaceId={setSelectedPlaceId}
                selectedPlaceId={selectedPlaceId}
                startEdit={startEdit}
                deletePlace={deletePlace}
                loadPlaces={loadPlaces}
                closeMobileMenu={() => setMobileMenuOpen(false)}
              />
            </div>
          </div>
        </div>
      )}

      <PlaceDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        draft={draft}
        setDraft={setDraft}
        onSubmit={savePlace}
        editingPlace={editingPlace}
      />

      <DestinationDialog
        open={destinationDialogOpen}
        onOpenChange={setDestinationDialogOpen}
        place={pendingPlace}
        liveDistance={pendingLiveDistance}
        indoorDistanceValue={pendingIndoorDistanceValue}
        onStart={startNavigation}
      />

      <input
        ref={indoorFileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={handleIndoorMapUpload}
      />
    </main>
  )
}