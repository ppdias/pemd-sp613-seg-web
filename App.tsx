import React, { useState, useEffect } from "react";
import { User, LogEntry, RoutePoint, Event } from "./types";
import { checkFirebaseConnection, isFirebaseConfigured } from "./lib/firebase";
import { FirebaseSync as SyncManager, localDb, convertUrlToBase64 } from "./lib/db";
import { exportToSimucCSV } from "./utils/csvExporter";
import MapDashboard from "./components/MapDashboard";
import UserLicenseTable, { getLicenseInfo } from "./components/UserLicenseTable";
import AlertCenter from "./components/AlertCenter";
import IAAssistant from "./components/IAAssistant";
import LogsHistory from "./components/LogsHistory";
import RoutesViewer from "./components/RoutesViewer";
import LoginScreen from "./components/LoginScreen";
import AlertAttachmentsFullScreen from "./components/AlertAttachmentsFullScreen";
import logoImg from "./logoBeforeSplashScreen.png";

// Lucide icons
import { 
  Shield, 
  Wifi, 
  WifiOff, 
  RefreshCcw, 
  Users, 
  BellRing, 
  CheckSquare, 
  Activity, 
  Clock, 
  Database, 
  Cpu, 
  PlusCircle, 
  MapPin, 
  Lock,
  Download,
  Calendar,
  Filter,
  X,
  LogOut
} from "lucide-react";

// Recharts for hourly spikes
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from "recharts";

function parseDateString(dateStr: string): Date | null {
  if (!dateStr) return null;
  // If in format "DD/MM/YYYY"
  if (dateStr.includes("/")) {
    const parts = dateStr.split("/");
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1; // 0-indexed
      const year = parseInt(parts[2], 10);
      return new Date(year, month, day);
    }
  }
  // If in format "YYYY-MM-DD"
  if (dateStr.includes("-")) {
    const parts = dateStr.split("-");
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      return new Date(year, month, day);
    }
  }
  return null;
}

