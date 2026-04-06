import { v4 as uuidv4 } from 'uuid';

export class SessionManager {
  private sessionMap = new Map<string, string>();
  private defaultSessionKey = 'default';

  getSessionKey(userId?: string): string {
    const key = userId || this.defaultSessionKey;
    if (!this.sessionMap.has(key)) {
      this.sessionMap.set(key, `session-${uuidv4()}`);
    }
    return this.sessionMap.get(key)!;
  }

  clearSession(userId?: string): void {
    const key = userId || this.defaultSessionKey;
    this.sessionMap.delete(key);
  }

  getAllSessions(): string[] {
    return Array.from(this.sessionMap.values());
  }
}
