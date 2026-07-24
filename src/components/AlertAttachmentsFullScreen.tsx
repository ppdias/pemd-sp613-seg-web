import React, { useState, useEffect } from "react";
import JSZip from "jszip";
import { localDb } from "../lib/db";
import { exportToSimucCSV } from "../utils/csvExporter";
import { Event, User } from "../types";
import { 
  TextFileDisplay, 
  parseDateString, 
  getAlertSearchableText, 
  evaluateBooleanQuery 
} from "./AlertCenter";
import { 
  ImageIcon, 
  Video as VideoIcon, 
  Mic as AudioIcon, 
  FileText as TextIcon, 
  ChevronLeft, 
  ChevronRight, 
  Search, 
  Filter, 
  Calendar, 
  User as UserIcon, 
  Compass, 
  AlertTriangle, 
  CheckCircle, 
  ShieldAlert,
  SlidersHorizontal,
  ExternalLink,
  Lock,
  ArrowLeft,
  Tv,
  Download
} from "lucide-react";
import logoImg from "../logoBeforeSplashScreen.png";

interface AlertAttachmentsFullScreenProps {
  events: Event[];
  users: User[];
  currentUserLogin: string;
  initialAlertId: string | null;
  onClose?: () => void;
  isOnline?: boolean;
}

