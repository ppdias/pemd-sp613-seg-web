import React, { useState, useRef, useEffect } from "react";
import { LogEntry, Event } from "../types";
import { Send, Bot, User, Sparkles, AlertCircle, RefreshCw } from "lucide-react";

interface IAAssistantProps {
  logs: LogEntry[];
  events: Event[];
}

interface ChatMessage {
  sender: "user" | "assistant";
  text: string;
}

export default function IAAssistant({ logs, events }: IAAssistantProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      sender: "assistant",
      text: "Olá! Sou o assistente de IA da Central SP613-Seg. Posso analisar todos os logs de patrulha e ocorrências de vigilantes em tempo real. Faça-me perguntas como:\n- *'Quantas ocorrências tivemos hoje no Setor B?'*\n- *'Houve algum log de SOS recentemente?'*\n- *'Qual é o resumo das atividades registradas?'*"
    }
  ]);
  const [input, setInput] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const prompt = input.trim();
    if (!prompt || loading) return;

    // Add user message
    setMessages((prev) => [...prev, { sender: "user", text: prompt }]);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          // Send current local logs and events context to make the answer highly factual and accurate!
          logs: logs.slice(0, 50), // Send first 50 latest records to stay within model prompt limits
          events: events.slice(0, 30)
        })
      });

      if (!response.ok) {
        throw new Error("Falha ao comunicar com o servidor do assistente de IA.");
      }

      const data = await response.json();
      setMessages((prev) => [...prev, { sender: "assistant", text: data.reply || "Não consegui obter uma resposta válida." }]);
    } catch (err: any) {
      console.error(err);
      setError("Erro ao processar consulta de IA. Verifique as configurações.");
      setMessages((prev) => [
        ...prev,
        {
          sender: "assistant",
          text: "❌ Ocorreu um erro ao tentar processar sua solicitação no servidor. Verifique se a sua conexão de rede está ativa ou se o serviço de IA está online."
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-lg h-full flex flex-col min-h-[480px]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-purple-600 animate-pulse" />
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-1.5">
            IA Assistant Command Center <Sparkles className="w-4 h-4 text-amber-500 fill-amber-500" />
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="bg-purple-50 text-purple-600 border border-purple-100 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase font-mono tracking-wider">
            Deep Seek conectado
          </span>
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-grow overflow-y-auto space-y-4 mb-4 pr-1 custom-scrollbar min-h-[250px] max-h-[360px]">
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`flex gap-3 max-w-[85%] ${
              msg.sender === "user" ? "ml-auto flex-row-reverse" : "mr-auto"
            }`}
          >
            {/* Avatar */}
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm border ${
              msg.sender === "user"
                ? "bg-cyan-50 border-cyan-200 text-cyan-600"
                : "bg-purple-50 border-purple-200 text-purple-600"
            }`}>
              {msg.sender === "user" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
            </div>

            {/* Bubble */}
            <div className={`p-3.5 rounded-2xl text-sm leading-relaxed whitespace-pre-line ${
              msg.sender === "user"
                ? "bg-cyan-50 text-cyan-900 rounded-tr-none border border-cyan-200"
                : "bg-slate-50 text-slate-800 rounded-tl-none border border-slate-200/80"
            }`}>
              {msg.text}
            </div>
          </div>
        ))}

        {/* Loading state */}
        {loading && (
          <div className="flex gap-3 max-w-[85%] mr-auto items-center">
            <div className="w-8 h-8 rounded-full bg-purple-50 border border-purple-200 text-purple-600 flex items-center justify-center animate-spin">
              <RefreshCw className="w-4 h-4" />
            </div>
            <div className="bg-purple-50/50 border border-purple-100 p-3.5 rounded-2xl text-xs text-purple-700 font-mono animate-pulse">
              IA pensando e analisando {logs.length} logs e {events.length} ocorrências...
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Input form */}
      <form onSubmit={handleSend} className="relative mt-auto">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Pergunte sobre ocorrências, rondas, vigilantes e horários..."
          className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-4 pr-12 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-purple-500 focus:bg-white focus:ring-1 focus:ring-purple-500 transition-all font-sans font-medium"
        />
        <button
          type="submit"
          disabled={!input.trim() || loading}
          className="absolute right-2 top-2 w-8 h-8 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-100 disabled:text-slate-300 text-white rounded-lg flex items-center justify-center transition-all cursor-pointer disabled:cursor-not-allowed"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
