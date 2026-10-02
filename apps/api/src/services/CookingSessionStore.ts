import { SessionState } from '../types';
import { randomUUID } from 'crypto';

const TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

/**
 * CookingSessionStore — in-memory session store for Workflow 3 (Cooking Assistant).
 *
 * Sessions are keyed by UUID and expire after 2 hours of inactivity.
 * Sessions are lost on server restart — acceptable for Phase 1.
 * Phase 5 upgrade: replace with Redis for persistence.
 */
const sessions = new Map<string, SessionState>();

// Auto-expire idle sessions every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (now - session.lastActivityAt.getTime() > TTL_MS) {
      sessions.delete(id);
      console.log(`[CookingSessionStore] Expired session: ${id}`);
    }
  }
}, 10 * 60 * 1000);

const CookingSessionStore = {
  create(state: Omit<SessionState, 'lastActivityAt'>): string {
    const id = randomUUID();
    sessions.set(id, {
      ...state,
      lastActivityAt: new Date(),
    });
    return id;
  },

  get(id: string): SessionState | undefined {
    return sessions.get(id);
  },

  update(id: string, updates: Partial<SessionState>): boolean {
    const session = sessions.get(id);
    if (!session) return false;
    sessions.set(id, { ...session, ...updates, lastActivityAt: new Date() });
    return true;
  },

  delete(id: string): boolean {
    const session = sessions.get(id);
    if (session) {
      // Mark as abandoned before removal
      sessions.set(id, { ...session, sessionStatus: 'abandoned' });
    }
    return sessions.delete(id);
  },

  touch(id: string): void {
    const session = sessions.get(id);
    if (session) sessions.set(id, { ...session, lastActivityAt: new Date() });
  },
};

export default CookingSessionStore;