export default function AlertAttachmentsFullScreen({
  events,
  users,
  currentUserLogin,
  initialAlertId,
  onClose,
  isOnline = true
}: AlertAttachmentsFullScreenProps) {
  // Filters
  const [sectorFilter, setSectorFilter] = useState<string>("todos");
  const [typeFilter, setTypeFilter] = useState<string>("todos");
  const [userFilter, setUserFilter] = useState<string>("todos");
  const [startDateFilter, setStartDateFilter] = useState<string>("");
  const [endDateFilter, setEndDateFilter] = useState<string>("");
  const [alertSearchTerm, setAlertSearchTerm] = useState<string>("");
  
  // Export States
  const [exportingZip, setExportingZip] = useState<boolean>(false);
  const [exportProgress, setExportProgress] = useState<string>("");
  
  // Navigation State
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [typedIndexValue, setTypedIndexValue] = useState<string>("1");

  // Unified Lightbox and group navigation state
  const [activeGroupType, setActiveGroupType] = useState<"images" | "videos" | null>(null);
  const [activeGroupIndex, setActiveGroupIndex] = useState<number>(0);
  const [fallbackUrls, setFallbackUrls] = useState<{ [url: string]: string }>({});

  const handleOpenImagesLightbox = (idx: number) => {
    setActiveGroupType("images");
    setActiveGroupIndex(idx);
  };

  const handleOpenVideosLightbox = (idx: number) => {
    setActiveGroupType("videos");
    setActiveGroupIndex(idx);
  };

  // Cross-tab logout synchronization & check
  useEffect(() => {
    const checkLogout = () => {
      const loggedUser = localStorage.getItem("pemd_logged_user");
      if (!loggedUser) {
        try {
          window.close();
        } catch (err) {
          console.warn("Could not close window automatically:", err);
        }
        window.location.reload();
      }
    };

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "pemd_logged_user" && !e.newValue) {
        checkLogout();
      }
    };

    window.addEventListener("storage", handleStorageChange);
    const interval = setInterval(checkLogout, 1500);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      clearInterval(interval);
    };
  }, []);

  // Derive unique sectors and users for filters
  const allSectors = Array.from(new Set(events.map((e) => e.sector).filter(Boolean)));
  const allUsers = Array.from(new Set(events.map((e) => e.userName || e.userId).filter(Boolean)));

  // Filter events matching the same logic as AlertCenter
  const filteredAlerts = events.filter((ev) => {
    const matchesSector = sectorFilter === "todos" || ev.sector === sectorFilter;
    const matchesType = typeFilter === "todos" || (typeFilter === "sos" ? ev.observacao.toLowerCase().includes("sos") : true);
    const matchesUser = userFilter === "todos" || ev.userName === userFilter || ev.userId === userFilter;
    
    // Date Period Filters
    let matchesStartDate = true;
    if (startDateFilter) {
      const startObj = parseDateString(startDateFilter);
      const evObj = parseDateString(ev.date);
      if (startObj && evObj) {
        startObj.setHours(0, 0, 0, 0);
        evObj.setHours(0, 0, 0, 0);
        if (evObj < startObj) {
          matchesStartDate = false;
        }
      }
    }

    let matchesEndDate = true;
    if (endDateFilter) {
      const endObj = parseDateString(endDateFilter);
      const evObj = parseDateString(ev.date);
      if (endObj && evObj) {
        endObj.setHours(0, 0, 0, 0);
        evObj.setHours(0, 0, 0, 0);
        if (evObj > endObj) {
          matchesEndDate = false;
        }
      }
    }

    // Boolean Search Filter
    if (alertSearchTerm.trim()) {
      const searchableText = getAlertSearchableText(ev, users);
      if (!evaluateBooleanQuery(searchableText, alertSearchTerm)) {
        return false;
      }
    }

    return matchesSector && matchesType && matchesUser && matchesStartDate && matchesEndDate;
  });

  // Locate the initial event if provided
  useEffect(() => {
    if (initialAlertId && events.length > 0) {
      const idx = filteredAlerts.findIndex(e => e.id === initialAlertId);
      if (idx !== -1) {
        setCurrentIndex(idx);
        setTypedIndexValue((idx + 1).toString());
      } else {
        // If not found in filtered list, let's reset filters to ensure it's visible
        const unfilteredIdx = events.findIndex(e => e.id === initialAlertId);
        if (unfilteredIdx !== -1) {
          setSectorFilter("todos");
          setTypeFilter("todos");
          setUserFilter("todos");
          setStartDateFilter("");
          setEndDateFilter("");
          setAlertSearchTerm("");
          
          // Let filtered list rebuild, handled in next tick or effect
        }
      }
    }
  }, [initialAlertId, events.length]);

  // Synchronize index if initialAlertId changes or is found
  useEffect(() => {
    if (initialAlertId) {
      const idx = filteredAlerts.findIndex(e => e.id === initialAlertId);
      if (idx !== -1) {
        setCurrentIndex(idx);
        setTypedIndexValue((idx + 1).toString());
      }
    }
  }, [sectorFilter, typeFilter, userFilter, startDateFilter, endDateFilter, alertSearchTerm]);

  // Reset index if current active index exceeds new filtered range
  useEffect(() => {
    if (filteredAlerts.length > 0) {
      if (currentIndex >= filteredAlerts.length) {
        setCurrentIndex(0);
        setTypedIndexValue("1");
      } else {
        setTypedIndexValue((currentIndex + 1).toString());
      }
    } else {
      setCurrentIndex(0);
      setTypedIndexValue("0");
    }
  }, [filteredAlerts.length]);

  const activeAlert = filteredAlerts[currentIndex] || null;

  // Local-first: Retrieve media entirely from IndexedDB data on activeAlert (merged during sync)
  const mediaLoading = false;

  const getImagesListCombined = (alert: Event) => {
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

  const getVideosListCombined = (alert: Event) => {
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
    addUrls(alert.videos);
    
    // Also extract video URLs from media
    const mediaUrls = alert.media || [];
    if (Array.isArray(mediaUrls)) {
      mediaUrls.forEach(url => {
        if (url && typeof url === "string" && (url.toLowerCase().endsWith(".mp4") || url.toLowerCase().includes("video"))) {
          if (!list.includes(url)) {
            list.push(url);
          }
        }
      });
    }

    return list;
  };

  const getAudiosListCombined = (alert: Event) => {
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
    addUrls(alert.audios);
    
    // Also extract audio URLs from media
    const mediaUrls = alert.media || [];
    if (Array.isArray(mediaUrls)) {
      mediaUrls.forEach(url => {
        if (url && typeof url === "string" && (url.toLowerCase().endsWith(".mp3") || url.toLowerCase().endsWith(".wav") || url.toLowerCase().endsWith(".ogg") || url.toLowerCase().includes("audio"))) {
          if (!list.includes(url)) {
            list.push(url);
          }
        }
      });
    }

    return list;
  };

  const getTextsListCombined = (alert: Event) => {
    const list: string[] = [];
    const addTexts = (arr: any) => {
      if (Array.isArray(arr)) {
        arr.forEach(text => {
          if (text && typeof text === "string" && !list.includes(text)) {
            list.push(text);
          }
        });
      } else if (typeof arr === "string" && arr.trim() !== "") {
        if (!list.includes(arr)) {
          list.push(arr);
        }
      }
    };
    addTexts(alert.texts);
    return list;
  };

  const dataURLtoBlob = (dataUrl: string): Blob | null => {
    try {
      const parts = dataUrl.split(",");
      if (parts.length < 2) return null;
      const header = parts[0];
      const base64Data = parts[1];
      
      const mimeMatch = header.match(/:(.*?);/);
      const mime = mimeMatch ? mimeMatch[1] : "image/jpeg";
      
      const binaryStr = atob(base64Data);
      const len = binaryStr.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      return new Blob([bytes], { type: mime });
    } catch (error) {
      console.error("dataURLtoBlob error:", error);
      return null;
    }
  };

  const fetchFileBlob = async (url: string): Promise<Blob | null> => {
    try {
      if (!url) return null;

      // 1. Check local IndexedDB attachments cache first!
      try {
        await localDb.init();
        const cached = await localDb.get<{ url: string; blob: Blob }>("attachments", url);
        if (cached && cached.blob instanceof Blob) {
          console.log(`[ZIP Export] Retrieved cached attachment directly from IndexedDB: ${url}`);
          return cached.blob;
        }
      } catch (err) {
        console.warn("IndexedDB cache read failed in fetchFileBlob:", err);
      }

      // 2. Fallbacks if not found locally (only for client-only/local resource types)
      if (url.startsWith("data:")) {
        const blob = dataURLtoBlob(url);
        if (blob) return blob;
      }
      if (url.startsWith("blob:") || url.startsWith("content:")) {
        const response = await fetch(url);
        return await response.blob();
      } else if (url.startsWith("http://") || url.startsWith("https://")) {
        // As per requirements: "Depois da sincronização, no momento da exportação dos anexos dos alertas, o dashboard não deve mais acessar o Firebase para fazer download de nenhum arquivo, mas deve ir buscar apenas no banco de dados local"
        console.warn(`[ZIP Export] Attachment not found in IndexedDB local database: ${url}. Network download bypassed.`);
        return null;
      } else {
        // Treat as plain text content
        return new Blob([url], { type: "text/plain" });
      }
    } catch (error) {
      console.error("Failed to fetch file:", url, error);
      return null;
    }
  };

  const fetchAlertAttachments = async (alertObj: Event): Promise<{ name: string; url: string }[]> => {
    const list: { name: string; url: string }[] = [];

    // Always attempt to get the latest, fully merged local event from localDb
    let localEvent: Event = alertObj;
    try {
      await localDb.init();
      const dbEvent = await localDb.get<Event>("events", alertObj.id);
      if (dbEvent) {
        localEvent = dbEvent;
      }
    } catch (e) {
      console.warn("Could not retrieve local event from IndexedDB, falling back to passed object", e);
    }

    const addUrls = (arr: any, prefix: string) => {
      if (Array.isArray(arr)) {
        arr.forEach((url, idx) => {
          if (url && typeof url === "string" && !list.some(item => item.url === url)) {
            let extension = "jpg";
            if (url.startsWith("data:")) {
              const mimeMatch = url.match(/data:(.*?);/);
              if (mimeMatch) {
                const mime = mimeMatch[1];
                if (mime.includes("png")) extension = "png";
                else if (mime.includes("gif")) extension = "gif";
                else if (mime.includes("webp")) extension = "webp";
                else if (mime.includes("svg")) extension = "svg";
                else if (mime.includes("mp4") || mime.includes("video")) extension = "mp4";
                else if (mime.includes("mp3") || mime.includes("mpeg") || mime.includes("audio")) extension = "mp3";
                else if (mime.includes("wav")) extension = "wav";
                else if (mime.includes("ogg")) extension = "ogg";
                else if (mime.includes("plain") || mime.includes("text")) extension = "txt";
              }
            } else {
              if (prefix === "video" || url.toLowerCase().endsWith(".mp4") || url.toLowerCase().includes("video")) extension = "mp4";
              if (prefix === "audio" || url.toLowerCase().endsWith(".mp3") || url.toLowerCase().endsWith(".wav") || url.toLowerCase().includes("audio")) extension = "mp3";
              if (prefix === "text" || url.toLowerCase().endsWith(".txt")) extension = "txt";
            }
            
            try {
              const urlObj = new URL(url);
              const pathname = urlObj.pathname;
              const filename = pathname.substring(pathname.lastIndexOf('/') + 1);
              if (filename && filename.includes('.')) {
                list.push({ name: filename, url });
                return;
              }
            } catch {}

            list.push({ name: `${prefix}_${idx + 1}.${extension}`, url });
          }
        });
      } else if (typeof arr === "string" && arr.trim() !== "") {
        if (!list.some(item => item.url === arr)) {
          let extension = "jpg";
          if (arr.startsWith("data:")) {
            const mimeMatch = arr.match(/data:(.*?);/);
            if (mimeMatch) {
              const mime = mimeMatch[1];
              if (mime.includes("png")) extension = "png";
              else if (mime.includes("gif")) extension = "gif";
              else if (mime.includes("webp")) extension = "webp";
              else if (mime.includes("svg")) extension = "svg";
              else if (mime.includes("mp4") || mime.includes("video")) extension = "mp4";
              else if (mime.includes("mp3") || mime.includes("mpeg") || mime.includes("audio")) extension = "mp3";
              else if (mime.includes("wav")) extension = "wav";
              else if (mime.includes("ogg")) extension = "ogg";
              else if (mime.includes("plain") || mime.includes("text")) extension = "txt";
            }
          } else {
            if (prefix === "video" || arr.toLowerCase().endsWith(".mp4") || arr.toLowerCase().includes("video")) extension = "mp4";
            if (prefix === "audio" || arr.toLowerCase().endsWith(".mp3") || arr.toLowerCase().endsWith(".wav") || arr.toLowerCase().includes("audio")) extension = "mp3";
            if (prefix === "text" || arr.toLowerCase().endsWith(".txt")) extension = "txt";
          }
          
          try {
            const urlObj = new URL(arr);
            const pathname = urlObj.pathname;
            const filename = pathname.substring(pathname.lastIndexOf('/') + 1);
            if (filename && filename.includes('.')) {
              list.push({ name: filename, url: arr });
              return;
            }
          } catch {}

          list.push({ name: `${prefix}_1.${extension}`, url: arr });
        }
      }
    };

    // Add direct and merged local fields
    addUrls(localEvent.images, "image");
    addUrls(localEvent.media, "media");
    addUrls((localEvent as any).image, "image");
    addUrls((localEvent as any).imageUrl, "image");
    addUrls((localEvent as any).photo, "photo");
    addUrls((localEvent as any).photoUrl, "photo");
    addUrls((localEvent as any).medias, "media");
    addUrls((localEvent as any).mediaUrls, "media");
    addUrls((localEvent as any).photos, "photo");
    addUrls(localEvent.videos, "video");
    addUrls(localEvent.audios, "audio");
    addUrls(localEvent.texts, "text");

    return list;
  };

  const handleExportAttachments = async () => {
    if (filteredAlerts.length === 0) {
      alert("Nenhum alerta encontrado com os filtros selecionados.");
      return;
    }

    setExportingZip(true);
    setExportProgress("Iniciando...");

    try {
      await localDb.init();
      const zip = new JSZip();
      let totalAttachmentsCount = 0;
      
      // Store alert dates with attachments
      const alertsWithAttachmentsDates: { dateStr: string; dateObj: Date }[] = [];

      // Fetch all updated event records from local database
      const allLocalEvents = await localDb.getAll<Event>("events");

      // Step 2: Gather attachments for all filtered alerts using the updated local database records
      for (let i = 0; i < filteredAlerts.length; i++) {
        const currentAlert = filteredAlerts[i];
        const alertObj = allLocalEvents.find(e => e.id === currentAlert.id) || currentAlert;
        setExportProgress(`Analisando ${i + 1}/${filteredAlerts.length}...`);
        
        const attachments = await fetchAlertAttachments(alertObj);
        
        if (attachments.length > 0) {
          const parsedDate = parseDateString(alertObj.date);
          if (parsedDate) {
            alertsWithAttachmentsDates.push({ dateStr: alertObj.date, dateObj: parsedDate });
          }

          // Step 3: Process/read each attachment and add to ZIP
          for (let j = 0; j < attachments.length; j++) {
            const att = attachments[j];
            setExportProgress(`Processando ${j + 1}/${attachments.length} do alerta ${i + 1}...`);
            
            const blob = await fetchFileBlob(att.url);
            if (blob) {
              const safeUser = (alertObj.userName || alertObj.userId || "usuario").replace(/[^a-zA-Z0-9-_]/g, "_");
              const safeDate = alertObj.date.replace(/\//g, "-");
              const safeHour = alertObj.hour.replace(/:/g, "-");
              const folderName = `alerta_${alertObj.id}_${safeUser}_${safeDate}_${safeHour}`;
              
              // Add to zip
              zip.file(`${folderName}/${att.name}`, blob);
              totalAttachmentsCount++;
            }
          }
        }
      }

      if (totalAttachmentsCount === 0) {
        alert("Nenhum arquivo anexo encontrado nos alertas selecionados.");
        setExportingZip(false);
        setExportProgress("");
        return;
      }

      setExportProgress("Gerando ZIP...");

      // Determine date range
      let finalStartDateStr = startDateFilter;
      let finalEndDateStr = endDateFilter;

      if (!finalStartDateStr || !finalEndDateStr) {
        if (alertsWithAttachmentsDates.length > 0) {
          // Sort dates ascending
          const sorted = [...alertsWithAttachmentsDates].sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());
          
          if (!finalStartDateStr) {
            finalStartDateStr = sorted[0].dateStr;
          }
          if (!finalEndDateStr) {
            finalEndDateStr = sorted[sorted.length - 1].dateStr;
          }
        } else {
          if (!finalStartDateStr) finalStartDateStr = "sem-inicio";
          if (!finalEndDateStr) finalEndDateStr = "sem-fim";
        }
      }

      // Format parts for the zip filename
      const safeNome = (currentUserLogin || "desconhecido").replace(/[^a-zA-Z0-9-_]/g, "_");
      const safeSectorFilter = (sectorFilter || "todos").replace(/[^a-zA-Z0-9-_]/g, "_");
      const safeUserFilter = (userFilter || "todos").replace(/[^a-zA-Z0-9-_]/g, "_");
      const safeStartDate = finalStartDateStr.replace(/\//g, "-");
      const safeEndDate = finalEndDateStr.replace(/\//g, "-");

      const zipFilename = `${safeNome}-alertas-anexos-${safeSectorFilter}-${safeUserFilter}-${safeStartDate}-${safeEndDate}.zip`;

      const content = await zip.generateAsync({ type: "blob" });
      
      // Save
      const url = URL.createObjectURL(content);
      const link = document.createElement("a");
      link.href = url;
      link.download = zipFilename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setExportProgress("Concluído!");
    } catch (e) {
      console.error("Erro ao exportar anexos em ZIP:", e);
      alert("Ocorreu um erro ao gerar o arquivo ZIP.");
    } finally {
      setTimeout(() => {
        setExportingZip(false);
        setExportProgress("");
      }, 1500);
    }
  };

  // Navigations
  const handlePrev = () => {
    if (filteredAlerts.length === 0) return;
    const prevIdx = currentIndex > 0 ? currentIndex - 1 : filteredAlerts.length - 1;
    setCurrentIndex(prevIdx);
    setTypedIndexValue((prevIdx + 1).toString());
  };

  const handleNext = () => {
    if (filteredAlerts.length === 0) return;
    const nextIdx = currentIndex < filteredAlerts.length - 1 ? currentIndex + 1 : 0;
    setCurrentIndex(nextIdx);
    setTypedIndexValue((nextIdx + 1).toString());
  };

  const handleIndexSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseInt(typedIndexValue, 10);
    if (!isNaN(val) && val >= 1 && val <= filteredAlerts.length) {
      setCurrentIndex(val - 1);
    } else {
      // Revert to current actual
      setTypedIndexValue((currentIndex + 1).toString());
    }
  };

  // Extract images, videos, audios, texts for the active alert
  const activeImages = activeAlert ? getImagesListCombined(activeAlert) : [];
  const activeVideos = activeAlert ? getVideosListCombined(activeAlert) : [];
  const activeAudios = activeAlert ? getAudiosListCombined(activeAlert) : [];
  const activeTexts = activeAlert ? getTextsListCombined(activeAlert) : [];

  useEffect(() => {
    const loadCachedMedia = async () => {
      try {
        await localDb.init();
        const urlsToLoad = [...activeImages, ...activeVideos, ...activeAudios, ...activeTexts];
        for (const url of urlsToLoad) {
          if (url && url.startsWith("http") && !fallbackUrls[url]) {
            const cached = await localDb.get<{ url: string; blob: Blob }>("attachments", url);
            if (cached && cached.blob instanceof Blob) {
              const objUrl = URL.createObjectURL(cached.blob);
              setFallbackUrls((prev) => ({ ...prev, [url]: objUrl }));
            }
          }
        }
      } catch (err) {
        console.warn("Failed to load cached media in AlertAttachmentsFullScreen:", err);
      }
    };
    loadCachedMedia();
  }, [currentIndex, activeImages.length, activeVideos.length, activeAudios.length, activeTexts.length]);

  const totalAttachments = activeImages.length + activeVideos.length + activeAudios.length + activeTexts.length;

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 flex flex-col font-sans selection:bg-cyan-500/20 selection:text-cyan-800 relative">
      
      {/* Background Visual Tactical Overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.01)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.01)_1px,transparent_1px)] bg-[size:30px_30px] pointer-events-none" />

      {/* Modern Top Header bar */}
      <header className="bg-white border-b border-slate-200 p-4 sticky top-0 z-30 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white border border-slate-200 rounded-xl flex items-center justify-center p-1 shadow-sm">
            <img 
              src={logoImg} 
              alt="Logo" 
              className="w-full h-full object-contain"
              referrerPolicy="no-referrer"
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase font-mono tracking-widest text-cyan-600 font-extrabold">PEMD SP613-Seg</span>
              <span className="bg-cyan-50 border border-cyan-200 text-cyan-700 font-mono text-[9px] px-2 py-0.5 rounded-full font-bold">
                MÓDULO ANEXOS EXPANDIDO
              </span>
            </div>
            <h1 className="text-sm md:text-base font-black tracking-tight text-slate-950 flex items-center gap-1.5 mt-0.5">
              <Tv className="w-4 h-4 text-cyan-600" />
              Central de Visualização de Arquivos e Mídia
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Export Attachments ZIP Button */}
          <button
            onClick={handleExportAttachments}
            disabled={exportingZip}
            className="bg-cyan-50 hover:bg-cyan-100 border border-cyan-200 disabled:bg-slate-100 disabled:border-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-cyan-700 font-mono text-xs font-bold px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
            title="Exportar todos os arquivos anexos dos alertas filtrados em formato ZIP"
          >
            {exportingZip ? (
              <>
                <span className="animate-spin inline-block w-3 h-3 border-2 border-cyan-500 border-t-transparent rounded-full" />
                <span>{exportProgress || "Exportando..."}</span>
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5" /> Exportar anexos
              </>
            )}
          </button>

          {/* Export SIMUC Button */}
          <button
            onClick={() => {
              exportToSimucCSV({
                routes: [],
                events: filteredAlerts,
                currentUserLogin: currentUserLogin,
              });
            }}
            className="bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 font-mono text-xs font-bold px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
            title="Exportar alertas operacionais formatados para o padrão de 26 colunas SIMUC/ICMBio"
          >
            <Download className="w-3.5 h-3.5" /> Exportar SIMUC (CSV)
          </button>

          {/* Connection status */}
          <div className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-mono text-xs font-bold ${
            isOnline 
              ? "bg-emerald-50 text-emerald-700 border-emerald-200/80" 
              : "bg-rose-50 text-rose-700 border-rose-200/80 animate-pulse"
          }`}>
            <span className={`w-2 h-2 rounded-full ${isOnline ? "bg-emerald-500" : "bg-rose-500"}`} />
            <span>{isOnline ? "OPERANDO ONLINE" : "OPERANDO LOCAL/OFFLINE"}</span>
          </div>

          {/* Close / Return button */}
          {onClose && (
            <button
              onClick={onClose}
              className="bg-white hover:bg-slate-50 text-slate-800 text-xs font-bold px-3 py-2 rounded-lg flex items-center gap-1.5 transition-all border border-slate-200 shadow-sm cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" /> Voltar ao Painel
            </button>
          )}
        </div>
      </header>

      {/* Main Workspace Frame */}
      <main className="flex-grow grid grid-cols-1 lg:grid-cols-12 overflow-hidden relative z-10">
        
        {/* LEFT COLUMN: Controls, Filters & Navigation (Col-span 4) */}
        <section className="lg:col-span-4 bg-white border-r border-slate-200 p-5 flex flex-col gap-5 overflow-y-auto custom-scrollbar">
          
          {/* Section: Filters */}
          <div className="bg-slate-50/60 border border-slate-200/80 rounded-2xl p-4 space-y-4 shadow-sm">
            <h2 className="text-xs font-bold text-slate-600 font-mono uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-slate-200">
              <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-600" />
              Filtros de Alerta
            </h2>

            {/* Sector dropdown */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase font-mono block">Filtrar por setor</label>
              <div className="relative">
                <select
                  value={sectorFilter}
                  onChange={(e) => setSectorFilter(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg py-1.5 px-3 pl-8 text-xs text-slate-800 focus:outline-none focus:border-cyan-500 transition-all font-mono cursor-pointer shadow-sm appearance-none"
                >
                  <option value="todos">Todos os Setores</option>
                  {allSectors.map((sec) => (
                    <option key={sec} value={sec}>{sec}</option>
                  ))}
                </select>
                <Compass className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
              </div>
            </div>

            {/* User dropdown */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase font-mono block">Filtrar por usuário</label>
              <div className="relative">
                <select
                  value={userFilter}
                  onChange={(e) => setUserFilter(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg py-1.5 px-3 pl-8 text-xs text-slate-800 focus:outline-none focus:border-cyan-500 transition-all font-mono cursor-pointer shadow-sm appearance-none"
                >
                  <option value="todos">Todos os Usuários</option>
                  {allUsers.map((user) => {
                    const dbUser = users.find((u) => u.login === user || u.id === user);
                    const displayLabel = dbUser ? `${dbUser.name} (${dbUser.login})` : user;
                    return (
                      <option key={user} value={user}>{displayLabel}</option>
                    );
                  })}
                </select>
                <UserIcon className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
              </div>
            </div>

            {/* Dates row */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase font-mono block">Data Inicial</label>
                <div className="relative">
                  <input
                    type="date"
                    value={startDateFilter}
                    onChange={(e) => setStartDateFilter(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg py-1 px-2 pl-7 text-[10px] text-slate-800 focus:outline-none focus:border-cyan-500 transition-all font-mono cursor-pointer shadow-sm"
                  />
                  <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-2 pointer-events-none" />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase font-mono block">Data Final</label>
                <div className="relative">
                  <input
                    type="date"
                    value={endDateFilter}
                    onChange={(e) => setEndDateFilter(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg py-1 px-2 pl-7 text-[10px] text-slate-800 focus:outline-none focus:border-cyan-500 transition-all font-mono cursor-pointer shadow-sm"
                  />
                  <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-2 pointer-events-none" />
                </div>
              </div>
            </div>

            {/* Alert Type */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase font-mono block">Tipo de alerta</label>
              <div className="relative">
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg py-1.5 px-3 pl-8 text-xs text-slate-800 focus:outline-none focus:border-cyan-500 transition-all font-mono cursor-pointer shadow-sm appearance-none"
                >
                  <option value="todos">Todos Eventos</option>
                  <option value="sos">Apenas SOS / Emergências</option>
                </select>
                <Filter className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
              </div>
            </div>

            {/* Boolean text search input */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase font-mono block">Busca Booleana (Ex: SOS E Setor)</label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Buscar..."
                  value={alertSearchTerm}
                  onChange={(e) => setAlertSearchTerm(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg py-1.5 px-3 pl-8 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-cyan-500 transition-all font-sans shadow-sm"
                />
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
              </div>
            </div>

            {/* Clear filters trigger if any filter is active */}
            {(sectorFilter !== "todos" || typeFilter !== "todos" || userFilter !== "todos" || startDateFilter !== "" || endDateFilter !== "" || alertSearchTerm !== "") && (
              <button
                onClick={() => {
                  setSectorFilter("todos");
                  setTypeFilter("todos");
                  setUserFilter("todos");
                  setStartDateFilter("");
                  setEndDateFilter("");
                  setAlertSearchTerm("");
                }}
                className="w-full py-1.5 text-xs text-rose-600 hover:text-rose-700 font-bold uppercase tracking-wider font-mono bg-rose-50 hover:bg-rose-100 rounded-lg border border-rose-200 transition-all cursor-pointer"
              >
                ✕ Limpar Filtros
              </button>
            )}
          </div>

          {/* Section: Queue Navigator */}
          <div className="bg-slate-50/60 border border-slate-200/80 rounded-2xl p-4 space-y-4 shadow-sm flex-grow flex flex-col justify-between">
            <div className="space-y-3">
              <h2 className="text-xs font-bold text-slate-600 font-mono uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-slate-200">
                <Compass className="w-3.5 h-3.5 text-cyan-600" />
                Fila de Ocorrências Filtradas
              </h2>

              {/* Navigator info */}
              <div className="flex items-center justify-between bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
                <div className="space-y-1">
                  <span className="text-[10px] text-slate-500 font-mono block">TOTAL FILTRADO</span>
                  <span className="text-xl font-black text-slate-950 font-mono">{filteredAlerts.length} <span className="text-xs text-slate-500">alertas</span></span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-500 font-mono block">POSIÇÃO ATUAL</span>
                  <span className="text-lg font-bold text-cyan-700 font-mono">
                    {filteredAlerts.length > 0 ? currentIndex + 1 : 0} <span className="text-slate-400 text-xs">de</span> {filteredAlerts.length}
                  </span>
                </div>
              </div>

              {/* Slider / Button navigator controls */}
              {filteredAlerts.length > 0 && (
                <div className="space-y-4">
                  {/* Next / Prev buttons */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={handlePrev}
                      className="bg-white hover:bg-slate-50 text-slate-700 py-2 px-3 rounded-lg flex items-center justify-center gap-1 text-xs font-bold transition-all border border-slate-200 shadow-sm cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4" /> Anterior
                    </button>
                    <button
                      onClick={handleNext}
                      className="bg-white hover:bg-slate-50 text-slate-700 py-2 px-3 rounded-lg flex items-center justify-center gap-1 text-xs font-bold transition-all border border-slate-200 shadow-sm cursor-pointer"
                    >
                      Próximo <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Input form to jump directly */}
                  <form onSubmit={handleIndexSubmit} className="flex items-center gap-2 bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
                    <span className="text-xs text-slate-500 font-mono pl-1">Ir para o alerta nº:</span>
                    <input
                      type="number"
                      min={1}
                      max={filteredAlerts.length}
                      value={typedIndexValue}
                      onChange={(e) => setTypedIndexValue(e.target.value)}
                      className="w-16 bg-slate-50 border border-slate-200 rounded-lg py-1 px-2 text-center text-xs font-mono font-bold text-slate-800 focus:outline-none focus:border-cyan-500"
                    />
                    <button
                      type="submit"
                      className="flex-grow bg-cyan-600 hover:bg-cyan-500 border border-cyan-600 text-white text-xs font-bold py-1 px-2.5 rounded-lg transition-all cursor-pointer"
                    >
                      Ir
                    </button>
                  </form>
                </div>
              )}
            </div>

            {/* Active Alert Details Card */}
            {activeAlert ? (
              <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2.5 mt-4 shadow-sm">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`inline-flex items-center gap-1 text-[9px] uppercase font-mono font-bold px-2 py-0.5 rounded-full ${
                    activeAlert.observacao.toLowerCase().includes("sos") || activeAlert.sector.toLowerCase().includes("avulso")
                      ? "bg-rose-50 text-rose-700 border border-rose-200/50"
                      : "bg-amber-50 text-amber-700 border border-amber-200/50"
                  }`}>
                    {activeAlert.observacao.toLowerCase().includes("sos") || activeAlert.sector.toLowerCase().includes("avulso") ? (
                      <ShieldAlert className="w-3 h-3" />
                    ) : (
                      <AlertTriangle className="w-3 h-3" />
                    )}
                    {activeAlert.observacao.toLowerCase().includes("sos") || activeAlert.sector.toLowerCase().includes("avulso") ? "Emergência / SOS" : "Alerta de Ronda"}
                  </span>
                  <span className="text-[9px] font-mono text-slate-400">{activeAlert.date} às {activeAlert.hour}</span>
                </div>

                <div className="space-y-1 text-xs">
                  <p className="text-slate-600 font-mono"><strong className="text-slate-900">Setor:</strong> {activeAlert.sector}</p>
                  <p className="text-slate-600 font-mono"><strong className="text-slate-900">Ocorrência:</strong> "{activeAlert.observacao}"</p>
                  {activeAlert.notes && <p className="text-slate-500 border-l-2 border-slate-200 pl-2 italic">Nota: {activeAlert.notes}</p>}
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-[10px] text-slate-500 font-mono">
                    <div>User: <strong className="text-slate-700">@{activeAlert.userName}</strong></div>
                    <div>Veículo: <strong className="text-slate-700">{activeAlert.vehicle}</strong></div>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-slate-400 text-xs font-medium italic text-center py-4 bg-slate-50 border border-slate-200 border-dashed rounded-xl">
                Nenhum alerta selecionado.
              </p>
            )}

          </div>

        </section>

        {/* RIGHT COLUMN: Big Expanded View Theater Area (Col-span 8) */}
        <section className="lg:col-span-8 bg-[#f8fafc]/50 p-6 flex flex-col gap-6 overflow-y-auto custom-scrollbar">
          
          {/* Active view title banner */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5 font-mono">
                <ImageIcon className="w-4 h-4 text-cyan-600" />
                Painel Ampliado
              </h3>
              <p className="text-[11px] text-slate-500 mt-1">
                Arquivos locais
              </p>
            </div>
            {activeAlert && (
              <div className="bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 text-right">
                <span className="text-[10px] text-slate-400 block font-mono">ID DO ALERTA SELECIONADO</span>
                <span className="text-xs font-bold text-slate-700 font-mono">{activeAlert.id}</span>
              </div>
            )}
          </div>

          {/* Conditional Work Area */}
          {!activeAlert ? (
            <div className="flex-grow flex flex-col items-center justify-center border border-dashed border-slate-200 rounded-3xl p-12 text-center bg-white shadow-sm">
              <Compass className="w-16 h-16 text-slate-300 mb-4 animate-spin-slow" />
              <h4 className="text-lg font-black text-slate-800 font-mono uppercase tracking-wider">Sem Ocorrências Encontradas</h4>
              <p className="text-sm text-slate-500 max-w-md mt-1.5 font-sans">
                Não há alertas ativos ou resolvidos correspondendo aos filtros aplicados. Tente ajustar os parâmetros no painel lateral.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              
              {/* Load indicator */}
              {mediaLoading && (
                <div className="bg-white border border-slate-200 p-6 rounded-3xl flex items-center justify-center text-xs text-slate-600 font-mono gap-2.5 shadow-sm">
                  <span className="animate-spin inline-block w-4 h-4 border-2 border-cyan-500 border-t-transparent rounded-full" />
                  Buscando dados adicionais de subcoleções de anexos no Firestore...
                </div>
              )}

              {/* Total attachment indicator */}
              <div className="flex items-center justify-between text-xs text-slate-500 border-b border-slate-200 pb-2">
                <span className="font-mono">Arquivos localizados: <strong className="text-slate-800">{totalAttachments}</strong></span>
                <span className="bg-cyan-50 text-cyan-700 text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase font-mono tracking-wider border border-cyan-200/50">
                  Banco de dados local
                </span>
              </div>

              {totalAttachments === 0 && !mediaLoading ? (
                <div className="bg-white border border-dashed border-slate-200 p-12 rounded-3xl text-center text-slate-400 shadow-sm font-sans italic">
                  Este alerta não possui arquivos de mídia ou anexos vinculados (imagens, áudios, vídeos ou notas de texto).
                </div>
              ) : (
                <div className="space-y-8">
                  
                  {/* Category 1: Images list */}
                  {activeImages.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="text-xs font-bold text-slate-800 font-mono uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-200 pb-2.5">
                        <ImageIcon className="w-4 h-4 text-cyan-600" />
                        Imagens ({activeImages.length})
                      </h4>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                        {activeImages.map((img, idx) => (
                          <div 
                            key={idx} 
                            onClick={() => handleOpenImagesLightbox(idx)}
                            className="group relative bg-white p-1.5 rounded-xl border border-slate-200 hover:border-cyan-500/60 shadow-sm hover:shadow-xl cursor-pointer overflow-hidden transition-all duration-300 transform hover:-translate-y-1"
                          >
                            <img 
                              src={fallbackUrls[img] || img} 
                              alt={`Imagem ${idx + 1}`} 
                              className="rounded-lg w-full h-32 md:h-36 object-cover"
                              referrerPolicy="no-referrer"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center p-2.5">
                              <span className="text-[9px] font-mono font-bold text-white uppercase tracking-widest bg-cyan-600 border border-cyan-500 px-2 py-1 rounded">
                                Ampliar
                              </span>
                            </div>
                            <span className="text-[10px] text-slate-600 truncate block font-mono mt-1.5 px-1">imagem_{idx + 1}.jpg</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Category 2: Videos */}
                  {activeVideos.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="text-xs font-bold text-slate-800 font-mono uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-200 pb-2.5">
                        <VideoIcon className="w-4 h-4 text-purple-600" />
                        Vídeos ({activeVideos.length})
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {activeVideos.map((vid, idx) => (
                          <div 
                            key={idx}
                            onClick={() => handleOpenVideosLightbox(idx)}
                            className="group relative bg-white p-2.5 rounded-2xl border border-slate-200 hover:border-purple-500 hover:shadow-xl shadow-sm cursor-pointer overflow-hidden transition-all duration-300 transform hover:-translate-y-1"
                          >
                            <div className="relative rounded-lg overflow-hidden bg-slate-50 border border-slate-200 aspect-video flex items-center justify-center">
                              <div className="absolute inset-0 bg-slate-900/10 flex items-center justify-center z-10 group-hover:bg-slate-900/5 transition-all">
                                <div className="w-12 h-12 bg-purple-600/95 hover:bg-purple-500 rounded-full flex items-center justify-center text-white shadow-xl transition-all transform hover:scale-110">
                                  <VideoIcon className="w-5 h-5 fill-current" />
                                </div>
                              </div>
                              <video muted className="w-full h-full object-cover pointer-events-none">
                                <source src={fallbackUrls[vid] || vid} type="video/mp4" />
                              </video>
                            </div>
                            <span className="text-[10px] text-slate-600 font-mono mt-2 block px-1 truncate">registro_video_{idx + 1}.mp4</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Category 3: Audios */}
                  {activeAudios.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="text-xs font-bold text-slate-800 font-mono uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-200 pb-2.5">
                        <AudioIcon className="w-4 h-4 text-emerald-600" />
                        Áudio ({activeAudios.length})
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {activeAudios.map((aud, idx) => (
                          <div key={idx} className="bg-white p-4 rounded-xl border border-slate-200 flex flex-col justify-between shadow-sm">
                            <div className="flex items-center gap-2 mb-3">
                              <div className="w-7 h-7 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-lg flex items-center justify-center">
                                <AudioIcon className="w-3.5 h-3.5" />
                              </div>
                              <span className="text-[11px] font-mono text-slate-600">relato_audio_{idx + 1}.mp3</span>
                            </div>
                            <audio controls className="w-full text-slate-800">
                              <source src={fallbackUrls[aud] || aud} type="audio/mpeg" />
                              Seu navegador não suporta reprodução de áudio.
                            </audio>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Category 4: Texts */}
                  {activeTexts.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="text-xs font-bold text-slate-800 font-mono uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-200 pb-2.5">
                        <TextIcon className="w-4 h-4 text-amber-600" />
                        Notas ({activeTexts.length})
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {activeTexts.map((txt, idx) => (
                          <div key={idx} className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                            <TextFileDisplay textUrl={txt} textName={`NOTA DE TEXTO #${idx + 1}`} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                </div>
              )}

            </div>
          )}

        </section>

      </main>

      {/* LIGHTBOX MODAL OVERLAY */}
      {activeGroupType && (
        <div 
          onClick={() => setActiveGroupType(null)}
          className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-50 flex flex-col items-center justify-center p-4 animate-fade-in"
        >
          {/* Lightbox container */}
          <div 
            onClick={(e) => e.stopPropagation()} 
            className="relative max-w-4xl w-full flex flex-col items-center justify-center"
          >
            {/* Navigation - Prev Button */}
            {activeGroupType === "images" && activeImages.length > 1 && (
              <button
                onClick={() => setActiveGroupIndex((prev) => (prev - 1 + activeImages.length) % activeImages.length)}
                className="absolute left-2 md:-left-16 top-1/2 -translate-y-1/2 w-12 h-12 bg-white hover:bg-slate-50 text-cyan-600 rounded-full border border-slate-200 flex items-center justify-center shadow-xl transition-all cursor-pointer z-20 hover:scale-105"
                title="Anterior"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
            )}
            {activeGroupType === "videos" && activeVideos.length > 1 && (
              <button
                onClick={() => setActiveGroupIndex((prev) => (prev - 1 + activeVideos.length) % activeVideos.length)}
                className="absolute left-2 md:-left-16 top-1/2 -translate-y-1/2 w-12 h-12 bg-white hover:bg-slate-50 text-cyan-600 rounded-full border border-slate-200 flex items-center justify-center shadow-xl transition-all cursor-pointer z-20 hover:scale-105"
                title="Anterior"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
            )}

            {/* Content Area */}
            <div className="bg-white border border-slate-200 p-2.5 rounded-3xl shadow-2xl overflow-hidden max-h-[75vh] flex items-center justify-center">
              {activeGroupType === "images" ? (
                <img 
                  src={fallbackUrls[activeImages[activeGroupIndex]] || activeImages[activeGroupIndex]} 
                  alt={`Imagem expandida ${activeGroupIndex + 1}`} 
                  className="max-w-full max-h-[70vh] rounded-2xl object-contain border border-slate-200"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <video 
                  key={fallbackUrls[activeVideos[activeGroupIndex]] || activeVideos[activeGroupIndex]}
                  controls 
                  autoPlay
                  className="max-w-full max-h-[70vh] rounded-2xl object-contain bg-black border border-slate-200"
                >
                  <source src={fallbackUrls[activeVideos[activeGroupIndex]] || activeVideos[activeGroupIndex]} type="video/mp4" />
                  Seu navegador não suporta a reprodução de vídeo.
                </video>
              )}
            </div>

            {/* Navigation - Next Button */}
            {activeGroupType === "images" && activeImages.length > 1 && (
              <button
                onClick={() => setActiveGroupIndex((prev) => (prev + 1) % activeImages.length)}
                className="absolute right-2 md:-right-16 top-1/2 -translate-y-1/2 w-12 h-12 bg-white hover:bg-slate-50 text-cyan-600 rounded-full border border-slate-200 flex items-center justify-center shadow-xl transition-all cursor-pointer z-20 hover:scale-105"
                title="Próxima"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            )}
            {activeGroupType === "videos" && activeVideos.length > 1 && (
              <button
                onClick={() => setActiveGroupIndex((prev) => (prev + 1) % activeVideos.length)}
                className="absolute right-2 md:-right-16 top-1/2 -translate-y-1/2 w-12 h-12 bg-white hover:bg-slate-50 text-cyan-600 rounded-full border border-slate-200 flex items-center justify-center shadow-xl transition-all cursor-pointer z-20 hover:scale-105"
                title="Próxima"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            )}
          </div>

          {/* Footer Info / Counter / Close instructions */}
          <div className="mt-5 text-center space-y-2 select-none" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 justify-center">
              <span className="bg-white border border-slate-200 text-slate-700 text-xs px-3.5 py-1.5 rounded-full font-mono font-bold shadow-sm">
                {activeGroupType === "images" 
                  ? `Imagem ${activeGroupIndex + 1} de ${activeImages.length}` 
                  : `Vídeo ${activeGroupIndex + 1} de ${activeVideos.length}`
                }
              </span>
              <button
                onClick={() => setActiveGroupType(null)}
                className="bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 text-xs font-bold px-3.5 py-1.5 rounded-full transition-all cursor-pointer shadow-sm"
              >
                Fechar Visualização
              </button>
            </div>
            <p className="text-[10px] font-mono text-slate-300">
              Dica: Use as setas laterais para caminhar pelo grupo ou clique fora para fechar
            </p>
          </div>
        </div>
      )}

    </div>
  );
}
