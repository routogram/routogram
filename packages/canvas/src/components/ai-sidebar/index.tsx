import { ArrowUp, Loader2, Plus, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ModelSelectorPopover } from "@/components/model-selector-popover";
import { askArchitectureAi, fetchAiProviders } from "@/lib/apis";
import { type ModelOption, useAiSettingsStore } from "@/stores/use-ai-settings-store";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type ChatSession = {
  id: string;
  title: string;
  input: string;
  messages: ChatMessage[];
  pending: boolean;
  error: string | null;
};

type AiSidebarProps = {
  isOpen: boolean;
  onClose: () => void;
};

const WELCOME =
  "I can inspect the current topology. Ask about component relationships, dead code, route health, or where a boundary is leaking.";

let sequence = 0;

function nextId(prefix: string): string {
  sequence += 1;
  return `${prefix}-${Date.now()}-${sequence}`;
}

function createSession(): ChatSession {
  return {
    id: nextId("session"),
    title: "New chat",
    input: "",
    messages: [],
    pending: false,
    error: null,
  };
}

export function AiSidebar({ isOpen, onClose }: AiSidebarProps) {
  const [sessions, setSessions] = useState<ChatSession[]>(() => [createSession()]);
  const [activeId, setActiveId] = useState(() => sessions[0]?.id ?? "");
  const [providers, setProviders] = useState<ModelOption[]>([]);
  const [providerError, setProviderError] = useState<string | null>(null);
  const selectedModel = useAiSettingsStore((state) => state.selectedModel);
  const effort = useAiSettingsStore((state) => state.effort);
  const setModel = useAiSettingsStore((state) => state.setModel);
  const setEffort = useAiSettingsStore((state) => state.setEffort);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const activeSession = sessions.find((session) => session.id === activeId) ?? sessions[0];
  const messageCount = activeSession?.messages.length ?? 0;
  const pending = activeSession?.pending ?? false;
  const canSend = providers.length > 0;

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    textareaRef.current?.focus();
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let cancelled = false;
    setProviderError(null);
    fetchAiProviders()
      .then((payload) => {
        if (cancelled) {
          return;
        }
        const options: ModelOption[] = payload.providers.map((provider) => ({
          id: provider.id,
          name: provider.name,
          provider: provider.provider,
          ...(provider.defaultEffort ? { defaultEffort: provider.defaultEffort } : {}),
        }));
        setProviders(options);
        const current = useAiSettingsStore.getState().selectedModel;
        const valid = options.find((provider) => provider.id === current.id);
        const fallback = options.find((provider) => provider.id === payload.default) ?? options[0];
        if (!valid && fallback) {
          setModel(fallback);
          setEffort(fallback.defaultEffort ?? "Low");
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setProviderError(cause instanceof Error ? cause.message : String(cause));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, setEffort, setModel]);

  useEffect(() => {
    if (messageCount === 0 && !pending) {
      return;
    }
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messageCount, pending]);

  function updateSession(id: string, update: (session: ChatSession) => ChatSession): void {
    setSessions((current) =>
      current.map((session) => (session.id === id ? update(session) : session)),
    );
  }

  function resizeInput(): void {
    const element = textareaRef.current;
    if (!element) {
      return;
    }
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 128)}px`;
  }

  function addSession(): void {
    const session = createSession();
    setSessions((current) => [...current, session]);
    setActiveId(session.id);
  }

  function closeSession(id: string): void {
    if (sessions.length === 1) {
      const replacement = createSession();
      setSessions([replacement]);
      setActiveId(replacement.id);
      return;
    }

    const index = sessions.findIndex((session) => session.id === id);
    const next = sessions.filter((session) => session.id !== id);
    setSessions(next);
    if (activeId === id) {
      setActiveId(next[Math.max(0, index - 1)]?.id ?? next[0]?.id ?? "");
    }
  }

  async function sendMessage(): Promise<void> {
    const session = activeSession;
    const question = session?.input.trim() ?? "";
    if (!session || !question || session.pending || !canSend) {
      return;
    }

    const sessionId = session.id;
    updateSession(sessionId, (current) => ({
      ...current,
      input: "",
      pending: true,
      error: null,
      title: current.title === "New chat" ? question.slice(0, 30) : current.title,
      messages: [...current.messages, { id: nextId("user"), role: "user", content: question }],
    }));
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    try {
      const response = await askArchitectureAi({
        message: question,
        providerId: selectedModel.id,
        effort,
      });
      updateSession(sessionId, (current) => ({
        ...current,
        pending: false,
        messages: [
          ...current.messages,
          { id: nextId("assistant"), role: "assistant", content: response.result.answer },
        ],
      }));
    } catch (cause) {
      updateSession(sessionId, (current) => ({
        ...current,
        pending: false,
        error: cause instanceof Error ? cause.message : String(cause),
      }));
    }
  }

  async function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>): Promise<void> {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      await sendMessage();
    }
  }

  return (
    <aside
      aria-label="Architecture Assistant"
      aria-hidden={!isOpen}
      className={`h-full shrink-0 overflow-hidden bg-[#0c0c0e] transition-[width] duration-300 ease-in-out ${
        isOpen ? "ml-3 w-[380px] border-l border-white/10" : "w-0 border-l-0"
      }`}
    >
      <div className="flex h-full w-[380px] flex-col">
        <header className="flex shrink-0 items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="grid size-8 place-items-center rounded-lg border border-sky-400/20 bg-sky-400/10">
              <Sparkles className="size-3.5 text-sky-300" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">Architecture Assistant</h2>
              <div className="mt-0.5 flex items-center gap-1.5">
                <span className="text-[9px] uppercase tracking-[0.14em] text-zinc-600">
                  Topology-aware
                </span>
                <span className="rounded border border-white/10 bg-white/[0.03] px-1.5 py-0.5 font-mono text-[8px] text-zinc-500">
                  {selectedModel.name}
                </span>
                <span className="text-[8px] text-zinc-700">{effort}</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Architecture Assistant"
            className="grid size-7 place-items-center rounded-lg text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-200"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-white/10 px-2 py-1.5">
          {sessions.map((session) => (
            <div
              key={session.id}
              className={`flex min-w-0 max-w-44 shrink-0 items-center rounded-lg text-[10px] transition-colors ${
                session.id === activeSession?.id
                  ? "bg-white/10 text-zinc-100"
                  : "text-zinc-500 hover:bg-white/5 hover:text-zinc-300"
              }`}
            >
              <button
                type="button"
                onClick={() => setActiveId(session.id)}
                className="min-w-0 flex-1 truncate px-2.5 py-1.5 text-left"
                title={session.title}
              >
                {session.title}
              </button>
              <button
                type="button"
                onClick={() => closeSession(session.id)}
                aria-label={`Close ${session.title}`}
                className="mr-1 grid size-4 shrink-0 place-items-center rounded text-zinc-600 hover:bg-white/10 hover:text-zinc-200"
              >
                <X className="size-2.5" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addSession}
            aria-label="New chat tab"
            title="New chat tab"
            className="grid size-6 shrink-0 place-items-center rounded-lg text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-200"
          >
            <Plus className="size-3.5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <Bubble author="assistant" content={WELCOME} />
          {activeSession?.messages.map((message) => (
            <Bubble key={message.id} author={message.role} content={message.content} />
          ))}
          {pending ? (
            <div className="flex items-center gap-2 text-[10px] text-zinc-500">
              <Loader2 className="size-3 animate-spin text-sky-400" />
              Reading topology…
            </div>
          ) : null}
          {activeSession?.error ? (
            <div className="rounded-xl border border-rose-400/20 bg-rose-400/[0.06] px-3 py-2 text-[10px] leading-4 text-rose-200">
              {activeSession.error}
            </div>
          ) : null}
          <div ref={bottomRef} />
        </div>

        <footer className="shrink-0 border-t border-white/10 bg-[#0c0c0e] p-4">
          <div className="mb-2 flex items-center justify-between gap-3 text-xs text-zinc-400">
            <ModelSelectorPopover providers={providers} />
            <div className="flex shrink-0 items-center gap-2">
              {providerError ? (
                <span
                  className="max-w-36 truncate text-[9px] text-rose-300/70"
                  title={providerError}
                >
                  Config unavailable
                </span>
              ) : null}
              {!canSend && !providerError ? (
                <span className="text-[9px] text-amber-400/70">No providers</span>
              ) : null}
              <button
                type="button"
                disabled={!canSend || !activeSession?.input.trim() || pending}
                onClick={() => void sendMessage()}
                aria-label="Send message"
                className="grid size-7 place-items-center rounded-lg bg-sky-400 text-slate-950 transition-colors hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ArrowUp className="size-4" />
              </button>
            </div>
          </div>

          <div className="relative rounded-xl border border-white/10 bg-white/5 transition-colors focus-within:border-cyan-500/50">
            <textarea
              ref={textareaRef}
              value={activeSession?.input ?? ""}
              rows={2}
              onChange={(event) => {
                if (activeSession) {
                  updateSession(activeSession.id, (current) => ({
                    ...current,
                    input: event.target.value,
                  }));
                }
                resizeInput();
              }}
              onKeyDown={(event) => void handleKeyDown(event)}
              placeholder={
                canSend
                  ? "Hỏi về component, dead code, hoặc route…"
                  : "No AI provider configured in .routogramrc.json"
              }
              className="max-h-32 w-full resize-none bg-transparent p-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
            />
          </div>

          <div className="mt-1.5 text-[11px] text-zinc-500">
            Enter to send · Shift+Enter for newline
          </div>
        </footer>
      </div>
    </aside>
  );
}

function Bubble({ author, content }: { author: "user" | "assistant"; content: string }) {
  return (
    <div
      className={`max-w-[92%] rounded-xl border px-3 py-2 text-[11px] leading-5 ${
        author === "user"
          ? "ml-auto border-sky-400/20 bg-sky-400/10 text-sky-50"
          : "border-white/[0.07] bg-white/[0.025] text-zinc-300"
      }`}
    >
      <RichText content={content} />
    </div>
  );
}

function RichText({ content }: { content: string }) {
  const parts = content.split("```");

  return (
    <div className="space-y-2">
      {parts.map((part, index) => {
        if (!part) {
          return null;
        }
        if (index % 2 === 1) {
          const lines = part.split("\n");
          const language = lines[0]?.trim();
          const code =
            language && /^[a-z0-9-]+$/i.test(language) ? lines.slice(1).join("\n") : part;
          return (
            <pre
              key={part}
              className="overflow-x-auto rounded-lg border border-white/[0.06] bg-black/30 p-2 font-mono text-[10px] leading-4 text-zinc-300"
            >
              <code>{code.trim()}</code>
            </pre>
          );
        }
        return (
          <p key={part} className="whitespace-pre-wrap">
            {part.trim()}
          </p>
        );
      })}
    </div>
  );
}
