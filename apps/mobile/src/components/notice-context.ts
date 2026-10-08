import { createContext } from 'react';

export type FloatingMessage = { id: string; message: string; error: boolean };
export const NoticeContext = createContext<((notice: FloatingMessage) => void) | null>(null);
