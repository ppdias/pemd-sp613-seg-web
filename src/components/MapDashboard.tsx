import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { User, RoutePoint, Event } from "../types";
import { Shield, MapPin, Compass, WifiOff, Eye, EyeOff } from "lucide-react";
import logoImg from "../logoBeforeSplashScreen.png";

const getSectorColor = (sector: string): string => {
  const s = (sector || "").toLowerCase().trim();
  if (s.includes("inferior") || (s.includes("azul") && !s.includes("rio"))) {
    return "#1E88E5";
  }
  if (s.includes("superior") || s.includes("amarelo")) {
    return "#FFD600";
  }
  if (s.includes("rio") && !s.includes("azul")) {
    return "#C44A3A";
  }
  if (s.includes("vermelho")) {
    return "#C44A3A";
  }
  if (s.includes("rodovia") || s.includes("verde") || s.includes("oliva")) {
    return "#5B7E3C";
  }
  return "#568F87"; // Padrão / Outros (Azul Rio)
};

interface MapDashboardProps {
  users: User[];
  routes: RoutePoint[];
  events: Event[];
  isOnline: boolean;
  selectedRouteId?: string | null;
  onSelectRouteId?: (routeId: string | null) => void;
  onSelectAlertId?: (alertId: string | null) => void;
  resolvedAlerts?: string[];
  selectedAlertId?: string | null;
}

