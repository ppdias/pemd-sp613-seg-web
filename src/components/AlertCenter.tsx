import React, { useState, useEffect, useRef } from "react";
import JSZip from "jszip";
import { Event, LogEntry, User } from "../types";
import { FirebaseSync as SyncManager, localDb, convertUrlToBase64, getApiProxyBase } from "../lib/db";
import { db, auth } from "../lib/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import { 
  Bell, 
  Volume2, 
  VolumeX, 
  ShieldAlert, 
  CheckCircle, 
  Search, 
  Filter, 
  AlertTriangle, 
  Eye, 
  ChevronLeft, 
  ChevronRight, 
  Image as ImageIcon,
  Video,
  Mic,
  FileText,
  Lock,
  Download,
  Calendar,
  Compass,
  User as UserIcon,
  ExternalLink
} from "lucide-react";

import { exportToSimucCSV } from "../utils/csvExporter";

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid || null,
      email: auth?.currentUser?.email || null,
      emailVerified: auth?.currentUser?.emailVerified || null,
      isAnonymous: auth?.currentUser?.isAnonymous || null,
      tenantId: auth?.currentUser?.tenantId || null,
      providerInfo: auth?.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// 1. Hook para buscar mídias vinculadas do Firestore
export function useEventMedia(eventId: string | null) {
  const [media, setMedia] = useState<{
    images: any[];
    videos: any[];
    audios: any[];
    texts: any[];
  }>({ images: [], videos: [], audios: [], texts: [] });
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    if (!eventId || !db) {
      setMedia({ images: [], videos: [], audios: [], texts: [] });
      setLoading(false);
      return;
    }

    const fetchAllMedia = async () => {
      setLoading(true);
      try {
        const collections = ['images', 'videos', 'audios', 'texts'];
        const results = await Promise.all(
          collections.map(async (col) => {
            try {
              return await getDocs(query(collection(db!, col), where("eventId", "==", eventId)));
            } catch (error) {
              handleFirestoreError(error, OperationType.GET, col);
              throw error;
            }
          })
        );

        setMedia({
          images: results[0].docs.map(d => ({ id: d.id, ...d.data() })),
          videos: results[1].docs.map(d => ({ id: d.id, ...d.data() })),
          audios: results[2].docs.map(d => ({ id: d.id, ...d.data() })),
          texts: results[3].docs.map(d => ({ id: d.id, ...d.data() })),
        });
      } catch (error) {
        console.error("Erro ao carregar mídias:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchAllMedia();
  }, [eventId]);

  return { media, loading };
}

// 2. Componente de Exibição de Arquivo de Texto (TextFileDisplay)
export function TextFileDisplay({ textUrl, textName }: { textUrl: string; textName: string; key?: any }) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTextContent = async () => {
      // Se não for uma URL válida, não tenta buscar
      if (!textUrl || !textUrl.startsWith('http')) {
        setContent(textUrl); // Mostra o que houver se for texto puro
        setLoading(false);
        return;
      }

      try {
        // Tenta buscar do cache local IndexedDB primeiro
        try {
          await localDb.init();
          const cached = await localDb.get<{ url: string; blob: Blob }>("attachments", textUrl);
          if (cached && cached.blob instanceof Blob) {
            const text = await cached.blob.text();
            setContent(text);
            setLoading(false);
            return;
          }
        } catch (err) {
          console.warn("Falha ao ler cache do anexo de texto:", err);
        }

        const response = await fetch(`${getApiProxyBase()}?url=${encodeURIComponent(textUrl)}`);
        const text = await response.text();
        setContent(text);

        // Salva no cache local
        try {
          const blob = new Blob([text], { type: "text/plain" });
          await localDb.put("attachments", { url: textUrl, blob });
        } catch (e) {
          console.warn("Falha ao salvar anexo de texto no cache:", e);
        }
      } catch (error) {
        console.error("Erro ao baixar conteúdo do texto:", error);
        setContent("Erro ao carregar o conteúdo do arquivo.");
      } finally {
        setLoading(false);
      }
    };

    fetchTextContent();
  }, [textUrl]);

  if (loading) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-3 col-span-2 flex flex-col justify-center items-center h-24 shadow-sm">
        <span className="text-xs animate-pulse text-slate-400 font-mono">Lendo arquivo...</span>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3 col-span-2 flex flex-col justify-between shadow-sm max-h-48 overflow-y-auto custom-scrollbar">
      <div>
        <p className="text-[10px] font-bold text-cyan-600 mb-1.5 uppercase font-mono tracking-wider">{textName}</p>
        <pre className="text-xs text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">
          {content}
        </pre>
      </div>
      <span className="text-[9px] text-slate-400 mt-2 font-mono block">Origem: {textUrl.startsWith('http') ? 'Nuvem' : 'Local'}</span>
    </div>
  );
}

// 3. Componente de Visualização (Exemplo de Galeria)
export function MediaGallery({ eventId }: { eventId: string }) {
  const { media, loading } = useEventMedia(eventId);

  if (loading) return <div className="animate-pulse text-xs text-slate-500 italic py-4">Carregando anexos da galeria...</div>;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-slate-100/50 rounded-xl border border-slate-200 mt-2">
      {/* Imagens */}
      {media.images.map(img => (
        <div key={img.id} className="relative group flex flex-col gap-1 bg-white p-1 rounded-lg border border-slate-200 shadow-sm">
          <img 
            src={img.image} 
            alt={img.imageName || "Imagem do alerta"} 
            className="rounded-md w-full h-24 object-cover border border-slate-100" 
            referrerPolicy="no-referrer" 
          />
          <span className="text-[10px] text-slate-500 truncate block font-mono p-1">{img.imageName || "imagem.jpg"}</span>
        </div>
      ))}

      {/* Vídeos */}
      {media.videos.map(vid => (
        <div key={vid.id} className="flex flex-col gap-1 bg-white p-1 rounded-lg border border-slate-200 shadow-sm">
          <video controls className="rounded-md w-full h-24 object-cover border border-slate-100">
            <source src={vid.video} type="video/mp4" />
          </video>
          <span className="text-[10px] text-slate-500 truncate block font-mono p-1">{vid.videoName || "video.mp4"}</span>
        </div>
      ))}

      {/* Áudios */}
      {media.audios.map(aud => (
        <div key={aud.id} className="flex flex-col gap-1 bg-white p-1.5 rounded-lg border border-slate-200 shadow-sm col-span-2 md:col-span-1 justify-center">
          <audio controls className="w-full scale-90 origin-left">
            <source src={aud.audio} type="audio/mpeg" />
          </audio>
          <span className="text-[10px] text-slate-500 truncate block font-mono pl-1">{aud.audioName || "audio.mp3"}</span>
        </div>
      ))}

      {/* Textos */}
      {media.texts.map(txt => (
        <TextFileDisplay
          key={txt.id}
          textUrl={txt.text}
          textName={txt.textName || "Texto do Alerta"}
        />
      ))}
      
      {media.images.length === 0 && media.videos.length === 0 && media.audios.length === 0 && media.texts.length === 0 && (
        <p className="text-slate-400 text-xs italic col-span-full text-center py-4">Nenhum anexo encontrado para este alerta.</p>
      )}
    </div>
  );
}