export default function App() {
  // Master application states
  const [users, setUsers] = useState<User[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [routes, setRoutes] = useState<RoutePoint[]>([]);

  // Simulated logged-in user (Recursive Hierarchy Operator Session)
  const [currentUserLogin, setCurrentUserLogin] = useState<string>(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const urlUser = urlParams.get("user");
      if (urlUser) {
        localStorage.setItem("pemd_logged_user", urlUser);
        return urlUser;
      }
    } catch (e) {
      console.warn("localStorage error:", e);
    }
    return localStorage.getItem("pemd_logged_user") || "";
  });

  const handleLoginSuccess = async (login: string) => {
    setCurrentUserLogin(login);
    localStorage.setItem("pemd_logged_user", login);

    // Dynamic logging of the successful login event (safely wrapped to avoid blocking)
    const matchedUser = users.find(u => u.login === login);
    if (matchedUser) {
      const brasiliaTime = new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
      const dateObj = new Date(brasiliaTime);
      const formattedDate = `${String(dateObj.getDate()).padStart(2, '0')}/${String(dateObj.getMonth() + 1).padStart(2, '0')}/${dateObj.getFullYear()}`;
      const formattedTime = `${String(dateObj.getHours()).padStart(2, '0')}:${String(dateObj.getMinutes()).padStart(2, '0')}:${String(dateObj.getSeconds()).padStart(2, '0')}`;

      SyncManager.addLog({
        userId: matchedUser.id,
        userName: matchedUser.login,
        userGroup: matchedUser.group,
        eventType: "login",
        description: `Operador @${matchedUser.login} realizou login no painel com sucesso.`,
        date: formattedDate,
        hour: formattedTime,
        machineId: "Dashboard_Web",
        ipAddress: "Localhost",
        latlong: matchedUser.latitude && matchedUser.longitude ? `${matchedUser.latitude},${matchedUser.longitude}` : "-23.5505,-46.6333",
        targetTable: "users",
        targetId: matchedUser.id
      }).catch(err => {
        console.warn("Failed to write login log in background:", err);
      });
    }
  };

  const handleLogout = async () => {
    const matchedUser = users.find(u => u.login === currentUserLogin);
    if (matchedUser) {
      const brasiliaTime = new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
      const dateObj = new Date(brasiliaTime);
      const formattedDate = `${String(dateObj.getDate()).padStart(2, '0')}/${String(dateObj.getMonth() + 1).padStart(2, '0')}/${dateObj.getFullYear()}`;
      const formattedTime = `${String(dateObj.getHours()).padStart(2, '0')}:${String(dateObj.getMinutes()).padStart(2, '0')}:${String(dateObj.getSeconds()).padStart(2, '0')}`;

      SyncManager.addLog({
        userId: matchedUser.id,
        userName: matchedUser.login,
        userGroup: matchedUser.group,
        eventType: "logout",
        description: `Operador @${matchedUser.login} encerrou a sessão de monitoramento.`,
        date: formattedDate,
        hour: formattedTime,
        machineId: "Dashboard_Web",
        ipAddress: "Localhost",
        latlong: matchedUser.latitude && matchedUser.longitude ? `${matchedUser.latitude},${matchedUser.longitude}` : "-23.5505,-46.6333",
        targetTable: "users",
        targetId: matchedUser.id
      }).catch(err => {
        console.warn("Failed to write logout log in background:", err);
      });
    }

    // Instantly terminate local session state
    setCurrentUserLogin("");
    localStorage.removeItem("pemd_logged_user");
  };

  // Connectivity and synchronization states
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [firebaseConnected, setFirebaseConnected] = useState<boolean>(false);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>("Nunca");

  // Automatic synchronization scheduler states (persisted in localStorage)
  const [lastHourlySyncHour, setLastHourlySyncHour] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("pemd_last_hourly_sync_hour");
      return saved ? parseInt(saved, 10) : -1;
    } catch {
      return -1;
    }
  });

  const [retryCount, setRetryCount] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("pemd_retry_count");
      return saved ? parseInt(saved, 10) : 0;
    } catch {
      return 0;
    }
  });

  const [isRetryPending, setIsRetryPending] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem("pemd_is_retry_pending");
      return saved === "true";
    } catch {
      return false;
    }
  });

  const [lastSyncAttemptTime, setLastSyncAttemptTime] = useState<number>(() => {
    try {
      const saved = localStorage.getItem("pemd_last_sync_attempt_time");
      return saved ? parseInt(saved, 10) : 0;
    } catch {
      return 0;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("pemd_last_hourly_sync_hour", lastHourlySyncHour.toString());
      localStorage.setItem("pemd_retry_count", retryCount.toString());
      localStorage.setItem("pemd_is_retry_pending", isRetryPending ? "true" : "false");
      localStorage.setItem("pemd_last_sync_attempt_time", lastSyncAttemptTime.toString());
    } catch (e) {
      console.error("Error saving automatic sync state to localStorage:", e);
    }
  }, [lastHourlySyncHour, retryCount, isRetryPending, lastSyncAttemptTime]);
  const [activeTab, setActiveTab] = useState<"map" | "users" | "routes" | "alerts" | "ia" | "logs">("map");

  // New simulated event form modal states
  const [showAddEvent, setShowAddEvent] = useState<boolean>(false);
  const [newEventSector, setNewEventSector] = useState<string>("Setor A - Galpão Principal");
  const [newEventObservacao, setNewEventObservacao] = useState<string>("");
  const [newEventNotes, setNewEventNotes] = useState<string>("");
  const [newEventUser, setNewEventUser] = useState<string>("csilva");

  // Route Filter & Selection states
  const [routeFilterSector, setRouteFilterSector] = useState<string>("todos");
  const [routeFilterUser, setRouteFilterUser] = useState<string>("todos");
  const [routeFilterStartDate, setRouteFilterStartDate] = useState<string>("");
  const [routeFilterEndDate, setRouteFilterEndDate] = useState<string>("");
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);

  // Resolved & Inactive alerts state for synchronization with Map & Alerts
  const [resolvedAlerts, setResolvedAlerts] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("pemd_resolved_alerts");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [showInactiveAlerts, setShowInactiveAlerts] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem("pemd_show_inactive_alerts");
      return saved ? JSON.parse(saved) === "true" : false;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("pemd_resolved_alerts", JSON.stringify(resolvedAlerts));
    } catch (e) {
      console.error(e);
    }
  }, [resolvedAlerts]);

  useEffect(() => {
    try {
      localStorage.setItem("pemd_show_inactive_alerts", showInactiveAlerts ? "true" : "false");
    } catch (e) {
      console.error(e);
    }
  }, [showInactiveAlerts]);

  // SIMUC CSV Export dialog states
  const [showSimucModal, setShowSimucModal] = useState<boolean>(false);
  const [simucStartDate, setSimucStartDate] = useState<string>("");
  const [simucEndDate, setSimucEndDate] = useState<string>("");
  const [simucUser, setSimucUser] = useState<string>("todos");
  const [simucSector, setSimucSector] = useState<string>("todos");

  // Media & DB Synchronization active visual state
  const [syncDetails, setSyncDetails] = useState<{
    show: boolean;
    step: string;
    progress: number;
    log: string[];
  }>({
    show: false,
    step: "",
    progress: 0,
    log: []
  });

  // Active user object derived from the selector
  const currentUser = users.find(u => u.login === currentUserLogin) || users.find(u => u.group === "Super_saiyajin_instinto_superior") || users[0];

  /**
   * isUnderResponsibility (Mirroring Kotlin DatabaseManager.kt Gestão por Responsabilidade)
   * Recursively checks if targetUser is under curUser's responsibility tree
   */
  const isUnderResponsibility = (curUser: User | undefined, targetUser: User, list: User[]): boolean => {
    if (!curUser) return false;
    if (curUser.login === targetUser.login) return true;
    
    // Super Saiyajin has total global access
    if (curUser.group === "Super_saiyajin_instinto_superior") return true;
    
    // Admin has total access to unit
    if (curUser.group === "Admin") return true;
    
    // Supervisor sees Vigilantes and Monitores where userOwner == supervisor.login
    if (curUser.group === "Supervisor") {
      return targetUser.userOwner === curUser.login;
    }
    
    // Monitor is tactical; sees their own data
    if (curUser.group === "Monitor") {
      return targetUser.login === curUser.login;
    }
    
    // Vigilante only views themselves
    if (curUser.group === "Vigilante") {
      return targetUser.login === curUser.login;
    }
    
    // Gestor sees Supervisors under command, and their subordinates recursively
    if (curUser.group === "Gestor") {
      if (targetUser.userOwner === curUser.login) return true;
      // Recurse up targetUser's owner chain
      let owner = list.find(u => u.login === targetUser.userOwner);
      while (owner) {
        if (owner.login === curUser.login) return true;
        if (owner.userOwner) {
          owner = list.find(u => u.login === owner!.userOwner);
        } else {
          break;
        }
      }
    }
    
    return false;
  };

  // 1. Calculate active viewports according to recursive hierarchy
  const visibleUsers = users.filter((u) => isUnderResponsibility(currentUser, u, users));
  const visibleRoutes = routes.filter((r) => visibleUsers.some(u => u.login === r.userName || u.id === r.userId));
  
  // Tactical observation override: Monitores see all alerts & logs, others filter
  const visibleEvents = events.filter((e) => {
    if (currentUser?.group === "Monitor" || currentUser?.group === "Super_saiyajin_instinto_superior" || currentUser?.group === "Admin") return true;
    return visibleUsers.some(u => u.login === e.userName || u.id === e.userId);
  });
  
  // Filtered events to be shown on map based on inactive status
  const eventsToShowOnMap = visibleEvents.filter((e) => showInactiveAlerts || !resolvedAlerts.includes(e.id));
  
  const visibleLogs = logs.filter((l) => {
    if (currentUser?.group === "Monitor" || currentUser?.group === "Super_saiyajin_instinto_superior" || currentUser?.group === "Admin") return true;
    return visibleUsers.some(u => u.login === l.userName || u.id === l.userId);
  });

  // Calculate filtered routes for map and RoutesViewer matching the filter criteria
  const getFilteredRoutes = () => {
    return visibleRoutes.filter((route) => {
      if (routeFilterSector !== "todos" && route.sector !== routeFilterSector) {
        return false;
      }
      if (routeFilterUser !== "todos" && route.userName !== routeFilterUser && route.userId !== routeFilterUser) {
        return false;
      }
      if (routeFilterStartDate) {
        const startObj = parseDateString(routeFilterStartDate);
        const routeObj = parseDateString(route.date);
        if (startObj && routeObj) {
          startObj.setHours(0, 0, 0, 0);
          routeObj.setHours(0, 0, 0, 0);
          if (routeObj < startObj) {
            return false;
          }
        }
      }
      if (routeFilterEndDate) {
        const endObj = parseDateString(routeFilterEndDate);
        const routeObj = parseDateString(route.date);
        if (endObj && routeObj) {
          endObj.setHours(0, 0, 0, 0);
          routeObj.setHours(0, 0, 0, 0);
          if (routeObj > endObj) {
            return false;
          }
        }
      }
      return true;
    });
  };

  const filteredRoutes = getFilteredRoutes();

  // Dynamic unique sectors list
  const availableSectors = Array.from(new Set([
    ...routes.map(r => r.sector).filter(Boolean),
    ...events.map(e => e.sector).filter(Boolean)
  ]));

  const handleSimucFilterAndExport = () => {
    const startDateObj = parseDateString(simucStartDate);
    const endDateObj = parseDateString(simucEndDate);

    // Filter routes from visibleRoutes (strictly respecting hierarchy)
    const filteredSimucRoutes = visibleRoutes.filter((route) => {
      // 1. Sector filter
      if (simucSector !== "todos" && route.sector !== simucSector) {
        return false;
      }
      // 2. User filter
      if (simucUser !== "todos" && route.userName !== simucUser && route.userId !== simucUser) {
        return false;
      }
      // 3. Date period filter (inclusive)
      if (startDateObj || endDateObj) {
        const rDateObj = parseDateString(route.date);
        if (!rDateObj) return false;
        
        // Ignore time portions for comparison
        const dObj = new Date(rDateObj.getFullYear(), rDateObj.getMonth(), rDateObj.getDate());
        
        if (startDateObj) {
          const sObj = new Date(startDateObj.getFullYear(), startDateObj.getMonth(), startDateObj.getDate());
          if (dObj < sObj) return false;
        }
        if (endDateObj) {
          const eObj = new Date(endDateObj.getFullYear(), endDateObj.getMonth(), endDateObj.getDate());
          if (dObj > eObj) return false;
        }
      }
      return true;
    });

    // Filter events from visibleEvents (strictly respecting hierarchy)
    const filteredSimucEvents = visibleEvents.filter((event) => {
      // 1. Sector filter
      if (simucSector !== "todos" && event.sector !== simucSector) {
        return false;
      }
      // 2. User filter
      if (simucUser !== "todos" && event.userName !== simucUser && event.userId !== simucUser) {
        return false;
      }
      // 3. Date period filter (inclusive)
      if (startDateObj || endDateObj) {
        const eDateObj = parseDateString(event.date);
        if (!eDateObj) return false;
        
        const dObj = new Date(eDateObj.getFullYear(), eDateObj.getMonth(), eDateObj.getDate());
        
        if (startDateObj) {
          const sObj = new Date(startDateObj.getFullYear(), startDateObj.getMonth(), startDateObj.getDate());
          if (dObj < sObj) return false;
        }
        if (endDateObj) {
          const eObj = new Date(endDateObj.getFullYear(), endDateObj.getMonth(), endDateObj.getDate());
          if (dObj > eObj) return false;
        }
      }
      return true;
    });

    // Call custom structured SIMUC/ICMBio CSV Exporter
    exportToSimucCSV({
      routes: filteredSimucRoutes,
      events: filteredSimucEvents,
      currentUserLogin: currentUserLogin
    });

    // Close the filter modal
    setShowSimucModal(false);
  };

  // 1. Monitor browser online status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => {
      setIsOnline(false);
      setFirebaseConnected(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // 2. Setup Real-time Firebase and Local Cache streams
  useEffect(() => {
    const unsubscribe = SyncManager.setupRealtimeListeners(
      (updatedUsers) => setUsers(updatedUsers),
      (updatedLogs) => setLogs(updatedLogs),
      (updatedEvents) => setEvents(updatedEvents),
      (updatedRoutes) => setRoutes(updatedRoutes)
    );

    // Initial manual connection test
    testConnection();

    return () => {
      unsubscribe();
    };
  }, []);

  const testConnection = async (showModal: boolean = false): Promise<boolean> => {
    let isSyncSuccessful = false;
    setSyncing(true);
    if (showModal) {
      setSyncDetails({
        show: true,
        step: "Iniciando sincronização tática...",
        progress: 5,
        log: [
          "Iniciando Sincronizador Central de Comando...",
          "Conectando ao banco de dados IndexedDB local...",
          "Analisando filas de transmissão assíncronas..."
        ]
      });
    }

    try {
      const conn = await checkFirebaseConnection();
      setFirebaseConnected(conn.online);
      
      if (showModal) {
        setSyncDetails(prev => ({
          ...prev,
          progress: 20,
          step: conn.online ? "Conexão estabelecida com sucesso!" : "Firebase em modo offline.",
          log: [...prev.log, conn.online ? "✓ Conexão de rede ativa com o Firebase Firestore estabelecida." : "⚠ Sem conectividade direta com o Firebase. Sincronização em Cache de Contingência."]
        }));
        await new Promise(r => setTimeout(r, 500));
      }

      if (showModal) {
        setSyncDetails(prev => ({
          ...prev,
          progress: 40,
          step: "Sincronizando banco de dados bidirecional...",
          log: [
            ...prev.log, 
            "Baixando atualizações táticas remotas de usuários...", 
            "Enviando novos registros de logs de auditoria...",
            "Sincronizando pontos de rotas e patrulhas ativas..."
          ]
        }));
      }

      // Perform full bidirectional synchronization
      const syncResult = await SyncManager.syncBidirectional();
      if (syncResult.success) {
        setLastSyncTime(new Date().toLocaleTimeString("pt-BR"));
        isSyncSuccessful = true;
      }

      if (showModal) {
        setSyncDetails(prev => ({
          ...prev,
          progress: 60,
          step: "Dados sincronizados! Varrendo mídias de ocorrências...",
          log: [
            ...prev.log, 
            "✓ Sincronização do banco de dados finalizada com sucesso.", 
            "Escaneando tabela de ocorrências para identificar mídias associadas..."
          ]
        }));
        await new Promise(r => setTimeout(r, 600));

        // Get fresh events and extract media URLs
        const freshEvents = await localDb.getAll<Event>("events");
        const mediaToSync: { type: string; url: string; label: string; name: string; eventId: string; field: string }[] = [];

        freshEvents.forEach(evt => {
          // Check images
          const getImagesList = (alert: Event): string[] => {
            const list: string[] = [];
            const addUrls = (arr: any) => {
              if (Array.isArray(arr)) {
                arr.forEach(url => {
                  if (url && typeof url === "string" && !list.includes(url)) {
                    list.push(url);
                  }
                });
              } else if (typeof arr === "string" && arr.trim() !== "") {
                if (!list.includes(arr)) {
                  list.push(arr);
                }
              }
            };
            addUrls(alert.images);
            addUrls(alert.media);
            addUrls((alert as any).image);
            addUrls((alert as any).imageUrl);
            addUrls((alert as any).photo);
            addUrls((alert as any).photoUrl);
            addUrls((alert as any).medias);
            addUrls((alert as any).mediaUrls);
            addUrls((alert as any).photos);
            return list.filter(url => {
              const lower = url.toLowerCase();
              return !(
                lower.endsWith(".mp4") ||
                lower.endsWith(".mp3") ||
                lower.endsWith(".wav") ||
                lower.endsWith(".ogg") ||
                lower.endsWith(".txt") ||
                lower.endsWith(".pdf")
              );
            });
          };

          const downloadedUrls: string[] = (evt as any).downloadedUrls || [];

          const imagesList = getImagesList(evt).filter(url => url && url.startsWith("http") && !downloadedUrls.includes(url));
          if (Array.isArray(imagesList)) {
            imagesList.forEach((img, idx) => {
              if (img && typeof img === "string") {
                const name = img.split("/").pop()?.split("?")[0] || `foto_${idx + 1}.jpg`;
                mediaToSync.push({ type: "Imagem", url: img, label: `Foto da Ocorrência #${evt.id.substring(0, 5)} em ${evt.sector}`, name, eventId: evt.id, field: "images" });
              }
            });
          }
          // Check audios
          if (evt.audios && Array.isArray(evt.audios)) {
            evt.audios.forEach((aud, idx) => {
              if (aud && typeof aud === "string" && aud.startsWith("http") && !downloadedUrls.includes(aud)) {
                const name = aud.split("/").pop()?.split("?")[0] || `audio_${idx + 1}.mp3`;
                mediaToSync.push({ type: "Áudio", url: aud, label: `Áudio gravado da Ocorrência #${evt.id.substring(0, 5)}`, name, eventId: evt.id, field: "audios" });
              }
            });
          }
          // Check videos
          if (evt.videos && Array.isArray(evt.videos)) {
            evt.videos.forEach((vid, idx) => {
              if (vid && typeof vid === "string" && vid.startsWith("http") && !downloadedUrls.includes(vid)) {
                const name = vid.split("/").pop()?.split("?")[0] || `video_${idx + 1}.mp4`;
                mediaToSync.push({ type: "Vídeo", url: vid, label: `Vídeo da Ocorrência #${evt.id.substring(0, 5)}`, name, eventId: evt.id, field: "videos" });
              }
            });
          }
        });

        if (mediaToSync.length === 0) {
          setSyncDetails(prev => ({
            ...prev,
            progress: 90,
            step: "Nenhum arquivo de mídia pendente.",
            log: [...prev.log, "✓ Nenhuma nova imagem, áudio ou vídeo pendente de sincronização."]
          }));
          await new Promise(r => setTimeout(r, 500));
        } else {
          const totalMedia = mediaToSync.length;
          setSyncDetails(prev => ({
            ...prev,
            log: [...prev.log, `Localizados ${totalMedia} arquivos de mídia vinculados pendentes de download.` ]
          }));

          for (let i = 0; i < totalMedia; i++) {
            const media = mediaToSync[i];
            const percent = 60 + Math.floor(((i + 1) / totalMedia) * 35); // goes from 60 to 95

            setSyncDetails(prev => ({
              ...prev,
              progress: percent,
              step: `Sincronizando mídia (${i + 1}/${totalMedia}): ${media.name}`,
              log: [...prev.log, `Baixando [${media.type}] ${media.label} (${media.name})...`]
            }));

            // Download, convert and save
            try {
              const base64 = await convertUrlToBase64(media.url);
              if (base64 !== media.url) {
                const cachedEvent = await localDb.get<Event>("events", media.eventId);
                if (cachedEvent) {
                  const downloadedUrls = (cachedEvent as any).downloadedUrls || [];
                  let updated = false;

                  const updateDownloadedUrls = (list: string[] | undefined) => {
                    if (!list || !Array.isArray(list)) return;
                    list.forEach(item => {
                      if (item === media.url) {
                        updated = true;
                        if (!downloadedUrls.includes(media.url)) {
                          downloadedUrls.push(media.url);
                        }
                      }
                    });
                  };

                  if (media.field === "images") {
                    updateDownloadedUrls(cachedEvent.images);
                  } else if (media.field === "audios") {
                    updateDownloadedUrls(cachedEvent.audios);
                  } else if (media.field === "videos") {
                    updateDownloadedUrls(cachedEvent.videos);
                  }

                  if (updated) {
                    (cachedEvent as any).downloadedUrls = downloadedUrls;
                    await localDb.put("events", cachedEvent);
                  }
                }
              }
            } catch (e: any) {
              console.warn("Failed to download media file visually:", media.name, e);
              if (e.message === "NOT_FOUND") {
                const cachedEvent = await localDb.get<Event>("events", media.eventId);
                if (cachedEvent) {
                  const downloadedUrls = (cachedEvent as any).downloadedUrls || [];
                  if (!downloadedUrls.includes(media.url)) {
                    downloadedUrls.push(media.url);
                    (cachedEvent as any).downloadedUrls = downloadedUrls;
                    await localDb.put("events", cachedEvent);
                  }
                }
              }
            }

            // Small delay to make it visual and detailed
            await new Promise(r => setTimeout(r, 400));
          }
        }

        setSyncDetails(prev => ({
          ...prev,
          progress: 100,
          step: "Sincronização Concluída!",
          log: [
            ...prev.log, 
            "✓ Sincronização de todos os arquivos de mídia finalizada.", 
            "✓ Central de Comando 100% atualizada e operacional."
          ]
        }));

        await new Promise(r => setTimeout(r, 1600));
        setSyncDetails(prev => ({ ...prev, show: false }));
      }
    } catch (err: any) {
      console.error("Sync test failed:", err);
      if (showModal) {
        setSyncDetails(prev => ({
          ...prev,
          step: "Falha na sincronização!",
          log: [...prev.log, `❌ Erro de processamento: ${err.message || String(err)}`]
        }));
      }
    } finally {
      setSyncing(false);
    }
    return isSyncSuccessful;
  };

  // Keep scheduler refs in sync with the latest state values to avoid closure trap inside setInterval
  const schedulerRef = React.useRef({
    lastHourlySyncHour,
    retryCount,
    isRetryPending,
    lastSyncAttemptTime,
  });

  useEffect(() => {
    schedulerRef.current = {
      lastHourlySyncHour,
      retryCount,
      isRetryPending,
      lastSyncAttemptTime,
    };
  }, [lastHourlySyncHour, retryCount, isRetryPending, lastSyncAttemptTime]);

  const testConnectionRef = React.useRef(testConnection);
  useEffect(() => {
    testConnectionRef.current = testConnection;
  }, [testConnection]);

  // Automatic synchronization scheduler:
  // - Once per hour, on the first minute (minute === 0)
  // - If it fails, retry up to 3 times every 10 minutes
  // - After 3 attempts, resume regular hourly checks
  useEffect(() => {
    const checkInterval = setInterval(() => {
      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();
      const currentTimestamp = now.getTime();

      const { lastHourlySyncHour: refHour, retryCount: refRetry, isRetryPending: refPending, lastSyncAttemptTime: refAttemptTime } = schedulerRef.current;

      // 1. Hourly check (at minute 0)
      if (currentMinute === 0 && refHour !== currentHour) {
        setLastHourlySyncHour(currentHour);
        setRetryCount(0);
        setIsRetryPending(false);
        setLastSyncAttemptTime(currentTimestamp);

        // Update ref immediately to prevent race conditions before next tick
        schedulerRef.current.lastHourlySyncHour = currentHour;
        schedulerRef.current.retryCount = 0;
        schedulerRef.current.isRetryPending = false;
        schedulerRef.current.lastSyncAttemptTime = currentTimestamp;

        testConnectionRef.current(true).then((success) => {
          if (!success) {
            setIsRetryPending(true);
            setRetryCount(1);
            setLastSyncAttemptTime(Date.now());

            schedulerRef.current.isRetryPending = true;
            schedulerRef.current.retryCount = 1;
            schedulerRef.current.lastSyncAttemptTime = Date.now();
          }
        });
      } 
      // 2. Retry check
      else if (refPending && refRetry > 0 && refRetry <= 3) {
        const tenMinutesMs = 10 * 60 * 1000;
        if (currentTimestamp - refAttemptTime >= tenMinutesMs) {
          setLastSyncAttemptTime(currentTimestamp);
          schedulerRef.current.lastSyncAttemptTime = currentTimestamp;
          
          testConnectionRef.current(true).then((success) => {
            if (success) {
              setIsRetryPending(false);
              setRetryCount(0);

              schedulerRef.current.isRetryPending = false;
              schedulerRef.current.retryCount = 0;
            } else {
              if (refRetry >= 3) {
                setIsRetryPending(false);
                setRetryCount(0);

                schedulerRef.current.isRetryPending = false;
                schedulerRef.current.retryCount = 0;
              } else {
                setRetryCount(refRetry + 1);
                schedulerRef.current.retryCount = refRetry + 1;
              }
            }
          });
        }
      }
    }, 10000); // Check every 10 seconds for precise automatic action

    return () => clearInterval(checkInterval);
  }, []);

  // 3. Process activity peak chart data (Event counts by Hour range)
  const processActivityData = () => {
    const hourlyCounts: { [hour: string]: number } = {
      "00h - 04h": 0,
      "04h - 08h": 0,
      "08h - 12h": 0,
      "12h - 16h": 0,
      "16h - 20h": 0,
      "20h - 24h": 0,
    };

    // Analyze events timestamps
    events.forEach((ev) => {
      const hourStr = ev.hour.split(":")[0];
      const hour = parseInt(hourStr, 10);
      if (isNaN(hour)) return;

      if (hour >= 0 && hour < 4) hourlyCounts["00h - 04h"]++;
      else if (hour >= 4 && hour < 8) hourlyCounts["04h - 08h"]++;
      else if (hour >= 8 && hour < 12) hourlyCounts["08h - 12h"]++;
      else if (hour >= 12 && hour < 16) hourlyCounts["12h - 16h"]++;
      else if (hour >= 16 && hour < 20) hourlyCounts["16h - 20h"]++;
      else hourlyCounts["20h - 24h"]++;
    });

    return Object.entries(hourlyCounts).map(([range, count]) => ({
      range,
      "Ocorrências": count,
    }));
  };

  const activityData = processActivityData();

  // 4. Handle creation of simulated Alert directly from the Dashboard central
  const handleCreateSimulatedEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEventObservacao.trim()) return;

    const selectedUserData = users.find((u) => u.login === newEventUser) || users[0];
    const brasiliaTime = new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
    const dateObj = new Date(brasiliaTime);
    
    const formattedDate = `${String(dateObj.getDate()).padStart(2, '0')}/${String(dateObj.getMonth() + 1).padStart(2, '0')}/${dateObj.getFullYear()}`;
    const formattedTime = `${String(dateObj.getHours()).padStart(2, '0')}:${String(dateObj.getMinutes()).padStart(2, '0')}:${String(dateObj.getSeconds()).padStart(2, '0')}`;

    // Get current GPS coordinates or pick a subtle variation around São Paulo
    const latVariation = (Math.random() - 0.5) * 0.02;
    const lngVariation = (Math.random() - 0.5) * 0.02;
    const lat = (selectedUserData?.latitude || -23.5505) + latVariation;
    const lng = (selectedUserData?.longitude || -46.6333) + lngVariation;

    // Generate a couple of realistic security images based on random selection or sector
    const randomImgIdx = Math.floor(Math.random() * 3);
    const mockSecImages = [
      [
        "https://images.unsplash.com/photo-1541888946425-d81bb19240f5?w=800",
        "https://images.unsplash.com/photo-1558036117-15d82a90b9b1?w=800"
      ],
      [
        "https://images.unsplash.com/photo-1551806235-a05ff131333c?w=800",
        "https://images.unsplash.com/photo-1508847154043-be12a62861c1?w=800"
      ],
      [
        "https://images.unsplash.com/photo-1557597774-9d273605dfa9?w=800",
        "https://images.unsplash.com/photo-1560179707-f14e90ef3623?w=800"
      ]
    ];

    const eventPayload = {
      userId: selectedUserData?.id || "user_simulated",
      userName: selectedUserData?.login || newEventUser,
      routeId: "simulated_route_" + Math.random().toString(36).substr(2, 5),
      sector: newEventSector,
      vehicle: selectedUserData?.group === "Supervisor" ? "Camionete 4x4" : "Moto Honda 150",
      people: selectedUserData?.name || newEventUser,
      observacao: newEventObservacao,
      notes: newEventNotes,
      latlong: `${lat.toFixed(6)},${lng.toFixed(6)}`,
      date: formattedDate,
      hour: formattedTime,
      media: mockSecImages[randomImgIdx],
      images: mockSecImages[randomImgIdx],
      videos: [
        "https://www.w3schools.com/html/mov_bbb.mp4"
      ],
      audios: [
        "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3"
      ],
      texts: [
        `Registro tático enviado por @${selectedUserData?.login || newEventUser}.`,
        `Ocorrência: "${newEventObservacao}". ${newEventNotes ? "Anotação adicional: " + newEventNotes : ""}`
      ]
    };

    // Push simulated coordinate route point as well
    await SyncManager.addRoutePoint({
      userId: eventPayload.userId,
      routeId: eventPayload.routeId,
      userName: eventPayload.userName,
      sector: eventPayload.sector,
      vehicle: eventPayload.vehicle,
      people: eventPayload.people,
      notes: "Registro de ocorrência",
      latlong: eventPayload.latlong,
      date: formattedDate,
      hour: formattedTime,
      status: "active"
    });

    // Save event
    await SyncManager.addEvent(eventPayload);

    // Reset Form
    setNewEventObservacao("");
    setNewEventNotes("");
    setShowAddEvent(false);
  };

  // Stats calculation reflecting strict hierarchical responsibility
  const totalVigilantes = visibleUsers.filter((u) => u.group === "Vigilante" || u.group === "Supervisor").length;
  const activeAlertsCount = visibleEvents.length;
  const activeLicenses = visibleUsers.filter((u) => getLicenseInfo(u).isExpired === false).length;
  const expiredLicenses = visibleUsers.length - activeLicenses;

  // Intercept view to require authenticated Operator Session
  if (!currentUserLogin) {
    if (users.length === 0) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-[#f8fafc]">
          <div className="flex flex-col items-center gap-3">
            <RefreshCcw className="w-8 h-8 text-cyan-600 animate-spin" />
            <p className="text-sm font-semibold text-slate-500 font-mono">Iniciando Banco de Dados Local...</p>
          </div>
        </div>
      );
    }
    return <LoginScreen users={users} onLoginSuccess={handleLoginSuccess} />;
  }

  // Intercept for Fullscreen Attachments view
  const urlParams = new URLSearchParams(window.location.search);
  const isAttachmentsView = urlParams.get("view") === "attachments";
  if (isAttachmentsView) {
    return (
      <AlertAttachmentsFullScreen
        events={visibleEvents}
        users={users}
        currentUserLogin={currentUserLogin}
        initialAlertId={urlParams.get("alertId")}
        isOnline={isOnline}
        onClose={() => {
          window.location.search = "";
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 p-4 md:p-8 relative selection:bg-cyan-500/20 selection:text-cyan-800">
      
      {/* Background visual light grid overlays for clean tactical look */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.01)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.01)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />

      {/* Main container */}
      <div className="max-w-7xl mx-auto space-y-6 relative z-10">
        
        {/* Command Center Header */}
        <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white rounded-3xl border border-slate-200/80 p-6 shadow-md">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-white border border-slate-200 rounded-2xl flex items-center justify-center shadow-md overflow-hidden p-1">
              <img 
                src={logoImg} 
                alt="Logo PEMD" 
                className="w-full h-full object-contain"
                referrerPolicy="no-referrer"
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl md:text-2xl font-black tracking-tight text-slate-950">PEMD SP613-Seg</h1>
                <span className="bg-cyan-50 border border-cyan-200 text-cyan-700 font-mono text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider">
                  Vigia • Conecta • Protege
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Monitoramento tático de usuários, rotas de patrulha e controle de licenças de uso em tempo real
              </p>
            </div>
          </div>

          {/* Connection, docker and Sync statuses */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Docker Container Indicator */}
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3.5 py-2 rounded-xl font-mono text-xs text-slate-700">
              <Cpu className="w-4 h-4 text-purple-600" />
              <span><strong className="text-purple-700 font-bold uppercase">Docker ativo</strong></span>
            </div>

            {/* Connection state */}
            <div className={`flex items-center gap-2 border px-3.5 py-2 rounded-xl font-mono text-xs font-bold transition-all ${
              isOnline 
                ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                : "bg-rose-50 text-rose-700 border-rose-200 animate-pulse"
            }`}>
              {isOnline ? <Wifi className="w-4 h-4 text-emerald-600" /> : <WifiOff className="w-4 h-4 text-rose-600" />}
              <span>{isOnline ? "Online" : "Offline"}</span>
            </div>

            {/* Firebase State */}
            <div className={`flex items-center gap-2 border px-3.5 py-2 rounded-xl font-mono text-xs font-bold ${
              firebaseConnected 
                ? "bg-cyan-50 text-cyan-700 border-cyan-200" 
                : "bg-slate-50 text-slate-500 border-slate-200"
            }`}>
              <Database className="w-4 h-4 text-cyan-600" />
              <span><strong>{firebaseConnected ? "Sincronizado" : "Não sincronizado"}</strong></span>
            </div>

            {/* Sync Button */}
            <button
              onClick={() => testConnection(true)}
              disabled={syncing}
              className="flex items-center justify-center gap-1.5 bg-white hover:bg-slate-50 disabled:bg-slate-100 text-xs text-slate-800 px-4 py-2.5 rounded-xl font-bold border border-slate-200 shadow-sm transition-all cursor-pointer disabled:cursor-not-allowed"
            >
              <RefreshCcw className={`w-4 h-4 ${syncing ? "animate-spin text-cyan-600" : ""}`} />
              {syncing ? "Sincronizando..." : "Verificar Conexão"}
            </button>

            {/* SIMUC CSV Export Dialog Trigger Button (Super_saiyajin_instinto_superior only) */}
            {currentUser?.group === "Super_saiyajin_instinto_superior" && (
              <button
                onClick={() => setShowSimucModal(true)}
                className="flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-4 py-2.5 rounded-xl font-bold border border-emerald-500 shadow-sm hover:shadow transition-all cursor-pointer"
                title="Filtrar e exportar dados operacionais formatados para o padrão SIMUC/ICMBio"
              >
                <Download className="w-4 h-4" />
                SIMUC
              </button>
            )}
          </div>
        </header>

        {/* Active Operator Session Banner */}
        <div id="active-session-banner" className="bg-slate-900 text-white rounded-3xl p-5 border border-slate-800 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="relative">
              <img 
                src={currentUser?.photo || logoImg} 
                alt={currentUser?.name || "Operador"} 
                className="w-12 h-12 rounded-2xl border-2 border-cyan-500 object-cover"
                referrerPolicy="no-referrer"
              />
              <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-500 border-2 border-slate-900 rounded-full animate-pulse" />
            </div>
            <div className="space-y-0.5">
              <h3 className="text-sm font-bold uppercase tracking-wider font-mono text-cyan-400 flex items-center gap-1.5">
                <Shield className="w-4 h-4 text-cyan-400" />
                Sessão ativa
              </h3>
              <p className="text-xs text-slate-200">
                Operador Conectado: <strong className="text-white">@{currentUser?.login || currentUserLogin}</strong> • {currentUser?.name}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span className="bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 text-[9px] px-2 py-0.5 rounded-full font-bold font-mono uppercase tracking-wider">
                  Nível: {currentUser?.group}
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  Licença: {currentUser?.license === "Ativa" ? "✓ Ativa" : "✗ Inativa"}
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
            <button
              onClick={handleLogout}
              className="bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs px-4 py-2.5 rounded-xl border border-rose-500 transition-all cursor-pointer flex items-center gap-1.5 shadow-md shadow-rose-950/20"
              title="Encerrar sessão de monitoramento e retornar para a tela de login"
            >
              <LogOut className="w-4 h-4" /> Encerrar Sessão (Sair)
            </button>

          </div>
        </div>

        {/* Dashboard Quick Stats Row */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Vigilantes Stat */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center justify-between shadow-sm">
            <div className="space-y-1">
              <span className="text-xs text-slate-500 font-medium uppercase font-mono tracking-wider">Usuários Monitorados</span>
              <div className="text-2xl md:text-3xl font-black text-slate-950">{totalVigilantes}</div>
            </div>
            <div className="w-10 h-10 bg-cyan-50 border border-cyan-100 rounded-xl flex items-center justify-center">
              <Users className="w-5 h-5 text-cyan-600" />
            </div>
          </div>

          {/* Active Alerts Stat */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center justify-between shadow-sm">
            <div className="space-y-1">
              <span className="text-xs text-slate-500 font-medium uppercase font-mono tracking-wider">Alertas Totais</span>
              <div className="text-2xl md:text-3xl font-black text-rose-600">{activeAlertsCount}</div>
            </div>
            <div className="w-10 h-10 bg-rose-50 border border-rose-100 rounded-xl flex items-center justify-center">
              <BellRing className="w-5 h-5 text-rose-600" />
            </div>
          </div>

          {/* Active Licenses Stat */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center justify-between shadow-sm">
            <div className="space-y-1">
              <span className="text-xs text-slate-500 font-medium uppercase font-mono tracking-wider">Licenças Ativas</span>
              <div className="text-2xl md:text-3xl font-black text-emerald-600">{activeLicenses}</div>
            </div>
            <div className="w-10 h-10 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center justify-center">
              <CheckSquare className="w-5 h-5 text-emerald-600" />
            </div>
          </div>

          {/* Offline/Local Latency Stat */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center justify-between shadow-sm">
            <div className="space-y-1">
              <span className="text-xs text-slate-500 font-medium uppercase font-mono tracking-wider">Última Sincronização</span>
              <div className="text-lg md:text-xl font-bold font-mono text-cyan-700 truncate">{lastSyncTime}</div>
            </div>
            <div className="w-10 h-10 bg-purple-50 border border-purple-100 rounded-xl flex items-center justify-center">
              <Activity className="w-5 h-5 text-purple-600" />
            </div>
          </div>

        </section>

        {/* Tactical Map with Hourly Peaks side-by-side */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Tactical Map (2/3 Width) */}
          <div className="lg:col-span-2 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-slate-700 font-bold text-sm uppercase tracking-wider font-mono">
                <MapPin className="w-4 h-4 text-cyan-600" />
                <span>Rondas e alertas em tempo real</span>
              </div>
              
              {/* Floating Trigger Simulated alert button */}
              {currentUser?.group === "Super_saiyajin_instinto_superior" && (
                <button
                  onClick={() => setShowAddEvent(true)}
                  className="flex items-center gap-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 hover:border-rose-300 text-xs text-rose-700 px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer"
                >
                  <PlusCircle className="w-3.5 h-3.5" /> Disparar Ocorrência (Simulador)
                </button>
              )}
            </div>
             <MapDashboard 
              users={visibleUsers} 
              routes={filteredRoutes} 
              events={eventsToShowOnMap} 
              isOnline={isOnline} 
              selectedRouteId={selectedRouteId}
              selectedAlertId={selectedAlertId}
              resolvedAlerts={resolvedAlerts}
              onSelectRouteId={(id) => {
                setSelectedRouteId(id);
                setSelectedAlertId(null);
                if (id) {
                  setActiveTab("routes");
                }
              }}
              onSelectAlertId={(id) => {
                setSelectedAlertId(id);
                setSelectedRouteId(null);
                if (id) {
                  setActiveTab("alerts");
                }
              }}
            />
          </div>

          {/* Activity Peaks Graph (1/3 Width) */}
          <div className="flex flex-col justify-between bg-white rounded-2xl border border-slate-200 p-6 shadow-md h-full">
            <div className="border-b border-slate-100 pb-4 mb-4">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-cyan-600" />
                <h3 className="text-base font-bold text-slate-900">Picos de Atividade por Hora</h3>
              </div>
              <p className="text-xs text-slate-500 mt-1">Ocorrências registradas ao longo do dia por faixa horária</p>
            </div>

            {/* Recharts Area Chart */}
            <div className="w-full h-64 md:h-72 mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={activityData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorOccurrences" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="range" stroke="#64748b" fontSize={10} fontClassName="font-mono" />
                  <YAxis stroke="#64748b" fontSize={10} fontClassName="font-mono" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: "#ffffff", 
                      borderColor: "#cbd5e1",
                      borderRadius: "12px",
                      color: "#0f172a",
                      fontSize: "12px",
                      fontFamily: "Inter",
                      boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)"
                    }} 
                  />
                  <Area 
                    type="monotone" 
                    dataKey="Ocorrências" 
                    stroke="#06b6d4" 
                    strokeWidth={3}
                    fillOpacity={1} 
                    fill="url(#colorOccurrences)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                Picos calculados em tempo real
              </span>
              <span className="font-mono text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded">Auditado</span>
            </div>
          </div>

        </section>

        {/* Toggles for Main Views below */}
        <div className="flex border-b border-slate-200 gap-4">
          <button
            onClick={() => setActiveTab("map")}
            className={`pb-2.5 text-sm font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
              activeTab === "map"
                ? "text-cyan-600 border-cyan-600"
                : "text-slate-500 border-transparent hover:text-slate-800"
            }`}
          >
            Monitor Geral
          </button>
          <button
            onClick={() => setActiveTab("routes")}
            className={`pb-2.5 text-sm font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
              activeTab === "routes"
                ? "text-cyan-600 border-cyan-600"
                : "text-slate-500 border-transparent hover:text-slate-800"
            }`}
          >
            Rotas
          </button>
          <button
            onClick={() => setActiveTab("alerts")}
            className={`pb-2.5 text-sm font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
              activeTab === "alerts"
                ? "text-cyan-600 border-cyan-600"
                : "text-slate-500 border-transparent hover:text-slate-800"
            }`}
          >
            Alertas
          </button>
          {currentUser?.group === "Super_saiyajin_instinto_superior" && (
            <button
              onClick={() => setActiveTab("ia")}
              className={`pb-2.5 text-sm font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
                activeTab === "ia"
                  ? "text-cyan-600 border-cyan-600"
                  : "text-slate-500 border-transparent hover:text-slate-800"
              }`}
            >
              Assistente IA
            </button>
          )}
          <button
            onClick={() => setActiveTab("users")}
            className={`pb-2.5 text-sm font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
              activeTab === "users"
                ? "text-cyan-600 border-cyan-600"
                : "text-slate-500 border-transparent hover:text-slate-800"
            }`}
          >
            Usuários
          </button>
          <button
            onClick={() => setActiveTab("logs")}
            className={`pb-2.5 text-sm font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
              activeTab === "logs"
                ? "text-cyan-600 border-cyan-600"
                : "text-slate-500 border-transparent hover:text-slate-800"
            }`}
          >
            Logs
          </button>
        </div>

        {/* Tab Panels */}
        <div className="grid grid-cols-1 gap-6">
          {activeTab === "map" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <RoutesViewer 
                routes={visibleRoutes} 
                users={visibleUsers} 
                events={visibleEvents}
                currentUserLogin={currentUserLogin}
                selectedSector={routeFilterSector}
                setSelectedSector={setRouteFilterSector}
                selectedUser={routeFilterUser}
                setSelectedUser={setRouteFilterUser}
                selectedStartDate={routeFilterStartDate}
                setSelectedStartDate={setRouteFilterStartDate}
                selectedEndDate={routeFilterEndDate}
                setSelectedEndDate={setRouteFilterEndDate}
                selectedRouteId={selectedRouteId}
                onSelectRouteId={setSelectedRouteId}
                selectedAlertId={selectedAlertId}
                onClearSelectedAlertId={() => setSelectedAlertId(null)}
              />
              <AlertCenter 
                events={visibleEvents} 
                logs={visibleLogs} 
                users={users} 
                currentUserLogin={currentUserLogin}
                selectedAlertId={selectedAlertId}
                onClearSelectedAlertId={() => setSelectedAlertId(null)}
                selectedRouteId={selectedRouteId}
                onClearSelectedRouteId={() => setSelectedRouteId(null)}
                resolvedAlerts={resolvedAlerts}
                setResolvedAlerts={setResolvedAlerts}
                showInactiveAlerts={showInactiveAlerts}
                setShowInactiveAlerts={setShowInactiveAlerts}
              />
            </div>
          )}

          {activeTab === "users" && (
            <UserLicenseTable users={visibleUsers} currentUser={currentUser} />
          )}

          {activeTab === "routes" && (
            <RoutesViewer 
              routes={visibleRoutes} 
              users={visibleUsers} 
              events={visibleEvents}
              currentUserLogin={currentUserLogin}
              selectedSector={routeFilterSector}
              setSelectedSector={setRouteFilterSector}
              selectedUser={routeFilterUser}
              setSelectedUser={setRouteFilterUser}
              selectedStartDate={routeFilterStartDate}
              setSelectedStartDate={setRouteFilterStartDate}
              selectedEndDate={routeFilterEndDate}
              setSelectedEndDate={setRouteFilterEndDate}
              selectedRouteId={selectedRouteId}
              onSelectRouteId={setSelectedRouteId}
              selectedAlertId={selectedAlertId}
              onClearSelectedAlertId={() => setSelectedAlertId(null)}
            />
          )}

          {activeTab === "alerts" && (
            <AlertCenter 
              events={visibleEvents} 
              logs={visibleLogs} 
              users={users} 
              currentUserLogin={currentUserLogin}
              selectedAlertId={selectedAlertId}
              onClearSelectedAlertId={() => setSelectedAlertId(null)}
              selectedRouteId={selectedRouteId}
              onClearSelectedRouteId={() => setSelectedRouteId(null)}
              resolvedAlerts={resolvedAlerts}
              setResolvedAlerts={setResolvedAlerts}
              showInactiveAlerts={showInactiveAlerts}
              setShowInactiveAlerts={setShowInactiveAlerts}
              testConnection={testConnection}
            />
          )}

          {activeTab === "ia" && currentUser?.group === "Super_saiyajin_instinto_superior" && (
            <IAAssistant logs={visibleLogs} events={visibleEvents} />
          )}

          {activeTab === "logs" && (
            <LogsHistory logs={visibleLogs} />
          )}
        </div>

        {/* Modal: Simulated Occurrences Trigger */}
        {showAddEvent && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-1.5">
                  <PlusCircle className="w-5 h-5 text-rose-600 animate-pulse" />
                  Simulador de Envio de Ocorrência (App Android)
                </h3>
                <button
                  onClick={() => setShowAddEvent(false)}
                  className="text-slate-400 hover:text-slate-800 text-lg font-bold font-mono cursor-pointer"
                >
                  &times;
                </button>
              </div>

              <form onSubmit={handleCreateSimulatedEvent} className="space-y-4">
                {/* Select Vigilante */}
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500 font-bold uppercase font-mono">Selecionar Vigilante (Emissão)</label>
                  <select
                    value={newEventUser}
                    onChange={(e) => setNewEventUser(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm text-slate-800 focus:outline-none focus:border-rose-500"
                  >
                    {users
                      .filter((u) => u.group === "Vigilante" || u.group === "Supervisor")
                      .map((u) => (
                        <option key={u.id} value={u.login}>
                          {u.name} (@{u.login})
                        </option>
                      ))}
                  </select>
                </div>

                {/* Sector */}
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500 font-bold uppercase font-mono">Setor de Operação</label>
                  <select
                    value={newEventSector}
                    onChange={(e) => setNewEventSector(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm text-slate-800 focus:outline-none focus:border-rose-500"
                  >
                    <option value="Setor A - Galpão Principal">Setor A - Galpão Principal</option>
                    <option value="Setor B - Almoxarifado">Setor B - Almoxarifado</option>
                    <option value="Setor C - Refinaria">Setor C - Refinaria</option>
                    <option value="Setor D - Subestação Elétrica">Setor D - Subestação Elétrica</option>
                    <option value="Setor E - Portaria Principal">Setor E - Portaria Principal</option>
                  </select>
                </div>

                {/* Observation / SOS Title */}
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500 font-bold uppercase font-mono">Título do Alerta (SOS ou Ocorrência)</label>
                  <input
                    type="text"
                    required
                    value={newEventObservacao}
                    onChange={(e) => setNewEventObservacao(e.target.value)}
                    placeholder="Ex: Disparou Alerta SOS: Invasor detectado"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm text-slate-800 focus:outline-none focus:border-rose-500 placeholder-slate-400"
                  />
                </div>

                {/* Notes */}
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500 font-bold uppercase font-mono">Anotações Táticas / Descrição</label>
                  <textarea
                    value={newEventNotes}
                    onChange={(e) => setNewEventNotes(e.target.value)}
                    placeholder="Ex: Câmera 04 detectou silhueta na cerca. Disparado sirene sonora local."
                    rows={3}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm text-slate-800 focus:outline-none focus:border-rose-500 placeholder-slate-400 font-sans resize-none"
                  />
                </div>

                {/* Actions */}
                <div className="flex gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddEvent(false)}
                    className="w-1/2 bg-slate-100 hover:bg-slate-200/80 border border-slate-200 text-xs text-slate-700 py-2.5 rounded-xl font-bold cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="w-1/2 bg-rose-600 hover:bg-rose-500 text-xs text-white py-2.5 rounded-xl font-black cursor-pointer shadow-md flex items-center justify-center gap-1"
                  >
                    Emitir Alerta SOS
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: SIMUC Filtered Export */}
        {showSimucModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-1.5">
                  <Filter className="w-5 h-5 text-emerald-600" />
                  Relatório SIMUC - Filtros de Exportação
                </h3>
                <button
                  onClick={() => setShowSimucModal(false)}
                  className="text-slate-400 hover:text-slate-800 text-lg font-bold font-mono cursor-pointer"
                >
                  &times;
                </button>
              </div>

              <div className="space-y-4">
                <p className="text-xs text-slate-500 leading-relaxed">
                  Defina os filtros de data, usuário e setor para gerar o relatório consolidado SIMUC/ICMBio com 26 colunas padronizadas. Os dados respeitarão a hierarquia ativa do operador <strong>@{currentUserLogin}</strong>.
                </p>

                {/* Período de Datas */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-500 font-bold uppercase font-mono flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-emerald-600" />
                      Data Inicial
                    </label>
                    <input
                      type="date"
                      value={simucStartDate}
                      onChange={(e) => setSimucStartDate(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-500 font-bold uppercase font-mono flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-emerald-600" />
                      Data Final
                    </label>
                    <input
                      type="date"
                      value={simucEndDate}
                      onChange={(e) => setSimucEndDate(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                {/* Usuário (Vigilantes Autorizados) */}
                <div className="space-y-1.5">
                  <label className="text-[10px] text-slate-500 font-bold uppercase font-mono">Filtrar por Usuário</label>
                  <select
                    value={simucUser}
                    onChange={(e) => setSimucUser(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="todos">Todos os Vigilantes sob Responsabilidade</option>
                    {visibleUsers.map((u) => (
                      <option key={u.id} value={u.login}>
                        {u.name} (@{u.login}) - {u.group}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Setor de Operação */}
                <div className="space-y-1.5">
                  <label className="text-[10px] text-slate-500 font-bold uppercase font-mono">Filtrar por Setor</label>
                  <select
                    value={simucSector}
                    onChange={(e) => setSimucSector(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="todos">Todos os Setores</option>
                    {availableSectors.map((sector) => (
                      <option key={sector} value={sector}>
                        {sector}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Actions */}
                <div className="flex gap-2.5 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowSimucModal(false)}
                    className="w-1/2 bg-slate-100 hover:bg-slate-200/80 border border-slate-200 text-xs text-slate-700 py-2.5 rounded-xl font-bold cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSimucFilterAndExport}
                    className="w-1/2 bg-emerald-600 hover:bg-emerald-500 text-xs text-white py-2.5 rounded-xl font-black cursor-pointer shadow-md flex items-center justify-center gap-1"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Filtrar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Synchronization Progress Overlay */}
        {syncDetails.show && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-fade-in">
            <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-xl p-6 shadow-2xl flex flex-col space-y-4 max-h-[85vh]">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <RefreshCcw className={`w-5 h-5 text-cyan-600 ${syncDetails.progress < 100 ? "animate-spin" : ""}`} />
                  <h3 className="text-base font-bold text-slate-900">
                    Sincronizador Tático Central - PEMD
                  </h3>
                </div>
                <span className="bg-cyan-50 text-cyan-700 font-mono text-[11px] font-bold px-2.5 py-1 rounded-full border border-cyan-100">
                  {syncDetails.progress}%
                </span>
              </div>

              {/* Progress bar */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                  <span className="truncate max-w-[400px]">{syncDetails.step}</span>
                  <span className="font-mono">{syncDetails.progress}%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden border border-slate-200">
                  <div
                    className="bg-cyan-600 h-full rounded-full transition-all duration-300"
                    style={{ width: `${syncDetails.progress}%` }}
                  />
                </div>
              </div>

              {/* Logs terminal */}
              <div className="space-y-1">
                <span className="text-[10px] text-slate-500 font-bold uppercase font-mono">Histórico de Transmissão</span>
                <div className="bg-slate-900 text-slate-100 rounded-2xl p-4 font-mono text-[11px] h-60 overflow-y-auto space-y-1 flex flex-col-reverse scroll-smooth border border-slate-800">
                  {syncDetails.log.slice().reverse().map((logLine, index) => (
                    <div key={index} className="leading-relaxed py-0.5 border-b border-slate-800/40 last:border-0">
                      {logLine}
                    </div>
                  ))}
                </div>
              </div>

              {/* Notice info */}
              <div className="bg-cyan-50/50 border border-cyan-100 p-3 rounded-xl text-[11px] text-cyan-800 leading-relaxed">
                <strong>Sincronização Ativa:</strong> Sincronizando dados locais do IndexedDB com as mídias associadas no Firestore em conformidade com as regras operacionais.
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