export default function MapDashboard({ 
  users, 
  routes, 
  events, 
  isOnline,
  selectedRouteId,
  onSelectRouteId,
  onSelectAlertId,
  resolvedAlerts = [],
  selectedAlertId = null
}: MapDashboardProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersGroupRef = useRef<L.LayerGroup | null>(null);
  const polylinesGroupRef = useRef<L.LayerGroup | null>(null);

  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [deviceLocation, setDeviceLocation] = useState<[number, number] | null>(null);
  const [showLegend, setShowLegend] = useState<boolean>(true);
  const [showActiveUsers, setShowActiveUsers] = useState<boolean>(true);

  // Resolve active route ID based on either direct route selection or selected alert's route
  const selectedAlert = selectedAlertId ? (events || []).find((e) => e.id === selectedAlertId) : null;
  const alertRouteId = selectedAlert ? selectedAlert.routeId : null;
  const activeRouteIdFilter = selectedRouteId || alertRouteId;

  // References to detect change triggers for fitting bounds
  const prevActiveRouteIdFilter = useRef<string | null | undefined>(undefined);
  const prevRoutesLength = useRef<number>(routes.length);
  const prevDeviceLocationStr = useRef<string>("");

  // Get current device location
  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setDeviceLocation([position.coords.latitude, position.coords.longitude]);
        },
        (error) => {
          console.warn("Geolocation warning: permission denied or unavailable. Fallback default active.", error);
          // Default starting center (São Paulo center)
          setDeviceLocation([-23.5505, -46.6333]);
        },
        { enableHighAccuracy: true, timeout: 5000 }
      );
    } else {
      setDeviceLocation([-23.5505, -46.6333]);
    }
  }, []);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // São Paulo central coordinate as default starting point
    const defaultCenter: L.LatLngExpression = [-23.5505, -46.6333];

    // Initialize Leaflet map with dark theme overlay options
    const map = L.map(mapContainerRef.current, {
      center: defaultCenter,
      zoom: 13,
      zoomControl: true,
    });

    // Light styled map tiles (ideal for light clean command center)
    L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 20,
    }).addTo(map);

    markersGroupRef.current = L.layerGroup().addTo(map);
    polylinesGroupRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Update map markers and polylines when users, routes, events, or selected route changes
  useEffect(() => {
    const map = mapRef.current;
    const markersGroup = markersGroupRef.current;
    const polylinesGroup = polylinesGroupRef.current;

    if (!map || !markersGroup || !polylinesGroup) return;

    // Clear old layers
    markersGroup.clearLayers();
    polylinesGroup.clearLayers();

    // 1. Draw Vigilante Path Tracks (Polylines)
    // Group route points by routeId
    const routesBySession: { [routeId: string]: RoutePoint[] } = {};
    routes.forEach((rp) => {
      if (!routesBySession[rp.routeId]) {
        routesBySession[rp.routeId] = [];
      }
      routesBySession[rp.routeId].push(rp);
    });

    // Sort and draw polyline for each session
    Object.entries(routesBySession).forEach(([routeId, points]) => {
      // If a route filter is active (either selected directly or from selected alert), only draw that route
      if (activeRouteIdFilter && routeId !== activeRouteIdFilter) {
        return;
      }

      const sortedPoints = [...points].sort((a, b) => a.timestamp - b.timestamp);
      const latLngs = sortedPoints.map((p) => {
        const [lat, lng] = p.latlong.split(",").map(Number);
        return [lat, lng] as [number, number];
      }).filter(([lat, lng]) => !isNaN(lat) && !isNaN(lng));

      if (latLngs.length > 1) {
        const isSelected = activeRouteIdFilter === routeId;
        const isEmergencyRoute = events.some((e) => e.routeId === routeId);
        
        const sectorName = points[0]?.sector || "Padrão";
        let color = getSectorColor(sectorName);
        
        if (isEmergencyRoute) {
          color = "#C44A3A"; // Red for emergency matches "Rio (Setor Vermelho)"
        }

        const polyline = L.polyline(latLngs as L.LatLngExpression[], {
          color: color,
          weight: isSelected ? 8 : 4,
          opacity: isSelected ? 1.0 : 0.8,
          dashArray: isEmergencyRoute ? "6, 6" : undefined,
        }).addTo(polylinesGroup);

        polyline.on("click", () => {
          if (onSelectRouteId) {
            onSelectRouteId(isSelected ? null : routeId);
          }
        });

        if (isSelected) {
          polyline.bringToFront();
        }
      }
    });

    // 2. Add Vigilante markers
    users.forEach((user) => {
      if (user.latitude && user.longitude && user.license === "Ativa") {
        const isVigilante = user.group === "Vigilante";
        const isSupervisor = user.group === "Supervisor" || user.group === "Gestor";

        // Custom HTML Marker matching the premium glassmorphism dark look
        const color = isSupervisor ? "#a855f7" : "#06b6d4"; // Purple for supervisor, Cyan for vigilante
        const iconHtml = `
          <div class="relative flex items-center justify-center">
            <div class="absolute w-8 h-8 rounded-full animate-ping opacity-25" style="background-color: ${color}"></div>
            <div class="w-6 h-6 rounded-full border-2 border-white flex items-center justify-center shadow-lg" style="background-color: ${color}">
              <img src="${user.photo || logoImg}" class="w-full h-full rounded-full object-cover" referrerPolicy="no-referrer" />
            </div>
          </div>
        `;

        const customIcon = L.divIcon({
          html: iconHtml,
          className: "custom-leaflet-icon",
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        });

        const marker = L.marker([user.latitude, user.longitude], { icon: customIcon })
          .addTo(markersGroup);

        const popupContent = `
          <div class="text-slate-900 p-2 font-sans">
            <div class="flex items-center gap-2 mb-1">
              <span class="w-2.5 h-2.5 rounded-full" style="background-color: ${color}"></span>
              <strong class="text-sm font-bold">${user.name}</strong>
            </div>
            <p class="text-xs text-slate-500 font-mono mb-1">Grupo: ${user.group}</p>
            <p class="text-xs text-slate-700">Licença: <span class="font-bold text-emerald-600">${user.licenseTime}</span></p>
            <p class="text-[10px] text-slate-400 mt-2">Última coord: ${user.latitude.toFixed(4)}, ${user.longitude.toFixed(4)}</p>
          </div>
        `;

        marker.bindPopup(popupContent);
      }
    });

    // 3. Add Event / SOS markers in Red / Amber / Gray
    events.forEach((ev) => {
      const [lat, lng] = ev.latlong.split(",").map(Number);
      if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
        const isResolved = resolvedAlerts.includes(ev.id);
        const isSos = ev.observacao.toLowerCase().includes("sos") || (ev.sector || "").toLowerCase().includes("avulso");
        
        let alertIconHtml = "";
        
        if (isResolved) {
          // Soft gray background with a checkmark for resolved alerts
          alertIconHtml = `
            <div class="relative flex items-center justify-center opacity-80">
              <div class="w-8 h-8 rounded-full border-2 border-slate-300 bg-slate-100 text-slate-500 flex items-center justify-center shadow-lg">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 text-slate-500"><polyline points="20 6 9 17 4 12"></polyline></svg>
              </div>
            </div>
          `;
        } else if (isSos) {
          alertIconHtml = `
            <div class="relative flex items-center justify-center">
              <div class="absolute w-12 h-12 rounded-full animate-ping bg-red-600 opacity-60"></div>
              <div class="w-8 h-8 rounded-full border-2 border-red-500 bg-red-700 text-white flex items-center justify-center shadow-2xl">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
              </div>
            </div>
          `;
        } else {
          alertIconHtml = `
            <div class="relative flex items-center justify-center">
              <div class="absolute w-12 h-12 rounded-full animate-ping bg-amber-500 opacity-40"></div>
              <div class="w-8 h-8 rounded-full border-2 border-amber-500 bg-amber-600 text-white flex items-center justify-center shadow-2xl relative">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 text-white"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"></path><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"></path></svg>
                <span class="absolute -top-0.5 -right-0.5 bg-rose-500 w-2 h-2 rounded-full animate-ping"></span>
                <span class="absolute -top-0.5 -right-0.5 bg-rose-500 w-2 h-2 rounded-full"></span>
              </div>
            </div>
          `;
        }
 
        const alertIcon = L.divIcon({
          html: alertIconHtml,
          className: "custom-alert-icon",
          iconSize: [40, 40],
          iconAnchor: [20, 20],
        });
 
        const alertMarker = L.marker([lat, lng], { icon: alertIcon })
          .addTo(markersGroup)
          .bindPopup(`
            <div class="text-slate-900 p-2 max-w-xs font-sans">
              <div class="flex items-center gap-1.5 ${isResolved ? "text-slate-500" : isSos ? "text-red-600" : "text-amber-600"} font-black text-sm mb-1">
                <span>${isResolved ? "✅ ALERTA RESOLVIDO" : isSos ? "⚠️ ALERTA SOS" : "🔔 ALERTA DE RONDA"}</span>
              </div>
              <p class="text-xs font-bold text-slate-800 mb-1">Setor: ${ev.sector}</p>
              <p class="text-xs text-slate-600 italic mb-2">"${ev.observacao}"</p>
              <div class="text-[10px] text-slate-500 bg-slate-100 p-1 rounded font-mono">
                Por: ${ev.userName}<br/>
                Hora: ${ev.date} às ${ev.hour}
              </div>
            </div>
          `);

        alertMarker.on("click", () => {
          if (onSelectAlertId) {
            onSelectAlertId(ev.id);
          }
        });
      }
    });

    // 4. Render Current Device Location Marker with custom glowing visual
    if (deviceLocation) {
      const deviceIconHtml = `
        <div class="relative flex items-center justify-center animate-pulse">
          <div class="absolute w-10 h-10 rounded-full animate-ping bg-emerald-500 opacity-30"></div>
          <div class="w-7 h-7 rounded-full border-2 border-white bg-emerald-600 text-white flex items-center justify-center shadow-lg">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line></svg>
          </div>
        </div>
      `;

      const deviceIcon = L.divIcon({
        html: deviceIconHtml,
        className: "custom-device-icon",
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });

      L.marker(deviceLocation, { icon: deviceIcon })
        .addTo(markersGroup)
        .bindPopup(`
          <div class="text-slate-900 p-2 font-sans">
            <strong class="text-sm font-bold text-emerald-700">Este Dispositivo</strong>
            <p class="text-xs text-slate-500 mt-0.5">Sua localização operacional em tempo real</p>
            <p class="text-[10px] font-mono text-slate-400 mt-1">${deviceLocation[0].toFixed(5)}, ${deviceLocation[1].toFixed(5)}</p>
          </div>
        `);
    }

    // 5. Fit bounds elegantly depending on trigger inputs
    const deviceLocStr = deviceLocation ? `${deviceLocation[0]},${deviceLocation[1]}` : "";
    const routesChanged = routes.length !== prevRoutesLength.current;
    const activeRouteChanged = activeRouteIdFilter !== prevActiveRouteIdFilter.current;
    const deviceLocLoaded = deviceLocStr !== prevDeviceLocationStr.current;

    if (activeRouteChanged || routesChanged || deviceLocLoaded) {
      if (activeRouteIdFilter) {
        // Fit Map Bounds to the clicked route points specifically
        const selectedRoutePoints = routes.filter((r) => r.routeId === activeRouteIdFilter);
        const selectedLatLngs = selectedRoutePoints.map((p) => {
          const [lat, lng] = p.latlong.split(",").map(Number);
          return [lat, lng] as [number, number];
        }).filter(([lat, lng]) => !isNaN(lat) && !isNaN(lng));

        if (selectedLatLngs.length > 0) {
          map.fitBounds(L.latLngBounds(selectedLatLngs), { padding: [50, 50], maxZoom: 16 });
        }
      } else if (routes.length > 0) {
        // Fit Map Bounds to show BOTH current device location and routes of the last 30 days
        const boundsCoords: L.LatLngExpression[] = [];
        if (deviceLocation) {
          boundsCoords.push(deviceLocation);
        }

        // Filter routes of last 30 days
        const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;
        const last30DaysPoints = routes.filter((rp) => Math.abs(Date.now() - rp.timestamp) <= thirtyDaysInMs);
        const pointsToUse = last30DaysPoints.length > 0 ? last30DaysPoints : routes;

        pointsToUse.forEach((p) => {
          const [lat, lng] = p.latlong.split(",").map(Number);
          if (!isNaN(lat) && !isNaN(lng)) {
            boundsCoords.push([lat, lng]);
          }
        });

        if (boundsCoords.length > 0) {
          map.fitBounds(L.latLngBounds(boundsCoords), { padding: [60, 60], maxZoom: 15 });
        }
      } else if (deviceLocation) {
        map.setView(deviceLocation, 14);
      }

      // Sync refs
      prevActiveRouteIdFilter.current = activeRouteIdFilter;
      prevRoutesLength.current = routes.length;
      prevDeviceLocationStr.current = deviceLocStr;
    }

    // If a specific active user from the quick list is clicked, center on them
    if (selectedUser && selectedUser.latitude && selectedUser.longitude) {
      map.setView([selectedUser.latitude, selectedUser.longitude], 15);
    }

  }, [users, routes, events, selectedUser, selectedRouteId, selectedAlertId, deviceLocation]);

  return (
    <div className="relative w-full h-[550px] bg-white rounded-2xl overflow-hidden border border-slate-200/80 shadow-xl">
      {/* Map Element */}
      <div id="map" ref={mapContainerRef} className="w-full h-full z-10" />

      {/* Floating Info Panels (Glassmorphism Overlay) */}
      <div className="absolute top-4 left-4 z-20 flex flex-col gap-2 max-w-xs pointer-events-auto">
        <div className="flex items-center gap-2 bg-white/95 backdrop-blur-md border border-slate-200/80 px-3 py-1.5 rounded-full shadow-md">
          <Shield className="w-4 h-4 text-cyan-600 animate-pulse" />
          <span className="text-xs text-slate-800 font-bold font-mono">
            PEMD SP613-Seg: Mapa de Operações
          </span>
        </div>

        {/* Offline cache notice */}
        {!isOnline && (
          <div className="flex items-center gap-2 bg-amber-50 backdrop-blur-md border border-amber-200 px-3 py-1.5 rounded-full shadow-md">
            <WifiOff className="w-4 h-4 text-amber-600" />
            <span className="text-xs text-amber-800 font-medium font-mono">
              Offline - Coordenadas locais (IndexedDB)
            </span>
          </div>
        )}
      </div>

      {/* Sectors Legend (Legenda dos Setores) */}
      <div className={`absolute bottom-4 left-4 z-20 bg-white/95 backdrop-blur-md border border-slate-200 p-3 rounded-2xl shadow-lg transition-all duration-300 pointer-events-auto ${showLegend ? "w-60" : "w-28"}`}>
        <div className="flex items-center justify-between gap-3 border-b border-slate-150 pb-2 mb-2">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-cyan-600 animate-pulse"></span>
            <span className="text-[11px] font-bold text-slate-800 uppercase tracking-wider font-mono">Setores</span>
          </div>
          <button 
            onClick={() => setShowLegend(!showLegend)}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors focus:outline-none cursor-pointer flex items-center justify-center"
            title={showLegend ? "Ocultar legenda" : "Mostrar legenda"}
          >
            {showLegend ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        {showLegend && (
          <div className="space-y-2 animate-fade-in">
            <div className="flex items-center gap-2 text-xs">
              <span className="w-3 h-3 rounded-full border border-white shadow-xs flex-shrink-0" style={{ backgroundColor: "#1E88E5" }}></span>
              <span className="text-slate-700 font-medium font-sans">Parte Inferior</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="w-3 h-3 rounded-full border border-white shadow-xs flex-shrink-0" style={{ backgroundColor: "#FFD600" }}></span>
              <span className="text-slate-700 font-medium font-sans">Parte Superior</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="w-3 h-3 rounded-full border border-white shadow-xs flex-shrink-0" style={{ backgroundColor: "#C44A3A" }}></span>
              <span className="text-slate-700 font-medium font-sans">Rio</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="w-3 h-3 rounded-full border border-white shadow-xs flex-shrink-0" style={{ backgroundColor: "#5B7E3C" }}></span>
              <span className="text-slate-700 font-medium font-sans">Rodovia</span>
            </div>
          </div>
        )}
      </div>

      {/* Active Vigilante Quick-List */}
      <div className={`absolute bottom-4 right-4 z-20 bg-white/95 backdrop-blur-md border border-slate-200 p-3 rounded-2xl shadow-lg transition-all duration-300 pointer-events-auto ${showActiveUsers ? "w-64 max-h-[220px] overflow-y-auto" : "w-52 max-h-[46px] overflow-hidden"} custom-scrollbar`}>
        <div className={`flex items-center justify-between ${showActiveUsers ? "border-b border-slate-100 pb-2 mb-2" : ""}`}>
          <div className="flex items-center gap-1.5">
            <Compass className="w-3.5 h-3.5 text-cyan-600 animate-pulse" />
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider font-mono">Usuários Ativos</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="bg-cyan-50 text-cyan-600 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
              {users.filter(u => u.latitude && u.longitude && u.license === "Ativa").length}
            </span>
            <button 
              onClick={() => setShowActiveUsers(!showActiveUsers)}
              className="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-100 transition-colors focus:outline-none cursor-pointer flex items-center justify-center"
              title={showActiveUsers ? "Ocultar usuários" : "Mostrar usuários"}
            >
              {showActiveUsers ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {showActiveUsers && (
          <div className="space-y-1.5 animate-fade-in">
            {users
              .filter((u) => u.latitude && u.longitude && u.license === "Ativa")
              .map((u) => {
                const isSupervisor = u.group === "Supervisor" || u.group === "Gestor";
                return (
                  <div
                    key={u.id}
                    onClick={() => setSelectedUser(u)}
                    className={`flex items-center justify-between p-1.5 rounded-lg cursor-pointer transition-all border ${
                      selectedUser?.id === u.id
                        ? "bg-cyan-50 border-cyan-200/80 text-cyan-900 font-semibold"
                        : "bg-slate-50 border-transparent text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <img
                        src={u.photo || logoImg}
                        className="w-5 h-5 rounded-full object-cover flex-shrink-0"
                        referrerPolicy="no-referrer"
                      />
                      <span className="text-xs truncate">{u.name}</span>
                    </div>
                    <span
                      className={`text-[9px] px-1 py-0.5 rounded font-mono ${
                        isSupervisor
                          ? "bg-purple-50 text-purple-600"
                          : "bg-cyan-50 text-cyan-600"
                      }`}
                    >
                      {u.group}
                    </span>
                  </div>
                );
              })}
            {users.filter((u) => u.latitude && u.longitude && u.license === "Ativa").length === 0 && (
              <div className="text-center text-xs text-slate-400 py-3 italic">
                Nenhum usuário ativo no mapa
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