// 3. Sub-componente de Seção de Mídia para carregar as mídias em paralelo
function AlertMediaSection({
  alert,
  users,
  activeMediaTabs,
  setActiveMediaTabs,
  activeMediaIndexes,
  setActiveMediaIndexes,
  failedImages,
  setFailedImages,
  fallbackUrls,
  setFallbackUrls,
  getImageDisplaySrc,
  getProxiedUrl,
  downloadingEvents,
  downloadProgress,
  handleDownloadMedia,
}: {
  alert: Event;
  users: User[];
  activeMediaTabs: any;
  setActiveMediaTabs: any;
  activeMediaIndexes: any;
  setActiveMediaIndexes: any;
  failedImages: any;
  setFailedImages: any;
  fallbackUrls: any;
  setFallbackUrls: any;
  getImageDisplaySrc: (url: string) => string;
  getProxiedUrl: (url: string) => string;
  downloadingEvents: any;
  downloadProgress: any;
  handleDownloadMedia: (alert: Event) => void;
}) {
  const { media, loading } = useEventMedia(alert.id);
  const currentUserLogin = localStorage.getItem("pemd_logged_user") || "";

  useEffect(() => {
    const loadCachedMedia = async () => {
      try {
        await localDb.init();
        const urlsToLoad = [
          ...getImagesListCombined(),
          ...getVideosListCombined(),
          ...getAudiosListCombined(),
          ...getTextsListCombined()
        ];
        for (const url of urlsToLoad) {
          if (url && url.startsWith("http") && !fallbackUrls[url]) {
            const cached = await localDb.get<{ url: string; blob: Blob }>("attachments", url);
            if (cached && cached.blob instanceof Blob) {
              const objUrl = URL.createObjectURL(cached.blob);
              setFallbackUrls((prev: any) => ({ ...prev, [url]: objUrl }));
            }
          }
        }
      } catch (err) {
        console.warn("Failed to load cached media in AlertMediaSection:", err);
      }
    };
    if (!loading) {
      loadCachedMedia();
    }
  }, [alert.id, loading]);

  // Combine local fields with the Firestore relational subcollection fields
  const getImagesListCombined = () => {
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

    // Original fields from the alert document
    addUrls(alert.images);
    addUrls(alert.media);
    addUrls((alert as any).image);
    addUrls((alert as any).imageUrl);
    addUrls((alert as any).photo);
    addUrls((alert as any).photoUrl);
    addUrls((alert as any).medias);
    addUrls((alert as any).mediaUrls);
    addUrls((alert as any).photos);

    // Relational Firestore fields
    media.images.forEach(img => {
      if (img.image && typeof img.image === "string" && !list.includes(img.image)) {
        list.push(img.image);
      }
    });

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

  const getVideosListCombined = () => {
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

    // Relational Firestore fields
    media.videos.forEach(vid => {
      if (vid.video && typeof vid.video === "string" && !list.includes(vid.video)) {
        list.push(vid.video);
      }
    });

    return list;
  };

  const getAudiosListCombined = () => {
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

    // Relational Firestore fields
    media.audios.forEach(aud => {
      if (aud.audio && typeof aud.audio === "string" && !list.includes(aud.audio)) {
        list.push(aud.audio);
      }
    });

    return list;
  };

  const getTextsListCombined = () => {
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

    // Relational Firestore fields
    media.texts.forEach(txt => {
      if (txt.text && typeof txt.text === "string" && !list.includes(txt.text)) {
        list.push(txt.text);
      }
    });

    return list;
  };

  const alertUser = users.find(u => u.login === alert.userName || u.id === alert.userId);
  const userCanVideo = alertUser?.userCanVideo !== "não";
  const userCanAudio = alertUser?.userCanAudio !== "não";
  
  const activeTab = activeMediaTabs[alert.id] || "images";
  
  const imagesList = getImagesListCombined();
  const videosList = getVideosListCombined();
  const audiosList = getAudiosListCombined();
  const textsList = getTextsListCombined();

  const selectTab = (tab: "images" | "videos" | "audios" | "texts") => {
    setActiveMediaTabs((prev: any) => ({ ...prev, [alert.id]: tab }));
    setActiveMediaIndexes((prev: any) => ({ ...prev, [alert.id]: 0 }));
  };

  // Check base64 status for user feedback
  const downloadedUrls: string[] = (alert as any).downloadedUrls || [];
  const isBase64Str = (url: string) => url && (url.startsWith("data:") || url.startsWith("blob:") || url.startsWith("content:"));
  const allUrls = [...imagesList, ...videosList, ...audiosList];
  const totalFilesCount = allUrls.length;
  const localFilesCount = allUrls.filter(url => isBase64Str(url) || downloadedUrls.includes(url)).length;
  const hasRemote = localFilesCount < totalFilesCount;

  return (
    <div className="mt-4 border-t border-slate-200/60 pt-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-bold text-slate-700 font-mono uppercase tracking-wider flex items-center gap-1.5">
          <ImageIcon className="w-3.5 h-3.5 text-cyan-600" />
          Anexos (Sincronização em Tempo Real)
        </h4>
        <div className="flex items-center gap-1.5 flex-wrap">
          <a
            href={`?view=attachments&alertId=${alert.id}${currentUserLogin ? `&user=${currentUserLogin}` : ""}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 bg-cyan-50 hover:bg-cyan-100 border border-cyan-200 text-cyan-700 font-mono text-[10px] px-2.5 py-1 rounded-md font-bold uppercase transition-all"
            title="Visualizar anexos em área ampliada em uma nova aba do navegador"
          >
            <ExternalLink className="w-3 h-3" /> Ver em Nova Aba
          </a>
          <span className="text-[10px] text-slate-500 font-mono bg-slate-100 px-2 py-1 rounded-md">
            Id Alerta: {alert.id}
          </span>
        </div>
      </div>

      {loading && (
        <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl flex items-center justify-center text-xs text-slate-500 font-medium">
          <span className="animate-spin inline-block mr-2 w-4 h-4 border-2 border-cyan-500 border-t-transparent rounded-full" />
          Carregando mídias vinculadas do Firestore...
        </div>
      )}

      {!loading && (
        <div className="space-y-3 bg-slate-50 border border-slate-100 p-3 rounded-2xl">
          {/* Download & Storage Status */}
          {totalFilesCount > 0 && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 p-2.5 bg-slate-100/80 rounded-xl text-xs font-medium text-slate-700 border border-slate-200/50">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-semibold text-slate-800">Status Local:</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${hasRemote ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>
                  {localFilesCount} de {totalFilesCount} arquivos salvos
                </span>
              </div>
              {hasRemote ? (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-amber-600 font-bold flex items-center gap-1 self-end sm:self-auto">
                    ⚠ Não disponível offline
                  </span>
                  <button
                    onClick={() => handleDownloadMedia(alert)}
                    disabled={downloadingEvents[alert.id]}
                    className={`flex items-center justify-center gap-1 text-[10px] font-bold text-white px-2.5 py-1 rounded-lg transition-all shadow-xs cursor-pointer ${
                      downloadingEvents[alert.id] 
                        ? "bg-slate-400 cursor-not-allowed" 
                        : "bg-cyan-600 hover:bg-cyan-700"
                    }`}
                  >
                    <Download className="w-3 h-3 animate-pulse" />
                    {downloadingEvents[alert.id] ? downloadProgress[alert.id] || "Sincronizando..." : "Baixar para Banco Local"}
                  </button>
                </div>
              ) : (
                <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1 self-end sm:self-auto">
                  ✓ Disponível Offline
                </span>
              )}
            </div>
          )}

          {/* Tab Navigation buttons */}
          <div className="flex flex-wrap gap-1.5 border-b border-slate-200 pb-2">
            <button
              onClick={() => selectTab("images")}
              className={`flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                activeTab === "images"
                  ? "bg-cyan-600 text-white shadow-sm"
                  : "bg-white hover:bg-slate-100 text-slate-600 border border-slate-200"
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              Imagens ({imagesList.length})
            </button>

            <button
              onClick={() => selectTab("videos")}
              className={`flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                activeTab === "videos"
                  ? "bg-cyan-600 text-white shadow-sm"
                  : "bg-white hover:bg-slate-100 text-slate-600 border border-slate-200"
              } ${!userCanVideo ? "opacity-70" : ""}`}
            >
              <Video className="w-3.5 h-3.5" />
              Vídeos ({userCanVideo ? videosList.length : "🚫 Bloqueado"})
            </button>

            <button
              onClick={() => selectTab("audios")}
              className={`flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                activeTab === "audios"
                  ? "bg-cyan-600 text-white shadow-sm"
                  : "bg-white hover:bg-slate-100 text-slate-600 border border-slate-200"
              } ${!userCanAudio ? "opacity-70" : ""}`}
            >
              <Mic className="w-3.5 h-3.5" />
              Áudios ({userCanAudio ? audiosList.length : "🚫 Bloqueado"})
            </button>

            <button
              onClick={() => selectTab("texts")}
              className={`flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                activeTab === "texts"
                  ? "bg-cyan-600 text-white shadow-sm"
                  : "bg-white hover:bg-slate-100 text-slate-600 border border-slate-200"
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              Textos ({textsList.length})
            </button>
          </div>

          {/* Tab Contents */}
          <div className="min-h-[140px] flex flex-col justify-center">
            {activeTab === "images" && (
              imagesList.length === 0 ? (
                <div className="text-center text-xs text-slate-500 italic py-6">
                  Nenhuma imagem associada a este alerta.
                </div>
              ) : (
                <div className="relative bg-slate-950 rounded-xl overflow-hidden aspect-video max-h-64 flex items-center justify-center shadow-inner group border border-slate-800">
                  {failedImages[imagesList[activeMediaIndexes[alert.id] || 0]] ? (
                    <div className="flex flex-col items-center justify-center p-6 text-slate-400 text-center space-y-2">
                      <ImageIcon className="w-8 h-8 text-slate-500" />
                      <p className="text-xs font-semibold">Não foi possível exibir esta imagem diretamente.</p>
                      <p className="text-[10px] text-slate-500 font-mono break-all max-w-[280px]">
                        {imagesList[activeMediaIndexes[alert.id] || 0]}
                      </p>
                      <a
                        href={imagesList[activeMediaIndexes[alert.id] || 0]}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-cyan-400 hover:text-cyan-300 font-bold mt-2 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 transition-colors cursor-pointer flex items-center gap-1"
                      >
                        Abrir em nova aba ↗
                      </a>
                    </div>
                  ) : (
                    <img
                      src={getImageDisplaySrc(imagesList[activeMediaIndexes[alert.id] || 0])}
                      alt="Imagens da ocorrência"
                      className="max-h-full max-w-full object-contain select-none"
                      referrerPolicy="no-referrer"
                      onError={() => {
                        const url = imagesList[activeMediaIndexes[alert.id] || 0];
                        if (url) {
                          if (!fallbackUrls[url] && url.startsWith("http")) {
                            const proxied = getProxiedUrl(url);
                            setFallbackUrls((prev: any) => ({ ...prev, [url]: proxied }));
                          } else {
                            setFailedImages((prev: any) => ({ ...prev, [url]: true }));
                          }
                        }
                      }}
                    />
                  )}
                  {imagesList.length > 1 && (
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const currentIdx = activeMediaIndexes[alert.id] || 0;
                          setActiveMediaIndexes((prev: any) => ({
                            ...prev,
                            [alert.id]: (currentIdx - 1 + imagesList.length) % imagesList.length
                          }));
                        }}
                        className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white p-1.5 rounded-full transition-all cursor-pointer border border-white/10"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const currentIdx = activeMediaIndexes[alert.id] || 0;
                          setActiveMediaIndexes((prev: any) => ({
                            ...prev,
                            [alert.id]: (currentIdx + 1) % imagesList.length
                          }));
                        }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white p-1.5 rounded-full transition-all cursor-pointer border border-white/10"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/60 px-2 py-0.5 rounded-full text-[10px] font-mono text-white font-bold border border-white/10">
                        {(activeMediaIndexes[alert.id] || 0) + 1} / {imagesList.length}
                      </div>
                    </>
                  )}
                </div>
              )
            )}

            {activeTab === "videos" && (
              !userCanVideo ? (
                <div className="bg-rose-50 border border-rose-100 rounded-xl p-4 text-center text-xs text-rose-700 font-sans flex flex-col items-center gap-2">
                  <Lock className="w-5 h-5 text-rose-500" />
                  <div>
                    <strong className="block font-bold">Módulo de Vídeo Bloqueado</strong>
                    O vigilante <strong>@{alert.userName}</strong> não possui autorização de transmissão de vídeo (userCanVideo = 'não').
                  </div>
                </div>
              ) : videosList.length === 0 ? (
                <div className="text-center text-xs text-slate-500 italic py-6">
                  Nenhum arquivo de vídeo transmitido para este alerta.
                </div>
              ) : (
                <div className="bg-slate-950 p-1.5 rounded-xl border border-slate-800">
                  <video
                    controls
                    className="w-full rounded-lg max-h-56 object-contain"
                    src={getProxiedUrl(videosList[0])}
                  />
                  <div className="text-[9px] font-mono text-slate-400 text-center mt-1.5 uppercase">
                    Stream de Vídeo @{alert.userName}
                  </div>
                </div>
              )
            )}

            {activeTab === "audios" && (
              !userCanAudio ? (
                <div className="bg-rose-50 border border-rose-100 rounded-xl p-4 text-center text-xs text-rose-700 font-sans flex flex-col items-center gap-2">
                  <Lock className="w-5 h-5 text-rose-500" />
                  <div>
                    <strong className="block font-bold">Módulo de Áudio Bloqueado</strong>
                    O vigilante <strong>@{alert.userName}</strong> não possui autorização de gravação de áudio (userCanAudio = 'não').
                  </div>
                </div>
              ) : audiosList.length === 0 ? (
                <div className="text-center text-xs text-slate-500 italic py-6">
                  Nenhum arquivo de áudio gravado para este alerta.
                </div>
              ) : (
                <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col gap-2">
                  <span className="text-[10px] text-slate-500 font-mono flex items-center gap-1">
                    <Mic className="w-3 h-3 text-cyan-600" />
                    Gravador de Voz @{alert.userName}
                  </span>
                  <audio
                    controls
                    className="w-full h-9"
                    src={getProxiedUrl(audiosList[0])}
                  />
                </div>
              )
            )}

            {activeTab === "texts" && (
              textsList.length === 0 ? (
                <div className="text-center text-xs text-slate-500 italic py-6">
                  Nenhum relatório de texto complementar enviado.
                </div>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                  {textsList.map((txt, idx) => (
                    <TextFileDisplay
                      key={idx}
                      textUrl={txt}
                      textName={`Nota Relatório #${idx + 1}`}
                    />
                  ))}
                </div>
              )
            )}
          </div>
        </div>
      )}

      {/* Componente de Galeria (MediaGallery) como solicitado para exibir os resultados diretamente */}
      <div className="border-t border-slate-200/50 pt-3">
        <h5 className="text-[10px] font-bold text-slate-500 font-mono uppercase tracking-wider mb-2">
          Galeria de Mídias Relacionadas (MediaGallery)
        </h5>
        <MediaGallery eventId={alert.id} />
      </div>
    </div>
  );
}

