/// <reference types="vite/client" />

// Import SQL schema as a raw string (used by db/migrate.ts).
declare module "*.sql?raw" {
  const content: string;
  export default content;
}

interface ImportMetaEnv {
  readonly VITE_FORCE_MOCK?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
