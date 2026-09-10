import { EscalationRecord, EscalationStatus } from './types';

// In-memory store for session escalations
const sessionEscalationStore = new Map<string, EscalationRecord>();

export function getActiveSessionEscalation(sessionId: string): EscalationRecord | undefined {
  return sessionEscalationStore.get(sessionId);
}

export function saveSessionEscalation(sessionId: string, record: EscalationRecord): void {
  sessionEscalationStore.set(sessionId, record);
}

export function updateSessionEscalationStatus(sessionId: string, status: EscalationStatus): void {
  const existing = sessionEscalationStore.get(sessionId);
  if (existing) {
    existing.status = status;
    sessionEscalationStore.set(sessionId, existing);
  }
}

export function resetEscalationStore(): void {
  sessionEscalationStore.clear();
}
