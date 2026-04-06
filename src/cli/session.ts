import { v4 as uuidv4 } from 'uuid';

export class SessionManager {
  // Generate a fresh session ID for each request
  // The Claude CLI doesn't allow reusing session IDs across concurrent requests
  getSessionKey(userId?: string): string {
    return uuidv4();
  }

  clearSession(userId?: string): void {
    const key = userId || this.defaultSessionKey;
    this.sessionMap.delete(key);
  }

  getAllSessions(): string[] {
    return Array.from(this.sessionMap.values());
  }
}
