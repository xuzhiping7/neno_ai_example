import { createContext, useContext } from 'react';
import type { Data } from './lib/api';
export type Config = { apiBase: string; apiHost: string; apiPort: number | null; docsUrl: string; port: number; apiConfigured: boolean; keyConfigured: boolean; ownerConfigured: boolean; endpointCount: number; projectEndpointCount: number };
export type Page = 'overview' | 'chat' | 'tasks' | 'files' | 'explorer' | 'history' | 'settings';
export type Workbench = { config: Config; project: Data | null; agents: Data[]; refs: Record<string, string>; setRefs: (refs: Record<string, string>) => void; navigate: (page: Page, endpoint?: string) => void; configure: () => void; refresh: (reset?: boolean) => Promise<void>; notify: (text: string) => void; };
export const WorkbenchContext = createContext<Workbench>(null!);
export const useWorkbench = () => useContext(WorkbenchContext);
