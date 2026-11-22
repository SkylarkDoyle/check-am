/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  /** '1' turns on the fixture-driven AI lookup UI (Phase A). */
  readonly VITE_AI_FIXTURES?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
