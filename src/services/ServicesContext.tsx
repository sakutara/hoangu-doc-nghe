import { createContext, useContext, type ReactNode } from 'react';
import { services as defaultServices, type AppServices } from './appServices';

const Ctx = createContext<AppServices | null>(null);

export function ServicesProvider({ value, children }: { value: AppServices; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useServices(): AppServices {
  return useContext(Ctx) ?? defaultServices;
}