interface AlertCenterProps {
  events: Event[];

  logs: LogEntry[];
  users?: User[]; // Optional to guarantee backwards compatibility
  onResolveAlert?: (eventId: string) => void;
  currentUserLogin?: string;
  selectedAlertId?: string | null;
  onClearSelectedAlertId?: () => void;
  selectedRouteId?: string | null;
  onClearSelectedRouteId?: () => void;
  resolvedAlerts?: string[];
  setResolvedAlerts?: React.Dispatch<React.SetStateAction<string[]>>;
  showInactiveAlerts?: boolean;
  setShowInactiveAlerts?: React.Dispatch<React.SetStateAction<boolean>>;
  testConnection?: (showModal?: boolean) => Promise<boolean>;
}

export function parseDateString(dateStr: string): Date | null {
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

export function getAlertSearchableText(alert: Event, users: User[]): string {
  const dbUser = users.find((u) => u.login === alert.userName || u.id === alert.userId);
  const userNameDisplay = dbUser ? dbUser.name : "";
  const userEmailDisplay = dbUser?.email || "";
  const userGroupDisplay = dbUser?.group || "";

  return [
    alert.id || "",
    alert.userId || "",
    alert.routeId || "",
    alert.userName || "",
    userNameDisplay,
    userEmailDisplay,
    userGroupDisplay,
    alert.sector || "",
    alert.vehicle || "",
    alert.people || "",
    alert.observacao || "",
    alert.notes || "",
    alert.latlong || "",
    alert.date || "",
    alert.hour || "",
  ]
    .map((val) => val.toString().toLowerCase())
    .join(" ");
}

export function evaluateBooleanQuery(text: string, queryStr: string): boolean {
  const query = queryStr.trim();
  if (!query) return true;

  // Split by "OU" (case-insensitive with spacing)
  const orBlocks = query.split(/\s+OU\s+/i);

  // At least one OR block must be true
  return orBlocks.some((orBlock) => {
    // Split by "E" (case-insensitive with spacing)
    const andBlocks = orBlock.split(/\s+E\s+/i);

    // ALL and-blocks must be true
    return andBlocks.every((andBlock) => {
      const trimmedBlock = andBlock.trim();
      if (!trimmedBlock) return true;

      // Check if starts with "NÃO" or "NAO" (case-insensitive with trailing space)
      const notMatch = trimmedBlock.match(/^(NÃO|NAO)\s+(.+)$/i);
      if (notMatch) {
        const term = notMatch[2].trim().toLowerCase();
        if (!term) return true;
        return !text.includes(term);
      }

      return text.includes(trimmedBlock.toLowerCase());
    });
  });
}

export default function AlertCenter({ 
  events, 
  logs, 
  users = [], 
  onResolveAlert, 
  currentUserLogin = "admin",
  selectedAlertId,
  onClearSelectedAlertId,
  selectedRouteId,
  onClearSelectedRouteId,
  resolvedAlerts: propResolvedAlerts,
  setResolvedAlerts: propSetResolvedAlerts,
  showInactiveAlerts: propShowInactiveAlerts,
  setShowInactiveAlerts: propSetShowInactiveAlerts,
  testConnection
}: AlertCenterProps) {
  const [sectorFilter, setSectorFilter] = useState<string>("todos");
  const [typeFilter, setTypeFilter] = useState<string>("todos");
  const [userFilter, setUserFilter] = useState<string>("todos");
  const [startDateFilter, setStartDateFilter] = useState<string>("");
  const [endDateFilter, setEndDateFilter] = useState<string>("");
  const [alertSearchTerm, setAlertSearchTerm] = useState<string>("");
  const [muted, setMuted] = useState<boolean>(true); // Audio muted by default for safety in browsers
  
  const [localResolvedAlerts, setLocalResolvedAlerts] = useState<string[]>([]);
  const activeResolvedAlerts = propResolvedAlerts !== undefined ? propResolvedAlerts : localResolvedAlerts;
  const updateResolvedAlerts = propSetResolvedAlerts !== undefined ? propSetResolvedAlerts : setLocalResolvedAlerts;

  const [localShowInactiveAlerts, setLocalShowInactiveAlerts] = useState<boolean>(false);
  const activeShowInactiveAlerts = propShowInactiveAlerts !== undefined ? propShowInactiveAlerts : localShowInactiveAlerts;
  const updateShowInactiveAlerts = propSetShowInactiveAlerts !== undefined ? propSetShowInactiveAlerts : setLocalShowInactiveAlerts;

  const [pulseActive, setPulseActive] = useState<boolean>(false);
  const [visibleMediaEvents, setVisibleMediaEvents] = useState<{ [eventId: string]: boolean }>({});
  const [activeMediaIndexes, setActiveMediaIndexes] = useState<{ [eventId: string]: number }>({});
  const [activeMediaTabs, setActiveMediaTabs] = useState<{ [eventId: string]: "images" | "videos" | "audios" | "texts" }>({});
  
  // Downloading on-demand state
  const [downloadingEvents, setDownloadingEvents] = useState<{ [eventId: string]: boolean }>({});
  const [downloadProgress, setDownloadProgress] = useState<{ [eventId: string]: string }>({});
  const [failedImages, setFailedImages] = useState<{ [url: string]: boolean }>({});
  const [fallbackUrls, setFallbackUrls] = useState<{ [url: string]: string }>({});

  const [exportingZip, setExportingZip] = useState<boolean>(false);
  const [exportProgress, setExportProgress] = useState<string>("");

  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(50);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [sectorFilter, typeFilter, userFilter, startDateFilter, endDateFilter, selectedAlertId, selectedRouteId, alertSearchTerm]);

  const prevEventsCount = useRef<number>(events.length);

  const getProxiedUrl = (url: string): string => {
    if (!url) return "";
    if (fallbackUrls[url]) {
      return fallbackUrls[url];
    }
    if (
      url.startsWith("data:") || 
      url.startsWith("blob:") || 
      url.startsWith("content:") || 
      !url.startsWith("http")
    ) {
      return url;
    }
    return `${getApiProxyBase()}?url=${encodeURIComponent(url)}`;
  };

  const getImageDisplaySrc = (url: string): string => {
    if (!url) return "";
    // If a fallback URL has been set (e.g. proxy because direct load failed), use it.
    if (fallbackUrls[url]) {
      return fallbackUrls[url];
    }
    // Try to load standard HTTP/HTTPS URLs directly in the browser first.
    // Standard <img> tags do not require CORS and bypass container backend network restrictions.
    return url;
  };

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

  const getVideosList = (alert: Event): string[] => {
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

  const getAudiosList = (alert: Event): string[] => {
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

  const getTextsList = (alert: Event): string[] => {
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

  const handleDownloadMedia = async (alert: Event) => {
    // Avoid double trigger
    if (downloadingEvents[alert.id]) return;

    // Check if there is anything remote to download
    const imagesList = getImagesList(alert);
    const videosList = getVideosList(alert);
    const audiosList = getAudiosList(alert);
    const allUrls = [...imagesList, ...videosList, ...audiosList];
    const needsDownload = allUrls.some(url => url && !url.startsWith("data:") && !url.startsWith("blob:") && !url.startsWith("content:"));

    if (!needsDownload) {
      return; // Already fully converted to local base64
    }

    setDownloadingEvents(prev => ({ ...prev, [alert.id]: true }));
    setDownloadProgress(prev => ({ ...prev, [alert.id]: "Iniciando download..." }));

    try {
      await localDb.init();
      const updatedEvent = { ...alert };
      const downloadedUrls: string[] = (updatedEvent as any).downloadedUrls || [];
      let anyNewDownloaded = false;

      const downloadList = async (list: string[] | undefined, label: string) => {
        if (!list || !Array.isArray(list)) return;
        for (let i = 0; i < list.length; i++) {
          const url = list[i];
          if (url && !url.startsWith("data:") && !url.startsWith("blob:") && !url.startsWith("content:")) {
            if (downloadedUrls.includes(url)) {
              continue;
            }
            setDownloadProgress(prev => ({ 
              ...prev, 
              [alert.id]: `Sincronizando ${label} (${i + 1}/${list.length})...` 
            }));
            try {
              const base64 = await convertUrlToBase64(url);
              if (base64 !== url) {
                if (!downloadedUrls.includes(url)) {
                  downloadedUrls.push(url);
                  anyNewDownloaded = true;
                }
              }
            } catch (error: any) {
              if (error.message === "NOT_FOUND") {
                if (!downloadedUrls.includes(url)) {
                  downloadedUrls.push(url);
                  anyNewDownloaded = true;
                }
              }
            }
          }
        }
      };

      if (imagesList.length > 0) {
        await downloadList(imagesList, "Imagens");
      }
      
      if (alert.media && alert.media.length > 0) {
        await downloadList(alert.media, "Arquivos");
      }

      if (videosList.length > 0) {
        await downloadList(videosList, "Vídeos");
      }

      if (audiosList.length > 0) {
        await downloadList(audiosList, "Áudios");
      }

      if (anyNewDownloaded || downloadedUrls.length !== ((alert as any).downloadedUrls || []).length) {
        (updatedEvent as any).downloadedUrls = downloadedUrls;
        await localDb.put("events", updatedEvent);
        setDownloadProgress(prev => ({ ...prev, [alert.id]: "Salvo com sucesso no IndexedDB local!" }));
        // Let's call background sync convert helper to notify other modules
        SyncManager.convertAllEventsMediaToBase64();
        // Immediately notify state listeners to trigger reactive re-render
        SyncManager.notifyChange();
      } else {
        setDownloadProgress(prev => ({ ...prev, [alert.id]: "Anexos já estão em cache local." }));
      }
    } catch (err: any) {
      console.error("Error downloading alert media:", err);
      setDownloadProgress(prev => ({ ...prev, [alert.id]: "Falha: " + err.message }));
    } finally {
      setTimeout(() => {
        setDownloadingEvents(prev => ({ ...prev, [alert.id]: false }));
        setDownloadProgress(prev => ({ ...prev, [alert.id]: "" }));
      }, 2000);
    }
  };

  const handleToggleMedia = (eventId: string) => {
    const isShowing = !visibleMediaEvents[eventId];
    setVisibleMediaEvents((prev) => ({
      ...prev,
      [eventId]: isShowing,
    }));
    setActiveMediaIndexes((prev) => ({
      ...prev,
      [eventId]: 0,
    }));

    if (isShowing) {
      const alert = events.find(e => e.id === eventId);
      if (alert) {
        handleDownloadMedia(alert);
      }
    }
  };

  const getMediaUrls = (alert: Event): string[] => {
    if (!alert) return [];
    const possibleMedia = alert.media || (alert as any).medias || (alert as any).mediaUrls || (alert as any).photos || (alert as any).images;
    if (Array.isArray(possibleMedia)) {
      return possibleMedia.filter((item: any) => typeof item === "string");
    }
    if (typeof possibleMedia === "string" && possibleMedia.trim() !== "") {
      return [possibleMedia];
    }
    return [];
  };
  const prevLogsCount = useRef<number>(logs.length);

  // Play alarm sound and trigger alert pulse when count changes
  useEffect(() => {
    // If we got a new alert/emergency log or a new event
    const newEventReceived = events.length > prevEventsCount.current;
    const newAlertLogReceived = logs.filter(l => l.eventType === "alerta" || l.eventType === "emergência").length > prevLogsCount.current;

    if (newEventReceived || newAlertLogReceived) {
      setPulseActive(true);

      // Sound play
      if (!muted) {
        try {
          const context = new (window.AudioContext || (window as any).webkitAudioContext)();
          const osc = context.createOscillator();
          const gain = context.createGain();

          osc.type = "sine";
          // High-pitch dual security tone
          osc.frequency.setValueAtTime(587.33, context.currentTime); // D5
          osc.frequency.setValueAtTime(880, context.currentTime + 0.15); // A5

          gain.gain.setValueAtTime(0.15, context.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, context.currentTime + 0.4);

          osc.connect(gain);
          gain.connect(context.destination);

          osc.start();
          osc.stop(context.currentTime + 0.4);
        } catch (e) {
          console.error("Audio playback blocked or failed:", e);
        }
      }

      // Reset pulse effect after 4 seconds
      const timer = setTimeout(() => {
        setPulseActive(false);
      }, 4000);

      prevEventsCount.current = events.length;
      prevLogsCount.current = logs.length;

      return () => clearTimeout(timer);
    }
  }, [events, logs, muted]);

  // Extract unique sectors for filters
  const allSectors = Array.from(new Set(events.map((e) => e.sector).filter(Boolean)));

  // Extract unique users for filters
  const allUsers = Array.from(new Set(events.map((e) => e.userName || e.userId).filter(Boolean)));

  // Combine events and logs for unified feed
  const activeAlerts = events.filter((ev) => activeShowInactiveAlerts || !activeResolvedAlerts.includes(ev.id));

  // Filtering
  const filteredAlerts = activeAlerts.filter((ev) => {
    if (selectedAlertId && ev.id !== selectedAlertId) {
      return false;
    }
    if (selectedRouteId && ev.routeId !== selectedRouteId) {
      return false;
    }

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

  // Pagination bounds calculation
  const totalPages = Math.ceil(filteredAlerts.length / pageSize) || 1;
  const activePage = Math.min(currentPage, totalPages);
  const paginatedAlerts = filteredAlerts.slice((activePage - 1) * pageSize, activePage * pageSize);

  // Helper for generating page numbers
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisible = 5;
    
    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      pages.push(1);
      const start = Math.max(2, activePage - 1);
      const end = Math.min(totalPages - 1, activePage + 1);
      if (start > 2) {
        pages.push("...");
      }
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
      if (end < totalPages - 1) {
        pages.push("...");
      }
      pages.push(totalPages);
    }
    return pages;
  };

  const sosAlertsCount = filteredAlerts.filter((ev) => !activeResolvedAlerts.includes(ev.id) && ev.observacao.toLowerCase().includes("sos")).length;
  const uniqueSectorsWithAlert = Array.from(new Set(filteredAlerts.filter((ev) => !activeResolvedAlerts.includes(ev.id)).map((ev) => ev.sector).filter(Boolean))).length;
  const uniqueUsersWithAlert = Array.from(new Set(filteredAlerts.filter((ev) => !activeResolvedAlerts.includes(ev.id)).map((ev) => ev.userName || ev.userId).filter(Boolean))).length;

  const handleResolve = (id: string) => {
    updateResolvedAlerts((prev) => [...prev, id]);
    if (onResolveAlert) onResolveAlert(id);
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

  return (
    <div className={`bg-white rounded-2xl border p-6 shadow-lg transition-all duration-500 h-full flex flex-col ${
      pulseActive ? "border-rose-500 ring-2 ring-rose-500/20" : "border-slate-200"
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Bell className={`w-5 h-5 ${pulseActive ? "text-rose-500 animate-bounce" : "text-rose-500"}`} />
            {filteredAlerts.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-rose-500 w-2 h-2 rounded-full animate-ping" />
            )}
          </div>
          <h2 className="text-lg font-bold text-slate-900">Centro de Alertas Ativos</h2>
        </div>

        {/* Actions (Export & Audio) */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Toggle Inactive Alerts */}
          <button
            onClick={() => updateShowInactiveAlerts(!activeShowInactiveAlerts)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-mono font-bold border transition-all cursor-pointer ${
              activeShowInactiveAlerts
                ? "bg-purple-50 text-purple-600 border-purple-200 hover:bg-purple-100"
                : "bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200/50"
            }`}
            title={activeShowInactiveAlerts ? "Ocultar Alertas Resolvidos" : "Mostrar Alertas Resolvidos"}
          >
            {activeShowInactiveAlerts ? (
              <>
                <CheckCircle className="w-3.5 h-3.5 text-purple-500 animate-pulse" /> Mostrando Resolvidos
              </>
            ) : (
              <>
                <Eye className="w-3.5 h-3.5" /> Ocultando Resolvidos
              </>
            )}
          </button>

          {/* Audio Alert Toggles */}
          <button
            onClick={() => setMuted(!muted)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-mono font-bold border transition-all cursor-pointer ${
              muted
                ? "bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200/50"
                : "bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100"
            }`}
          >
            {muted ? (
              <>
                <VolumeX className="w-3.5 h-3.5" /> Sons Desativados
              </>
            ) : (
              <>
                <Volume2 className="w-3.5 h-3.5 animate-pulse" /> Sons Ativos
              </>
            )}
          </button>

          {/* Export Attachments ZIP Button */}
          <button
            onClick={handleExportAttachments}
            disabled={exportingZip}
            className="bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-400 disabled:cursor-not-allowed text-white font-bold text-xs px-3 py-1.5 rounded-full border border-cyan-500 transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
            title="Exportar todos os arquivos anexos dos alertas filtrados em formato ZIP"
          >
            {exportingZip ? (
              <>
                <span className="animate-spin inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full" />
                {exportProgress || "Exportando..."}
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
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-3 py-1.5 rounded-full border border-emerald-500 transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
            title="Exportar alertas operacionais formatados para o padrão de 26 colunas SIMUC/ICMBio"
          >
            <Download className="w-3.5 h-3.5" /> Exportar SIMUC (CSV)
          </button>
        </div>
      </div>

      {/* Stats Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-150 flex items-center justify-between shadow-sm">
          <div>
            <p className="text-[10px] uppercase font-mono tracking-wider text-slate-500 font-bold">Alertas Ativos</p>
            <p className="text-2xl font-black text-slate-800">{filteredAlerts.filter((ev) => !activeResolvedAlerts.includes(ev.id)).length}</p>
          </div>
          <Bell className="w-7 h-7 text-rose-500/50" />
        </div>

        <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-150 flex items-center justify-between shadow-sm">
          <div>
            <p className="text-[10px] uppercase font-mono tracking-wider text-slate-500 font-bold">Alertas SOS</p>
            <p className="text-2xl font-black text-rose-600">{sosAlertsCount}</p>
          </div>
          <AlertTriangle className="w-7 h-7 text-rose-600/50" />
        </div>

        <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-150 flex items-center justify-between shadow-sm">
          <div>
            <p className="text-[10px] uppercase font-mono tracking-wider text-slate-500 font-bold">Setores Afetados</p>
            <p className="text-2xl font-black text-slate-800">{uniqueSectorsWithAlert}</p>
          </div>
          <Compass className="w-7 h-7 text-blue-500/50" />
        </div>

        <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-150 flex items-center justify-between shadow-sm">
          <div>
            <p className="text-[10px] uppercase font-mono tracking-wider text-slate-500 font-bold">Usuários Notificados</p>
            <p className="text-2xl font-black text-slate-800">{uniqueUsersWithAlert}</p>
          </div>
          <UserIcon className="w-7 h-7 text-amber-500/50" />
        </div>
      </div>

      {/* Advanced Filter Panel */}
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-3 mb-4 space-y-3">
        {/* Search Input Box */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-slate-500 uppercase font-mono block">
            Busca Inteligente (Operadores: E, OU, NÃO)
          </label>
          <div className="relative">
            <input
              id="alerts-search-input"
              type="text"
              placeholder='Exemplo: "anta E onça" (ambas), "anta OU onça" (qualquer uma), "NÃO onça" (exclui onça)'
              value={alertSearchTerm}
              onChange={(e) => setAlertSearchTerm(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-lg py-2 px-3 pl-9 text-[11px] text-slate-700 placeholder-slate-400 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500/35 transition-all font-sans shadow-sm"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
          {/* Sector Filter */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase font-mono block">Filtrar por setor</label>
            <div className="relative">
              <select
                id="alerts-filter-sector"
                value={sectorFilter}
                onChange={(e) => setSectorFilter(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg py-1 px-2 pl-7 text-[11px] text-slate-700 focus:outline-none focus:border-rose-500 transition-all font-sans appearance-none cursor-pointer shadow-sm"
              >
                <option value="todos">Todos os Setores</option>
                {allSectors.map((sec) => (
                  <option key={sec} value={sec}>{sec}</option>
                ))}
              </select>
              <Compass className="w-3 h-3 text-slate-400 absolute left-2 top-2 pointer-events-none" />
            </div>
          </div>

          {/* User Filter */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase font-mono block">Filtrar por usuário</label>
            <div className="relative">
              <select
                id="alerts-filter-user"
                value={userFilter}
                onChange={(e) => setUserFilter(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg py-1 px-2 pl-7 text-[11px] text-slate-700 focus:outline-none focus:border-rose-500 transition-all font-sans appearance-none cursor-pointer shadow-sm"
              >
                <option value="todos">Todos os usuários</option>
                {allUsers.map((user) => {
                  const dbUser = users.find((u) => u.login === user || u.id === user);
                  const displayLabel = dbUser ? `${dbUser.name} (${dbUser.login})` : user;
                  return (
                    <option key={user} value={user}>{displayLabel}</option>
                  );
                })}
              </select>
              <UserIcon className="w-3 h-3 text-slate-400 absolute left-2 top-2 pointer-events-none" />
            </div>
          </div>

          {/* Date Start Filter */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase font-mono block">Data Inicial</label>
            <div className="relative">
              <input
                id="alerts-filter-start-date"
                type="date"
                value={startDateFilter}
                onChange={(e) => setStartDateFilter(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg py-1 px-2 pl-7 text-[11px] text-slate-700 focus:outline-none focus:border-rose-500 transition-all font-sans cursor-pointer shadow-sm"
              />
              <Calendar className="w-3 h-3 text-slate-400 absolute left-2 top-2 pointer-events-none" />
            </div>
          </div>

          {/* Date End Filter */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase font-mono block">Data Final</label>
            <div className="relative">
              <input
                id="alerts-filter-end-date"
                type="date"
                value={endDateFilter}
                onChange={(e) => setEndDateFilter(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg py-1 px-2 pl-7 text-[11px] text-slate-700 focus:outline-none focus:border-rose-500 transition-all font-sans cursor-pointer shadow-sm"
              />
              <Calendar className="w-3 h-3 text-slate-400 absolute left-2 top-2 pointer-events-none" />
            </div>
          </div>

          {/* Alert Type Filter */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase font-mono block">Tipo de Alerta</label>
            <div className="relative">
              <select
                id="alerts-filter-type"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg py-1 px-2 pl-7 text-[11px] text-slate-700 focus:outline-none focus:border-rose-500 transition-all font-sans appearance-none cursor-pointer shadow-sm"
              >
                <option value="todos">Todos Eventos</option>
                <option value="sos">Apenas SOS / Emergências</option>
              </select>
              <Filter className="w-3 h-3 text-slate-400 absolute left-2 top-2 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Clear Filter Button */}
        {(sectorFilter !== "todos" || typeFilter !== "todos" || userFilter !== "todos" || startDateFilter !== "" || endDateFilter !== "" || selectedAlertId || selectedRouteId || alertSearchTerm !== "") && (
          <div className="flex justify-end pt-1">
            <button
              onClick={() => {
                setSectorFilter("todos");
                setTypeFilter("todos");
                setUserFilter("todos");
                setStartDateFilter("");
                setEndDateFilter("");
                setAlertSearchTerm("");
                if (selectedAlertId && onClearSelectedAlertId) onClearSelectedAlertId();
                if (selectedRouteId && onClearSelectedRouteId) onClearSelectedRouteId();
              }}
              className="text-[10px] font-bold text-rose-500 hover:text-rose-700 transition-colors uppercase font-mono flex items-center gap-1 cursor-pointer"
            >
              <span>✕ Limpar Filtros</span>
            </button>
          </div>
        )}
      </div>

      {/* Map selection filter banner */}
      {(selectedAlertId || selectedRouteId) && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 mb-4 flex items-center justify-between text-xs text-purple-950 animate-fade-in shadow-sm">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
            </span>
            <span>
              {selectedAlertId ? (
                <>Mostrando apenas o <strong>alerta selecionado no mapa</strong>.</>
              ) : (
                <>Mostrando apenas alertas da <strong>rota selecionada no mapa</strong>.</>
              )}
            </span>
          </div>
          <button
            onClick={() => {
              if (selectedAlertId && onClearSelectedAlertId) onClearSelectedAlertId();
              if (selectedRouteId && onClearSelectedRouteId) onClearSelectedRouteId();
            }}
            className="text-[10px] font-extrabold uppercase font-mono text-purple-600 hover:text-purple-800 underline pl-2 cursor-pointer"
          >
            Mostrar todos
          </button>
        </div>
      )}

      {/* Feed Area */}
      <div className="flex-grow overflow-y-auto space-y-3 custom-scrollbar pr-1 max-h-[360px]">
        {filteredAlerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-slate-400">
            <CheckCircle className="w-10 h-10 text-emerald-500/40 mb-2" />
            <p className="text-sm font-semibold">Nenhum alerta ativo no momento</p>
            <p className="text-xs text-slate-400 mt-1">Central sob controle seguro</p>
          </div>
        ) : (
          paginatedAlerts.map((alert) => {
            const isResolved = activeResolvedAlerts.includes(alert.id);
            const isSos = alert.observacao.toLowerCase().includes("sos") || alert.sector.toLowerCase().includes("avulso");
            
            let cardBgClass = "bg-amber-50 border-amber-200/80 text-amber-950";
            if (isResolved) {
              cardBgClass = "bg-slate-50 border-slate-200 text-slate-500 opacity-75";
            } else if (isSos) {
              cardBgClass = "bg-rose-50 border-rose-200/80 text-rose-950";
            }
            
            return (
              <div
                key={alert.id}
                className={`p-4 rounded-xl border relative overflow-hidden transition-all duration-300 ${cardBgClass}`}
              >
                {/* Visual red flash marker on SOS */}
                {isSos && !isResolved && (
                  <div className="absolute top-0 left-0 w-1.5 h-full bg-rose-500 animate-pulse" />
                )}

                {/* Body */}
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1.5 min-w-0 flex-grow">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex items-center gap-1 text-[10px] uppercase font-bold font-mono px-2 py-0.5 rounded-full ${
                        isResolved
                          ? "bg-slate-200 text-slate-600"
                          : isSos 
                          ? "bg-rose-100 text-rose-700" 
                          : "bg-amber-100 text-amber-700"
                      }`}>
                        {isResolved ? (
                          <CheckCircle className="w-3 h-3" />
                        ) : isSos ? (
                          <ShieldAlert className="w-3 h-3" />
                        ) : (
                          <AlertTriangle className="w-3 h-3" />
                        )}
                        {isResolved ? "Resolvido" : isSos ? "Emergência" : "Alerta de Ronda"}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {alert.date} às {alert.hour}
                      </span>
                    </div>

                    <h3 className={`text-sm font-bold font-sans leading-snug ${isResolved ? "text-slate-600 line-through" : "text-slate-900"}`}>
                      Setor: {alert.sector}
                    </h3>

                    <p className={`text-xs leading-relaxed font-medium ${isResolved ? "text-slate-500" : "text-slate-800"}`}>
                      Ocorrência: <span className="font-bold">"{alert.observacao}"</span>
                    </p>

                    {alert.notes && (
                      <p className="text-xs text-slate-500 border-l border-slate-200 pl-2 italic">
                        Nota: {alert.notes}
                      </p>
                    )}

                    <div className="flex items-center gap-2 pt-1 text-[10px] text-slate-400 font-mono">
                      <span>Usuário: <strong className="text-slate-600">@{alert.userName}</strong></span>
                      <span>•</span>
                      <span>Veículo: <strong className="text-slate-600">{alert.vehicle}</strong></span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-col gap-2 flex-shrink-0 w-24">
                    {isResolved ? (
                      <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] py-1.5 rounded-lg font-extrabold text-center flex items-center justify-center gap-1 uppercase font-mono shadow-xs select-none">
                        <CheckCircle className="w-3 h-3" /> Resolvido
                      </div>
                    ) : (
                      <button
                        onClick={() => handleResolve(alert.id)}
                        className="bg-slate-900 hover:bg-emerald-600 border border-transparent hover:border-emerald-500 text-xs px-3 py-1.5 rounded-lg text-white font-bold transition-all cursor-pointer shadow-sm text-center w-full focus:outline-none"
                      >
                        Resolver
                      </button>
                    )}
                    <button
                      onClick={() => handleToggleMedia(alert.id)}
                      className={`text-[11px] px-2.5 py-1.5 rounded-lg font-bold transition-all cursor-pointer shadow-sm text-center flex items-center justify-center gap-1 border w-full ${
                        visibleMediaEvents[alert.id]
                          ? "bg-slate-200 text-slate-800 border-slate-300"
                          : "bg-white hover:bg-slate-50 text-slate-700 border-slate-200"
                      }`}
                    >
                      <Eye className="w-3 h-3 text-slate-500" />
                      Visualizar
                    </button>
                  </div>
                </div>

                 {/* Media Carousel Panel with Relational Sub-collections and Permission Checking */}
                {visibleMediaEvents[alert.id] && (
                  <AlertMediaSection
                    alert={alert}
                    users={users}
                    activeMediaTabs={activeMediaTabs}
                    setActiveMediaTabs={setActiveMediaTabs}
                    activeMediaIndexes={activeMediaIndexes}
                    setActiveMediaIndexes={setActiveMediaIndexes}
                    failedImages={failedImages}
                    setFailedImages={setFailedImages}
                    fallbackUrls={fallbackUrls}
                    setFallbackUrls={setFallbackUrls}
                    getImageDisplaySrc={getImageDisplaySrc}
                    getProxiedUrl={getProxiedUrl}
                    downloadingEvents={downloadingEvents}
                    downloadProgress={downloadProgress}
                    handleDownloadMedia={handleDownloadMedia}
                  />
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Pagination & Page Size Control Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-4 pt-4 border-t border-slate-150 text-xs">
        {/* Left: Page Size Selector */}
        <div className="flex items-center gap-2 text-slate-500">
          <span>Alertas por página:</span>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setCurrentPage(1);
            }}
            className="bg-white border border-slate-250 rounded-lg py-1 px-2.5 text-xs text-slate-700 font-bold focus:outline-none focus:border-rose-500 cursor-pointer shadow-sm"
          >
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={500}>500</option>
            <option value={1000}>1000</option>
          </select>
          <span className="text-slate-400 font-mono">
            • Mostrando {filteredAlerts.length === 0 ? 0 : (activePage - 1) * pageSize + 1}-{Math.min(filteredAlerts.length, activePage * pageSize)} de {filteredAlerts.length}
          </span>
        </div>

        {/* Right: Numbered Pagination Buttons */}
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={activePage === 1}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed font-medium transition-all"
            >
              Anterior
            </button>
            
            {getPageNumbers().map((pageNum, idx) => {
              if (pageNum === "...") {
                return (
                  <span key={`dots-${idx}`} className="px-2 py-1 text-slate-400 font-mono">
                    ...
                  </span>
                );
              }
              return (
                <button
                  key={`page-${pageNum}`}
                  onClick={() => setCurrentPage(Number(pageNum))}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-bold font-mono transition-all cursor-pointer ${
                    activePage === pageNum
                      ? "bg-rose-600 text-white border-transparent"
                      : "bg-white hover:bg-slate-50 text-slate-700 border-slate-200"
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}

            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={activePage === totalPages}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed font-medium transition-all"
            >
              Próximo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
