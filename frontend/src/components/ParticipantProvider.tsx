import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { getWorkshopStatus } from "../api/workshop";
import {
  clearStoredParticipantId,
  getStoredAdminKey,
  getStoredParticipantId,
  normalizeParticipantId,
  setStoredAdminKey,
  setStoredParticipantId,
} from "../lib/participant";
import { Button, Input } from "./ui";

interface ParticipantContextValue {
  workshopMode: boolean;
  participantId: string | null;
  isAdminView: boolean;
  loading: boolean;
  setParticipant: (rawName: string) => void;
  enterAsInstructor: (adminKey: string) => void;
  switchParticipant: () => void;
}

const ParticipantContext = createContext<ParticipantContextValue | null>(null);

export function useParticipant() {
  const ctx = useContext(ParticipantContext);
  if (!ctx) {
    throw new Error("useParticipant must be used within ParticipantProvider");
  }
  return ctx;
}

export function ParticipantProvider({ children }: { children: ReactNode }) {
  const [workshopMode, setWorkshopMode] = useState(false);
  const [participantId, setParticipantId] = useState<string | null>(() => getStoredParticipantId());
  const [adminKey, setAdminKey] = useState<string | null>(() => getStoredAdminKey());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getWorkshopStatus()
      .then((status) => {
        if (!cancelled) {
          setWorkshopMode(status.workshop_mode);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setWorkshopMode(false);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setParticipant = useCallback((rawName: string) => {
    const normalized = normalizeParticipantId(rawName);
    setStoredParticipantId(normalized);
    setParticipantId(normalized);
  }, []);

  const enterAsInstructor = useCallback((key: string) => {
    const trimmed = key.trim();
    setStoredAdminKey(trimmed);
    setAdminKey(trimmed || null);
  }, []);

  const switchParticipant = useCallback(() => {
    clearStoredParticipantId();
    setStoredAdminKey(null);
    setParticipantId(null);
    setAdminKey(null);
  }, []);

  const value = useMemo(
    () => ({
      workshopMode,
      participantId,
      isAdminView: Boolean(adminKey),
      loading,
      setParticipant,
      enterAsInstructor,
      switchParticipant,
    }),
    [workshopMode, participantId, adminKey, loading, setParticipant, enterAsInstructor, switchParticipant],
  );

  const needsGate = workshopMode && !participantId && !adminKey;

  return (
    <ParticipantContext.Provider value={value}>
      {loading ? (
        <div className="flex min-h-screen items-center justify-center bg-ink-50 text-sm text-ink-500">
          Loading…
        </div>
      ) : needsGate ? (
        <ParticipantGate onSubmit={setParticipant} onInstructor={enterAsInstructor} />
      ) : (
        children
      )}
    </ParticipantContext.Provider>
  );
}

function ParticipantGate({
  onSubmit,
  onInstructor,
}: {
  onSubmit: (name: string) => void;
  onInstructor: (adminKey: string) => void;
}) {
  const [name, setName] = useState("");
  const [adminKey, setAdminKey] = useState("");
  const [showInstructor, setShowInstructor] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      if (showInstructor) {
        if (!adminKey.trim()) {
          setError("Enter the instructor admin key.");
          return;
        }
        onInstructor(adminKey);
        return;
      }
      onSubmit(name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid name");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-ink-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-ink-900">Welcome to the workshop</h1>
        <p className="mt-2 text-sm text-ink-500">
          Enter your name so your runs, datasets, and results stay separate from other participants.
        </p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {!showInstructor && (
            <Input
              label="Your name"
              placeholder="e.g. alex or team-3"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
              required={!showInstructor}
            />
          )}
          <button
            type="button"
            className="text-xs font-medium text-accent-600 hover:text-accent-700"
            onClick={() => setShowInstructor((value) => !value)}
          >
            {showInstructor ? "← Back to participant sign-in" : "Instructor? Enter admin key"}
          </button>
          {showInstructor && (
            <Input
              label="Instructor admin key"
              type="password"
              placeholder="Optional — see all participants"
              value={adminKey}
              onChange={(event) => setAdminKey(event.target.value)}
              autoFocus
            />
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full">
            {showInstructor ? "Enter as instructor" : "Continue"}
          </Button>
        </form>
      </div>
    </div>
  );
}
