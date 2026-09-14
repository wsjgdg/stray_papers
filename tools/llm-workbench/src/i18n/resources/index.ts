import { zh } from './zh';
import { en } from './en';

// All locales aggregated here. Add a new language by importing its map and
// appending it to this object — key sets must match across locales.
export const resources = { zh, en } as const;

export type ResourceKey = keyof typeof zh;
export type Resources = typeof resources;
