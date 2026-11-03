import React, { useState, useEffect } from 'react';
import { Search, Plus, Navigation, CheckCircle2, Users, Compass } from 'lucide-react';
// @ts-ignore
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { CourseItem } from '../types';
import { DEFAULT_HOME_COURSE } from '../data/courses';
import { searchCoursesDb, createCourseWithLayout, updateCourseDb, type NewCourseInput } from '../lib/coursesDb';

const coursePinIcon = L.divIcon({
  className: 'custom-map-pin',
  html: `<div style="background-color: #0284c7; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid white; box-shadow: 0 4px 6px rgba(0,0,0,0.3); font-size: 14px;">⛳</div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 28],
  popupAnchor: [0, -28],
});

function MapUpdater({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, 13);
  }, [center, map]);
  return null;
}

interface CoursesTabProps {
  userPosition?: any;
  onSelectCourse?: (course: CourseItem) => void;
  onStartGame?: (course: CourseItem) => void;
}

export const CoursesTab: React.FC<CoursesTabProps> = ({ userPosition, onSelectCourse, onStartGame }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [courses, setCourses] = useState<CourseItem[]>([DEFAULT_HOME_COURSE]);
  const [selectedCourse, setSelectedCourse] = useState<CourseItem>(DEFAULT_HOME_COURSE);
  const [loading, setLoading] = useState(false);

  const [showAddModal, setShowAddModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [modalForm, setModalForm] = useState({
    id: '',
    name: '',
    city: '',
    municipality: '',
    holes_count: 9,
    lat: 60.0385,
    lng: 5.2105,
  });

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = searchQuery.trim();
    if (!query) {
      setCourses([DEFAULT_HOME_COURSE]);
      setSelectedCourse(DEFAULT_HOME_COURSE);
      return;
    }

    setLoading(true);
    try {
      const results = await searchCoursesDb(query);
      if (results.length > 0) {
        setCourses(results);
        setSelectedCourse(results[0]);
      } else {
        setCourses([]);
      }
    } catch (err) {
      console.error('Feil ved søk:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAdd = () => {
    setIsEditing(false);
    setModalForm({
      id: '',
      name: '',
      city: '',
      municipality: '',
      holes_count: 9,
      lat: userPosition?.lat || selectedCourse.lat || 60.0385,
      lng: userPosition?.lng || selectedCourse.lng || 5.2105,
    });
    setShowAddModal(true);
  };

  const handleOpenEdit = (course: CourseItem) => {
    setIsEditing(true);
    setModalForm({
      id: course.id,
      name: course.name,
      city: '',
      municipality: '',
      holes_count: course.holes,
      lat: course.lat,
      lng: course.lng,
    });
    setShowAddModal(true);
  };

  const handleSaveCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalForm.name.trim()) return;

    try {
      if (isEditing) {
        await updateCourseDb(modalForm.id, {
          name: modalForm.name,
          holes_count: Number(modalForm.holes_count),
          city: modalForm.city || undefined,
          municipality: modalForm.municipality || undefined,
        });
      } else {
        const newCourse: NewCourseInput = {
          name: modalForm.name,
          city: modalForm.city,
          municipality: modalForm.municipality,
          lat: Number(modalForm.lat),
          lng: Number(modalForm.lng),
          holes_count: Number(modalForm.holes_count),
        };
        await createCourseWithLayout(newCourse);
      }

      setShowAddModal(false);
      handleSearch();
    } catch (err) {
      console.error('Kunne ikke lagre bane:', err);
      alert('Det oppstod en feil under lagring. Sjekk at du er logget inn.');
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 p-4 space-y-4 pb-24 overflow-y-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <Compass className="w-5 h-5 text-sky-400" /> Baner
          </h1>
          <p className="text-xs text-slate-400">Finn baner i nærheten, se detaljer og start runde</p>
        </div>
        <button
          onClick={handleOpenAdd}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-slate-950 rounded-lg shadow-sm transition"
        >
          <Plus className="w-4 h-4" /> Ny bane
        </button>
      </div>

      <div className="h-56 w-full rounded-2xl overflow-hidden border border-slate-800 shadow-inner relative z-0">
        <MapContainer
          center={[selectedCourse.lat, selectedCourse.lng]}
          zoom={13}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapUpdater center={[selectedCourse.lat, selectedCourse.lng]} />
          {courses.map((course) => (
            <Marker
              key={course.id}
              position={[course.lat, course.lng]}
              icon={coursePinIcon}
              eventHandlers={{
                click: () => {
                  setSelectedCourse(course);
                  if (onSelectCourse) onSelectCourse(course);
                },
              }}
            >
              <Popup>
                <div className="text-slate-900 font-sans">
                  <div className="font-bold text-sm">{course.name}</div>
                  <div className="text-xs text-slate-600">{course.location} • {course.holes} hull</div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Søk etter bane, by eller kommune..."
            className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500 transition"
          />
        </div>
        <button
          type="submit"
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded-xl border border-slate-700 transition"
        >
          {loading ? 'Søker...' : 'Søk'}
        </button>
      </form>

      <div className="space-y-2">
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Søkeresultater ({courses.length})
        </div>

        {courses.length === 0 ? (
          <div className="text-center py-8 text-slate-500 text-sm">
            Ingen baner funnet. Vil du opprette den via «Ny bane»?
          </div>
        ) : (
          courses.map((course) => {
            const isSelected = selectedCourse.id === course.id;
            return (
              <div
                key={course.id}
                onClick={() => {
                  setSelectedCourse(course);
                  if (onSelectCourse) onSelectCourse(course);
                }}
                className={`p-3.5 rounded-xl border transition cursor-pointer flex items-center justify-between ${
                  isSelected
                    ? 'bg-sky-950/40 border-sky-500/60 shadow-md shadow-sky-950/20'
                    : 'bg-slate-900/80 border-slate-800/80 hover:border-slate-700'
                }`}
              >
                <div className="flex-1 pr-2">
                  <div className="text-sm font-bold text-white flex items-center gap-1.5">
                    {course.name}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-slate-400">
                      {course.location} • {course.holes} hull
                    </span>
                    {course.is_verified ? (
                      <span className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 rounded">
                        <CheckCircle2 className="w-2.5 h-2.5" /> Verifisert
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold bg-amber-950/80 border border-amber-500/50 text-amber-300 rounded">
                        <Users className="w-2.5 h-2.5" /> Fellesskap
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenEdit(course);
                    }}
                    className="p-1.5 text-xs text-slate-400 hover:text-sky-300 hover:bg-slate-800 rounded-lg transition"
                    title="Rediger banedetaljer"
                  >
                    Rediger
                  </button>
                  {onStartGame && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onStartGame(course);
                      }}
                      className="p-2 bg-sky-500 hover:bg-sky-400 text-slate-950 rounded-lg transition"
                      title="Start runde"
                    >
                      <Navigation className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-5 space-y-4 shadow-xl">
            <h2 className="text-lg font-bold text-white">
              {isEditing ? 'Rediger bane' : 'Legg til ny bane'}
            </h2>
            <form onSubmit={handleSaveCourse} className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Banenavn</label>
                <input
                  type="text"
                  required
                  value={modalForm.name}
                  onChange={(e) => setModalForm({ ...modalForm, name: e.target.value })}
                  placeholder="f.eks. Kolbeinsvik Frisbeegolfbane"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Sted / By</label>
                  <input
                    type="text"
                    value={modalForm.city}
                    onChange={(e) => setModalForm({ ...modalForm, city: e.target.value })}
                    placeholder="f.eks. Kolbeinsvik"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Kommune</label>
                  <input
                    type="text"
                    value={modalForm.municipality}
                    onChange={(e) => setModalForm({ ...modalForm, municipality: e.target.value })}
                    placeholder="f.eks. Austevoll"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Antall hull</label>
                <input
                  type="number"
                  min="1"
                  max="36"
                  required
                  value={modalForm.holes_count}
                  onChange={(e) => setModalForm({ ...modalForm, holes_count: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-sky-500"
                />
              </div>

              {!isEditing && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Breddegrad (Lat)</label>
                    <input
                      type="number"
                      step="any"
                      required
                      value={modalForm.lat}
                      onChange={(e) => setModalForm({ ...modalForm, lat: Number(e.target.value) })}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-sky-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Lengdegrad (Lng)</label>
                    <input
                      type="number"
                      step="any"
                      required
                      value={modalForm.lng}
                      onChange={(e) => setModalForm({ ...modalForm, lng: Number(e.target.value) })}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-sky-500"
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-2 text-xs text-slate-400 hover:text-white transition"
                >
                  Avbryt
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold rounded-lg transition"
                >
                  {isEditing ? 'Lagre endringer' : 'Opprett bane'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};