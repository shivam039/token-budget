/** Shape of a message as edited in the playground UI — a superset of AddMessageInput with a required id, so the editor can track rows by identity. */
import type { Role } from '@shivam.dixit/token-budget';

export interface EditableMessage {
  id: string;
  role: Role;
  content: string;
  pinned?: boolean;
  priority?: number;
  toolCallId?: string;
}

export type StrategyName = 'dropOldest' | 'slidingWindow' | 'priority' | 'summarizeOldest';

export interface AppState {
  messages: EditableMessage[];
  maxTokens: number;
  strategy: StrategyName;
}
