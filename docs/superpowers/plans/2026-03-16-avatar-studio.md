# Avatar Studio Frontend Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Avatar Studio React app — 3D viewport with Three.js, modular part selector, color customization, photo upload for KI face generation, and text-to-parts input.

**Architecture:** React 18 SPA with Vite, Three.js via @react-three/fiber + drei, Zustand for state, TailwindCSS for UI. Communicates with Avatar API (Plan 1) via REST. Runs on `avatar.reisendescasino.de`.

**Tech Stack:** React 18, Vite, Three.js (r160+), @react-three/fiber, @react-three/drei, Zustand, TailwindCSS, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-16-4k-avatar-studio-design.md`

---

## File Structure

```
avatar-studio/
├── package.json
├── vite.config.ts
├── tailwind.config.js
├── tsconfig.json
├── index.html
├── public/
│   └── hdri/               # HDRI environment maps for lighting
├── src/
│   ├── main.tsx
│   ├── App.tsx              # Main layout (sidebar 70/30)
│   ├── api/
│   │   └── client.ts        # API client for Avatar API
│   ├── store/
│   │   └── avatar.ts        # Zustand store (selected parts, colors, gender)
│   ├── components/
│   │   ├── Viewport.tsx      # Three.js canvas wrapper
│   │   ├── AvatarModel.tsx   # Loads basis mesh + attaches selected parts
│   │   ├── PartSelector.tsx  # Category list + part grid
│   │   ├── ColorPicker.tsx   # Skin/eye/hair color controls
│   │   ├── PhotoUpload.tsx   # Photo upload for KI face generation
│   │   ├── TextInput.tsx     # Text description → parts via Claude
│   │   ├── LightingPresets.tsx  # Casino/Outdoor/Studio lighting
│   │   └── SaveButton.tsx    # Save avatar to API
│   ├── hooks/
│   │   └── useAvatar.ts      # Hook connecting store to API
│   └── types.ts              # Shared types
└── tests/
    ├── setup.ts
    ├── store.test.ts
    ├── api.test.ts
    └── components.test.tsx
```

---

## Chunk 1: Project Setup

### Task 1: Vite + React + TypeScript + Tailwind Init

**Files:**
- Create: `avatar-studio/package.json`
- Create: `avatar-studio/vite.config.ts`
- Create: `avatar-studio/tailwind.config.js`
- Create: `avatar-studio/tsconfig.json`
- Create: `avatar-studio/tsconfig.node.json`
- Create: `avatar-studio/postcss.config.js`
- Create: `avatar-studio/index.html`
- Create: `avatar-studio/src/main.tsx`
- Create: `avatar-studio/src/index.css`

- [ ] **Step 1: Scaffold Vite project**

```bash
cd avatar-studio/..
npm create vite@latest avatar-studio -- --template react-ts
cd avatar-studio
```

- [ ] **Step 2: Install dependencies**

```bash
cd avatar-studio
npm install three @react-three/fiber @react-three/drei zustand tailwindcss @tailwindcss/vite
npm install -D @types/three vitest @testing-library/react @testing-library/jest-dom jsdom
```

- [ ] **Step 3: Write vite.config.ts**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './tests/setup.ts',
    css: true,
  },
});
```

- [ ] **Step 4: Write tailwind.config.js**

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        casino: {
          gold: '#d4af37',
          dark: '#1a1a2e',
          darker: '#0f0f1a',
          accent: '#e94560',
          surface: '#16213e',
        },
      },
      fontFamily: {
        display: ['Playfair Display', 'serif'],
        body: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
```

- [ ] **Step 5: Write index.html**

```html
<!DOCTYPE html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Avatar Studio — Reisendes Casino</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@700&display=swap" rel="stylesheet" />
  </head>
  <body class="bg-casino-darker text-white font-body">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Write src/index.css**

```css
@import "tailwindcss";

body {
  margin: 0;
  overflow: hidden;
}

#root {
  width: 100vw;
  height: 100vh;
}
```

- [ ] **Step 7: Write src/main.tsx**

```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 8: Write placeholder App.tsx**

```typescript
export default function App() {
  return (
    <div className="flex h-screen w-screen">
      <div className="flex-[7] bg-casino-darker flex items-center justify-center">
        <p className="text-casino-gold text-2xl font-display">3D Viewport</p>
      </div>
      <div className="flex-[3] bg-casino-dark border-l border-casino-gold/20 p-4">
        <h1 className="text-casino-gold text-xl font-display mb-4">Avatar Studio</h1>
        <p className="text-gray-400">Parts kommen hier...</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 9: Create test setup file**

`avatar-studio/tests/setup.ts`:
```typescript
import '@testing-library/jest-dom';
```

- [ ] **Step 10: Add test script to package.json**

Add to `"scripts"` in `avatar-studio/package.json`:
```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 11: Create HDRI directory**

```bash
mkdir -p avatar-studio/public/hdri
```

- [ ] **Step 12: Verify dev server starts**

```bash
cd avatar-studio && npm run dev
```

Expected: Vite dev server on http://localhost:5173, page shows "3D Viewport" on left and "Avatar Studio" sidebar on right.

- [ ] **Step 13: Commit**

```bash
git add avatar-studio/
git commit -m "feat(avatar-studio): Vite + React + TypeScript + Tailwind project scaffold"
```

---

### Task 2: Types + API Client

**Files:**
- Create: `avatar-studio/src/types.ts`
- Create: `avatar-studio/src/api/client.ts`
- Create: `avatar-studio/tests/api.test.ts`

- [ ] **Step 1: Write types.ts** (shared types needed by both tests and implementation)

```typescript
// Mirrors avatar-api types for the frontend

export interface AvatarConfig {
  id?: string;
  userId?: string;
  gender: 'male' | 'female';
  skinColor: string;
  eyeColor: string;
  hairColor: string;
  parts: Record<string, string>; // { hair: 'part-uuid', top: 'part-uuid', ... }
  customFaceMeshUrl?: string | null;
  thumbnailUrl?: string | null;
}

export interface AvatarPart {
  id: string;
  category: string;
  name: string;
  thumbnailUrl: string | null;
  attachmentPoint: string;
  isPremium: boolean;
  metadata: Record<string, unknown>;
}

export interface PartCategory {
  key: string;
  label: string;
  icon: string; // emoji for quick display
}

export const PART_CATEGORIES: PartCategory[] = [
  { key: 'head', label: 'Kopf', icon: '👤' },
  { key: 'hair', label: 'Haare', icon: '💇' },
  { key: 'eyebrow', label: 'Augenbrauen', icon: '🤨' },
  { key: 'eye', label: 'Augen', icon: '👁' },
  { key: 'nose', label: 'Nase', icon: '👃' },
  { key: 'mouth', label: 'Mund', icon: '👄' },
  { key: 'top', label: 'Oberkörper', icon: '👕' },
  { key: 'bottom', label: 'Hosen', icon: '👖' },
  { key: 'shoe', label: 'Schuhe', icon: '👟' },
  { key: 'accessory', label: 'Accessoires', icon: '💍' },
  { key: 'hat', label: 'Hüte', icon: '🎩' },
];

export interface SaveAvatarRequest {
  gender?: string;
  skinColor?: string;
  eyeColor?: string;
  hairColor?: string;
  parts?: Record<string, string>;
  thumbnailDataUrl?: string;
}

export interface ApiError {
  error: string;
  hint?: string;
  min?: string;
  max?: string;
  retry_after?: number;
  position?: number;
  estimated_wait?: number;
}

export type LightingPreset = 'casino' | 'outdoor' | 'studio';
```

- [ ] **Step 2: Write API client tests first (TDD)**

`avatar-studio/tests/api.test.ts` — write the complete test file shown in Step 3 below BEFORE implementing the client.

- [ ] **Step 3: Run tests — verify they fail**

```bash
cd avatar-studio && npx vitest run tests/api.test.ts
```

Expected: FAIL — `Cannot find module '../src/api/client'`

- [ ] **Step 4: Write API client**

```typescript
import type { AvatarConfig, AvatarPart, SaveAvatarRequest, ApiError } from '../types';

const API_BASE = '/api/avatar';

class AvatarApiClient {
  private async request<T>(url: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${API_BASE}${url}`, {
      credentials: 'include', // send JWT cookie cross-subdomain
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      ...options,
    });

    if (!res.ok) {
      const error: ApiError = await res.json().catch(() => ({ error: 'network_error' }));
      throw new ApiClientError(res.status, error);
    }

    return res.json();
  }

  /** Load avatar config for a user */
  async getAvatar(userId: string): Promise<AvatarConfig | null> {
    try {
      return await this.request<AvatarConfig>(`/${userId}`);
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 404) {
        return null;
      }
      throw err;
    }
  }

  /** Save/update avatar config */
  async saveAvatar(data: SaveAvatarRequest): Promise<AvatarConfig> {
    return this.request<AvatarConfig>('/save', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /** List all parts, optionally filtered by category */
  async listParts(category?: string): Promise<AvatarPart[]> {
    const query = category ? `?category=${encodeURIComponent(category)}` : '';
    return this.request<AvatarPart[]>(`/parts${query}`);
  }

  /** Get GLB download URL for a part */
  getPartGlbUrl(partId: string): string {
    return `${API_BASE}/parts/${partId}/glb`;
  }

  /** Upload photo for KI face generation */
  async generateFace(photo: File): Promise<{ customFaceMeshUrl: string }> {
    const formData = new FormData();
    formData.append('photo', photo);

    const res = await fetch(`${API_BASE}/generate`, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });

    if (!res.ok) {
      const error: ApiError = await res.json().catch(() => ({ error: 'network_error' }));
      throw new ApiClientError(res.status, error);
    }

    return res.json();
  }

  /** Send text description to get part suggestions */
  async interpretText(text: string): Promise<{ parts: Record<string, string> }> {
    return this.request<{ parts: Record<string, string> }>('/interpret', {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
  }

  /** Save thumbnail */
  async saveThumbnail(thumbnailDataUrl: string): Promise<{ thumbnailUrl: string }> {
    return this.request<{ thumbnailUrl: string }>('/thumbnail', {
      method: 'POST',
      body: JSON.stringify({ thumbnailDataUrl }),
    });
  }
}

export class ApiClientError extends Error {
  constructor(
    public status: number,
    public apiError: ApiError
  ) {
    super(`API Error ${status}: ${apiError.error}`);
    this.name = 'ApiClientError';
  }
}

export const avatarApi = new AvatarApiClient();
```

The test file (`avatar-studio/tests/api.test.ts`):
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { avatarApi, ApiClientError } from '../src/api/client';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

describe('AvatarApiClient', () => {
  describe('getAvatar', () => {
    it('returns avatar config when found', async () => {
      const mockAvatar = {
        gender: 'male',
        skinColor: '#e8b98a',
        eyeColor: '#4a3728',
        hairColor: '#2c1810',
        parts: {},
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockAvatar),
      });

      const result = await avatarApi.getAvatar('user-123');
      expect(result).toEqual(mockAvatar);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/avatar/user-123',
        expect.objectContaining({ credentials: 'include' })
      );
    });

    it('returns null when avatar not found (404)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: 'avatar_not_found' }),
      });

      const result = await avatarApi.getAvatar('nonexistent');
      expect(result).toBeNull();
    });

    it('throws ApiClientError on other errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'internal_error' }),
      });

      await expect(avatarApi.getAvatar('user-123')).rejects.toThrow(ApiClientError);
    });
  });

  describe('saveAvatar', () => {
    it('sends POST with avatar data', async () => {
      const saveData = { gender: 'female', skinColor: '#f2d3b1' };
      const mockResponse = { ...saveData, eyeColor: '#4a3728', hairColor: '#2c1810', parts: {} };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await avatarApi.saveAvatar(saveData);
      expect(result.gender).toBe('female');
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/avatar/save',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(saveData),
        })
      );
    });
  });

  describe('listParts', () => {
    it('fetches all parts without category', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([{ id: '1', category: 'hair', name: 'Short' }]),
      });

      const result = await avatarApi.listParts();
      expect(result).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/avatar/parts',
        expect.anything()
      );
    });

    it('fetches parts filtered by category', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      });

      await avatarApi.listParts('hair');
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/avatar/parts?category=hair',
        expect.anything()
      );
    });
  });

  describe('getPartGlbUrl', () => {
    it('returns correct URL', () => {
      const url = avatarApi.getPartGlbUrl('part-abc');
      expect(url).toBe('/api/avatar/parts/part-abc/glb');
    });
  });

  describe('generateFace', () => {
    it('sends FormData with photo', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ customFaceMeshUrl: 'https://s3/face.glb' }),
      });

      const file = new File(['fake-image'], 'selfie.jpg', { type: 'image/jpeg' });
      const result = await avatarApi.generateFace(file);
      expect(result.customFaceMeshUrl).toBe('https://s3/face.glb');

      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[0]).toBe('/api/avatar/generate');
      expect(callArgs[1].method).toBe('POST');
      expect(callArgs[1].body).toBeInstanceOf(FormData);
    });

    it('throws on KI service unavailable (503)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: () => Promise.resolve({ error: 'ai_service_unavailable', retry_after: 30 }),
      });

      const file = new File(['fake'], 'photo.jpg', { type: 'image/jpeg' });
      await expect(avatarApi.generateFace(file)).rejects.toThrow(ApiClientError);
    });
  });

  describe('interpretText', () => {
    it('sends text and returns part suggestions', async () => {
      const mockParts = { parts: { hair: 'hair-long', top: 'top-jacket' } };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockParts),
      });

      const result = await avatarApi.interpretText('großer Mann mit langen Haaren');
      expect(result.parts.hair).toBe('hair-long');
    });
  });
});
```

- [ ] **Step 5: Run tests — verify they pass**

```bash
cd avatar-studio && npx vitest run tests/api.test.ts
```

Expected: All API client tests PASS

- [ ] **Step 6: Commit**

```bash
git add avatar-studio/src/types.ts avatar-studio/src/api/ avatar-studio/tests/api.test.ts
git commit -m "feat(avatar-studio): types + API client with full test coverage"
```

---

### Task 3: Zustand Store for Avatar State

**Files:**
- Create: `avatar-studio/src/store/avatar.ts`
- Create: `avatar-studio/tests/store.test.ts`

- [ ] **Step 1: Write store tests**

`avatar-studio/tests/store.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { useAvatarStore } from '../src/store/avatar';

beforeEach(() => {
  // Reset store to initial state before each test
  useAvatarStore.setState(useAvatarStore.getInitialState());
});

describe('Avatar Store', () => {
  it('has correct initial state', () => {
    const state = useAvatarStore.getState();
    expect(state.gender).toBe('male');
    expect(state.skinColor).toBe('#e8b98a');
    expect(state.eyeColor).toBe('#4a3728');
    expect(state.hairColor).toBe('#2c1810');
    expect(state.selectedParts).toEqual({});
    expect(state.isLoading).toBe(false);
    expect(state.isSaving).toBe(false);
    expect(state.error).toBeNull();
  });

  it('sets gender', () => {
    useAvatarStore.getState().setGender('female');
    expect(useAvatarStore.getState().gender).toBe('female');
  });

  it('sets skin color', () => {
    useAvatarStore.getState().setSkinColor('#d4a67a');
    expect(useAvatarStore.getState().skinColor).toBe('#d4a67a');
  });

  it('sets eye color', () => {
    useAvatarStore.getState().setEyeColor('#2e86c1');
    expect(useAvatarStore.getState().eyeColor).toBe('#2e86c1');
  });

  it('sets hair color', () => {
    useAvatarStore.getState().setHairColor('#f5c542');
    expect(useAvatarStore.getState().hairColor).toBe('#f5c542');
  });

  it('selects a part for a category', () => {
    useAvatarStore.getState().selectPart('hair', 'hair-uuid-1');
    expect(useAvatarStore.getState().selectedParts.hair).toBe('hair-uuid-1');
  });

  it('replaces a part in the same category', () => {
    useAvatarStore.getState().selectPart('hair', 'hair-uuid-1');
    useAvatarStore.getState().selectPart('hair', 'hair-uuid-2');
    expect(useAvatarStore.getState().selectedParts.hair).toBe('hair-uuid-2');
  });

  it('removes a part from a category', () => {
    useAvatarStore.getState().selectPart('hair', 'hair-uuid-1');
    useAvatarStore.getState().removePart('hair');
    expect(useAvatarStore.getState().selectedParts.hair).toBeUndefined();
  });

  it('loads avatar config from API data', () => {
    useAvatarStore.getState().loadFromConfig({
      gender: 'female',
      skinColor: '#f2d3b1',
      eyeColor: '#27ae60',
      hairColor: '#c0392b',
      parts: { hair: 'h1', top: 't1' },
    });
    const state = useAvatarStore.getState();
    expect(state.gender).toBe('female');
    expect(state.skinColor).toBe('#f2d3b1');
    expect(state.selectedParts.hair).toBe('h1');
    expect(state.selectedParts.top).toBe('t1');
  });

  it('sets lighting preset', () => {
    useAvatarStore.getState().setLightingPreset('casino');
    expect(useAvatarStore.getState().lightingPreset).toBe('casino');
  });

  it('sets active category', () => {
    useAvatarStore.getState().setActiveCategory('hair');
    expect(useAvatarStore.getState().activeCategory).toBe('hair');
  });

  it('sets loading state', () => {
    useAvatarStore.getState().setLoading(true);
    expect(useAvatarStore.getState().isLoading).toBe(true);
  });

  it('sets saving state', () => {
    useAvatarStore.getState().setSaving(true);
    expect(useAvatarStore.getState().isSaving).toBe(true);
  });

  it('sets error', () => {
    useAvatarStore.getState().setError('Something failed');
    expect(useAvatarStore.getState().error).toBe('Something failed');
  });

  it('clears error', () => {
    useAvatarStore.getState().setError('error');
    useAvatarStore.getState().setError(null);
    expect(useAvatarStore.getState().error).toBeNull();
  });

  it('exports config for API save', () => {
    useAvatarStore.getState().setGender('female');
    useAvatarStore.getState().setSkinColor('#aaa');
    useAvatarStore.getState().selectPart('hair', 'h1');
    const config = useAvatarStore.getState().toSaveRequest();
    expect(config.gender).toBe('female');
    expect(config.skinColor).toBe('#aaa');
    expect(config.parts?.hair).toBe('h1');
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd avatar-studio && npx vitest run tests/store.test.ts
```

Expected: FAIL — `Cannot find module '../src/store/avatar'`

- [ ] **Step 3: Write Zustand store**

`avatar-studio/src/store/avatar.ts`:
```typescript
import { create } from 'zustand';
import type { AvatarConfig, LightingPreset, SaveAvatarRequest } from '../types';

interface AvatarState {
  // Avatar data
  gender: 'male' | 'female';
  skinColor: string;
  eyeColor: string;
  hairColor: string;
  selectedParts: Record<string, string>; // category → partId
  customFaceMeshUrl: string | null;

  // UI state
  activeCategory: string;
  lightingPreset: LightingPreset;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  isSidebarOpen: boolean; // for mobile drawer

  // Actions
  setGender: (gender: 'male' | 'female') => void;
  setSkinColor: (color: string) => void;
  setEyeColor: (color: string) => void;
  setHairColor: (color: string) => void;
  selectPart: (category: string, partId: string) => void;
  removePart: (category: string) => void;
  setActiveCategory: (category: string) => void;
  setLightingPreset: (preset: LightingPreset) => void;
  setLoading: (loading: boolean) => void;
  setSaving: (saving: boolean) => void;
  setError: (error: string | null) => void;
  setSidebarOpen: (open: boolean) => void;
  setCustomFaceMeshUrl: (url: string | null) => void;
  loadFromConfig: (config: Partial<AvatarConfig>) => void;
  toSaveRequest: () => SaveAvatarRequest;
}

const INITIAL_STATE = {
  gender: 'male' as const,
  skinColor: '#e8b98a',
  eyeColor: '#4a3728',
  hairColor: '#2c1810',
  selectedParts: {} as Record<string, string>,
  customFaceMeshUrl: null as string | null,
  activeCategory: 'head',
  lightingPreset: 'studio' as LightingPreset,
  isLoading: false,
  isSaving: false,
  error: null as string | null,
  isSidebarOpen: true,
};

export const useAvatarStore = create<AvatarState>()((set, get) => ({
  ...INITIAL_STATE,

  setGender: (gender) => set({ gender }),
  setSkinColor: (skinColor) => set({ skinColor }),
  setEyeColor: (eyeColor) => set({ eyeColor }),
  setHairColor: (hairColor) => set({ hairColor }),

  selectPart: (category, partId) =>
    set((state) => ({
      selectedParts: { ...state.selectedParts, [category]: partId },
    })),

  removePart: (category) =>
    set((state) => {
      const { [category]: _, ...rest } = state.selectedParts;
      return { selectedParts: rest };
    }),

  setActiveCategory: (activeCategory) => set({ activeCategory }),
  setLightingPreset: (lightingPreset) => set({ lightingPreset }),
  setLoading: (isLoading) => set({ isLoading }),
  setSaving: (isSaving) => set({ isSaving }),
  setError: (error) => set({ error }),
  setSidebarOpen: (isSidebarOpen) => set({ isSidebarOpen }),
  setCustomFaceMeshUrl: (customFaceMeshUrl) => set({ customFaceMeshUrl }),

  loadFromConfig: (config) =>
    set({
      ...(config.gender && { gender: config.gender }),
      ...(config.skinColor && { skinColor: config.skinColor }),
      ...(config.eyeColor && { eyeColor: config.eyeColor }),
      ...(config.hairColor && { hairColor: config.hairColor }),
      ...(config.parts && { selectedParts: config.parts }),
      ...(config.customFaceMeshUrl !== undefined && {
        customFaceMeshUrl: config.customFaceMeshUrl ?? null,
      }),
    }),

  toSaveRequest: () => {
    const state = get();
    return {
      gender: state.gender,
      skinColor: state.skinColor,
      eyeColor: state.eyeColor,
      hairColor: state.hairColor,
      parts: state.selectedParts,
    };
  },
}));

// Expose initial state for test resets
useAvatarStore.getInitialState = () => INITIAL_STATE;

// Type augmentation for getInitialState
declare module 'zustand' {
  interface StoreApi<T> {
    getInitialState: () => Partial<T>;
  }
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd avatar-studio && npx vitest run tests/store.test.ts
```

Expected: All 16 store tests PASS

- [ ] **Step 5: Commit**

```bash
git add avatar-studio/src/store/ avatar-studio/tests/store.test.ts
git commit -m "feat(avatar-studio): Zustand avatar store with full test coverage"
```

---

## Chunk 2: 3D Viewport

### Task 4: Three.js Viewport with OrbitControls

**Files:**
- Create: `avatar-studio/src/components/Viewport.tsx`

- [ ] **Step 1: Write Viewport component**

```typescript
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Environment, ContactShadows } from '@react-three/drei';
import { Suspense } from 'react';
import AvatarModel from './AvatarModel';
import LightingPresets from './LightingPresets';

function LoadingFallback() {
  return (
    <mesh>
      <boxGeometry args={[0.5, 0.5, 0.5]} />
      <meshStandardMaterial color="#d4af37" wireframe />
    </mesh>
  );
}

export default function Viewport() {
  return (
    <Canvas
      gl={{ antialias: true, toneMapping: 3 /* ACESFilmicToneMapping */ }}
      dpr={[1, 2]}
      className="w-full h-full"
    >
      <PerspectiveCamera makeDefault position={[0, 1.2, 3]} fov={35} />
      <OrbitControls
        target={[0, 1, 0]}
        minDistance={1.5}
        maxDistance={6}
        minPolarAngle={Math.PI / 6}
        maxPolarAngle={Math.PI / 1.5}
        enablePan={false}
      />
      <Suspense fallback={<LoadingFallback />}>
        <LightingPresets />
        <AvatarModel />
        <ContactShadows
          position={[0, 0, 0]}
          opacity={0.4}
          scale={5}
          blur={2}
          far={4}
        />
      </Suspense>
    </Canvas>
  );
}
```

- [ ] **Step 2: Verify component renders**

Temporarily update `App.tsx` to import Viewport:
```typescript
import Viewport from './components/Viewport';

export default function App() {
  return (
    <div className="flex h-screen w-screen">
      <div className="flex-[7] bg-casino-darker">
        <Viewport />
      </div>
      <div className="flex-[3] bg-casino-dark border-l border-casino-gold/20 p-4">
        <h1 className="text-casino-gold text-xl font-display mb-4">Avatar Studio</h1>
      </div>
    </div>
  );
}
```

```bash
cd avatar-studio && npm run dev
```

Expected: 3D canvas renders on left side with a placeholder object visible. OrbitControls allow rotation.

- [ ] **Step 3: Commit**

```bash
git add avatar-studio/src/components/Viewport.tsx avatar-studio/src/App.tsx
git commit -m "feat(avatar-studio): Three.js viewport with OrbitControls and camera"
```

---

### Task 5: AvatarModel Component

**Files:**
- Create: `avatar-studio/src/components/AvatarModel.tsx`
- Create: `avatar-studio/src/hooks/useAvatar.ts`

- [ ] **Step 1: Write useAvatar hook**

```typescript
import { useEffect, useState } from 'react';
import { useAvatarStore } from '../store/avatar';
import { avatarApi } from '../api/client';
import type { AvatarPart } from '../types';

/**
 * Hook that connects the Zustand store to the Avatar API.
 * - Loads avatar config on mount
 * - Fetches parts catalog
 * - Provides save function
 */
export function useAvatar(userId?: string) {
  const store = useAvatarStore();
  const [parts, setParts] = useState<AvatarPart[]>([]);
  const [partsLoading, setPartsLoading] = useState(false);

  // Load existing avatar on mount
  useEffect(() => {
    if (!userId) return;

    const loadAvatar = async () => {
      store.setLoading(true);
      store.setError(null);
      try {
        const config = await avatarApi.getAvatar(userId);
        if (config) {
          store.loadFromConfig(config);
        }
      } catch (err) {
        store.setError('Avatar konnte nicht geladen werden');
        console.error('Failed to load avatar:', err);
      } finally {
        store.setLoading(false);
      }
    };

    loadAvatar();
  }, [userId]);

  // Load parts catalog
  useEffect(() => {
    const loadParts = async () => {
      setPartsLoading(true);
      try {
        const allParts = await avatarApi.listParts();
        setParts(allParts);
      } catch (err) {
        console.error('Failed to load parts catalog:', err);
      } finally {
        setPartsLoading(false);
      }
    };

    loadParts();
  }, []);

  // Filter parts by active category
  const categoryParts = parts.filter((p) => p.category === store.activeCategory);

  // Save avatar to API
  const saveAvatar = async () => {
    store.setSaving(true);
    store.setError(null);
    try {
      const config = store.toSaveRequest();
      await avatarApi.saveAvatar(config);
    } catch (err) {
      store.setError('Speichern fehlgeschlagen');
      console.error('Failed to save avatar:', err);
      throw err;
    } finally {
      store.setSaving(false);
    }
  };

  // Upload photo for KI face generation
  const uploadPhoto = async (file: File) => {
    store.setLoading(true);
    store.setError(null);
    try {
      const result = await avatarApi.generateFace(file);
      store.setCustomFaceMeshUrl(result.customFaceMeshUrl);
    } catch (err: any) {
      if (err.apiError?.error === 'ai_service_unavailable') {
        store.setError('KI-Service ist gerade nicht verfügbar. Bitte später erneut versuchen.');
      } else if (err.apiError?.error === 'no_face_detected') {
        store.setError(err.apiError.hint || 'Kein Gesicht erkannt');
      } else if (err.apiError?.error === 'file_too_large') {
        store.setError('Datei ist zu groß (max 10MB)');
      } else {
        store.setError('Foto-Verarbeitung fehlgeschlagen');
      }
      throw err;
    } finally {
      store.setLoading(false);
    }
  };

  // Interpret text description
  const interpretText = async (text: string) => {
    store.setLoading(true);
    store.setError(null);
    try {
      const result = await avatarApi.interpretText(text);
      // Apply suggested parts
      for (const [category, partId] of Object.entries(result.parts)) {
        store.selectPart(category, partId);
      }
    } catch (err: any) {
      if (err.apiError?.error === 'ai_service_unavailable') {
        store.setError('KI-Service ist gerade nicht verfügbar.');
      } else {
        store.setError('Text-Verarbeitung fehlgeschlagen');
      }
      throw err;
    } finally {
      store.setLoading(false);
    }
  };

  return {
    parts,
    categoryParts,
    partsLoading,
    saveAvatar,
    uploadPhoto,
    interpretText,
  };
}
```

- [ ] **Step 2: Write AvatarModel component**

```typescript
import { useRef, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { useAvatarStore } from '../store/avatar';
import { avatarApi } from '../api/client';

/**
 * AvatarModel renders a placeholder capsule (basis mesh not yet available)
 * and loads selected part GLBs, attaching them at the correct bone positions.
 *
 * Once real basis meshes exist, replace PlaceholderBody with useGLTF loading.
 */

/**
 * COLOR APPLICATION STRATEGY (per spec):
 *
 * Placeholder body (current): Direct material.color.set() — works for untextured meshes.
 *
 * Real basis meshes (future): Shader uniforms that tint PBR textures.
 * When real GLBs arrive, replace material properties with:
 *   material.onBeforeCompile = (shader) => {
 *     shader.uniforms.uSkinTint = { value: new THREE.Color(skinColor) };
 *     shader.fragmentShader = shader.fragmentShader.replace(
 *       '#include <color_fragment>',
 *       '#include <color_fragment>\ndiffuseColor.rgb *= uSkinTint;'
 *     );
 *   };
 * This multiplies the skin tint over the PBR albedo texture, preserving
 * pore detail, AO, and other texture features. Same approach for hair/eye.
 */

// Placeholder body while basis meshes are in production
function PlaceholderBody({ skinColor }: { skinColor: string }) {
  const groupRef = useRef<THREE.Group>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);

  useEffect(() => {
    if (materialRef.current) {
      materialRef.current.color.set(skinColor);
    }
  }, [skinColor]);

  return (
    <group ref={groupRef}>
      {/* Torso */}
      <mesh position={[0, 1.1, 0]}>
        <capsuleGeometry args={[0.25, 0.5, 8, 16]} />
        <meshStandardMaterial ref={materialRef} color={skinColor} roughness={0.7} />
      </mesh>
      {/* Head */}
      <mesh position={[0, 1.7, 0]}>
        <sphereGeometry args={[0.18, 16, 16]} />
        <meshStandardMaterial color={skinColor} roughness={0.7} />
      </mesh>
      {/* Left Arm */}
      <mesh position={[-0.35, 1.1, 0]} rotation={[0, 0, 0.3]}>
        <capsuleGeometry args={[0.06, 0.4, 4, 8]} />
        <meshStandardMaterial color={skinColor} roughness={0.7} />
      </mesh>
      {/* Right Arm */}
      <mesh position={[0.35, 1.1, 0]} rotation={[0, 0, -0.3]}>
        <capsuleGeometry args={[0.06, 0.4, 4, 8]} />
        <meshStandardMaterial color={skinColor} roughness={0.7} />
      </mesh>
      {/* Left Leg */}
      <mesh position={[-0.12, 0.45, 0]}>
        <capsuleGeometry args={[0.08, 0.5, 4, 8]} />
        <meshStandardMaterial color={skinColor} roughness={0.7} />
      </mesh>
      {/* Right Leg */}
      <mesh position={[0.12, 0.45, 0]}>
        <capsuleGeometry args={[0.08, 0.5, 4, 8]} />
        <meshStandardMaterial color={skinColor} roughness={0.7} />
      </mesh>
      {/* Eyes (using eye color from store) */}
      <EyeDots />
      {/* Hair indicator */}
      <HairIndicator />
    </group>
  );
}

function EyeDots() {
  const eyeColor = useAvatarStore((s) => s.eyeColor);
  return (
    <>
      <mesh position={[-0.06, 1.74, 0.15]}>
        <sphereGeometry args={[0.025, 8, 8]} />
        <meshStandardMaterial color={eyeColor} />
      </mesh>
      <mesh position={[0.06, 1.74, 0.15]}>
        <sphereGeometry args={[0.025, 8, 8]} />
        <meshStandardMaterial color={eyeColor} />
      </mesh>
    </>
  );
}

function HairIndicator() {
  const hairColor = useAvatarStore((s) => s.hairColor);
  const hasPart = useAvatarStore((s) => !!s.selectedParts.hair);

  if (!hasPart) return null;

  return (
    <mesh position={[0, 1.88, -0.02]}>
      <sphereGeometry args={[0.17, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
      <meshStandardMaterial color={hairColor} roughness={0.8} />
    </mesh>
  );
}

/**
 * Bone-based attachment positions for the placeholder body.
 * When real basis meshes with skeletons are available, parts will attach
 * via matching named bones (part root bone → basis mesh attachment bone).
 * For now, we use hardcoded positions matching the placeholder capsule body.
 */
const ATTACHMENT_POSITIONS: Record<string, [number, number, number]> = {
  bone_neck:        [0, 1.55, 0],
  bone_head_top:    [0, 1.88, 0],
  bone_forehead:    [0, 1.8, 0.1],
  bone_eye_L:       [-0.06, 1.74, 0.15],
  bone_eye_R:       [0.06, 1.74, 0.15],
  bone_face_center: [0, 1.7, 0.15],
  bone_lower_face:  [0, 1.65, 0.12],
  bone_torso:       [0, 1.1, 0],
  bone_lower_body:  [0, 0.65, 0],
  bone_foot_L:      [-0.12, 0.1, 0],
  bone_foot_R:      [0.12, 0.1, 0],
};

/**
 * Attaches a loaded GLB part to the correct bone/position.
 *
 * With real basis meshes:
 * 1. Find the attachment bone in the basis skeleton by name (e.g. 'bone_head_top')
 * 2. Find the root bone in the part GLB
 * 3. Parent the part's root bone to the basis mesh's attachment bone
 * 4. The skeleton animation system handles positioning automatically
 *
 * With placeholder body:
 * - Use ATTACHMENT_POSITIONS lookup to place the part at the right world position
 */
function PartMesh({ partId, attachmentPoint }: { partId: string; attachmentPoint?: string }) {
  const url = avatarApi.getPartGlbUrl(partId);
  const position = attachmentPoint
    ? ATTACHMENT_POSITIONS[attachmentPoint] || [0, 0, 0]
    : [0, 0, 0];

  // useGLTF will suspend until loaded (handled by Suspense boundary in Viewport)
  // For now with no real GLBs on the server, this will error gracefully
  try {
    const { scene } = useGLTF(url);
    const clonedScene = useMemo(() => scene.clone(), [scene]);

    // When real meshes arrive: traverse scene to find SkinnedMesh,
    // match bone names, and attach to basis skeleton.
    // For now, position at the attachment point.
    return <primitive object={clonedScene} position={position} />;
  } catch {
    // Part GLB not available yet — skip silently
    return null;
  }
}

export default function AvatarModel() {
  const skinColor = useAvatarStore((s) => s.skinColor);
  const selectedParts = useAvatarStore((s) => s.selectedParts);
  const groupRef = useRef<THREE.Group>(null);

  return (
    <group ref={groupRef}>
      <PlaceholderBody skinColor={skinColor} />

      {/* Render loaded parts at bone attachment positions.
          Each part GLB is positioned at its attachment bone location.
          With real basis meshes, parts will be parented to skeleton bones instead. */}
      {Object.entries(selectedParts).map(([category, partId]) => (
        <PartMesh key={`${category}-${partId}`} partId={partId} />
      ))}
    </group>
  );
}
```

- [ ] **Step 3: Verify in browser**

```bash
cd avatar-studio && npm run dev
```

Expected: Placeholder humanoid shape (capsules + spheres) visible in viewport. Skin color matches default `#e8b98a`. Eyes visible as small spheres.

- [ ] **Step 4: Commit**

```bash
git add avatar-studio/src/components/AvatarModel.tsx avatar-studio/src/hooks/useAvatar.ts
git commit -m "feat(avatar-studio): AvatarModel placeholder body + useAvatar hook"
```

---

### Task 6: Lighting Presets

**Files:**
- Create: `avatar-studio/src/components/LightingPresets.tsx`

- [ ] **Step 1: Write LightingPresets component**

```typescript
import { useAvatarStore } from '../store/avatar';
import { Environment } from '@react-three/drei';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';

/**
 * Three lighting presets per spec:
 * - Casino: warm golden tones, dramatic key light, ambient glow
 * - Outdoor: natural daylight, blue sky HDRI
 * - Studio: classic 3-point lighting, neutral
 */

function CasinoLighting() {
  return (
    <>
      {/* Key light — warm golden spotlight from above-right */}
      <spotLight
        position={[3, 4, 2]}
        angle={0.4}
        penumbra={0.5}
        intensity={2.5}
        color="#ffd700"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      {/* Fill light — dim red from left */}
      <pointLight position={[-3, 2, 1]} intensity={0.6} color="#e94560" />
      {/* Rim light — cool blue from behind */}
      <pointLight position={[0, 2, -3]} intensity={0.8} color="#4fc3f7" />
      {/* Ambient — very low, warm */}
      <ambientLight intensity={0.15} color="#ffd700" />
      {/* Background environment */}
      <Environment preset="night" background={false} />
    </>
  );
}

function OutdoorLighting() {
  return (
    <>
      {/* Sun — directional from upper-right */}
      <directionalLight
        position={[5, 8, 3]}
        intensity={2.0}
        color="#fff5e6"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      {/* Sky fill */}
      <hemisphereLight
        args={['#87ceeb', '#3d5c3a', 0.6]}
      />
      {/* Ambient */}
      <ambientLight intensity={0.3} color="#e6f0ff" />
      {/* HDRI sky */}
      <Environment preset="park" background={false} />
    </>
  );
}

function StudioLighting() {
  return (
    <>
      {/* Key light — main light from front-right */}
      <directionalLight
        position={[3, 4, 3]}
        intensity={1.8}
        color="#ffffff"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      {/* Fill light — softer from left */}
      <directionalLight
        position={[-3, 3, 2]}
        intensity={0.6}
        color="#e6e6ff"
      />
      {/* Rim/back light — highlight edges */}
      <pointLight position={[0, 3, -3]} intensity={1.0} color="#ffffff" />
      {/* Ambient base */}
      <ambientLight intensity={0.25} color="#f0f0f0" />
      {/* Neutral studio environment */}
      <Environment preset="studio" background={false} />
    </>
  );
}

export default function LightingPresets() {
  const preset = useAvatarStore((s) => s.lightingPreset);

  switch (preset) {
    case 'casino':
      return <CasinoLighting />;
    case 'outdoor':
      return <OutdoorLighting />;
    case 'studio':
    default:
      return <StudioLighting />;
  }
}
```

- [ ] **Step 2: Verify lighting presets in browser**

Temporarily add a button in App.tsx to cycle presets and verify each looks different:

```bash
cd avatar-studio && npm run dev
```

Expected: Studio preset shows clean white lighting. All three presets produce visually distinct results.

- [ ] **Step 3: Commit**

```bash
git add avatar-studio/src/components/LightingPresets.tsx
git commit -m "feat(avatar-studio): 3 lighting presets (Casino, Outdoor, Studio)"
```

---

## Chunk 3: UI Components

### Task 7: Sidebar Layout (70/30 Split, Mobile Drawer)

**Files:**
- Modify: `avatar-studio/src/App.tsx`

- [ ] **Step 1: Write full App layout**

```typescript
import { Suspense, lazy } from 'react';
import { useAvatarStore } from './store/avatar';
import Viewport from './components/Viewport';
import PartSelector from './components/PartSelector';
import ColorPicker from './components/ColorPicker';
import PhotoUpload from './components/PhotoUpload';
import TextInput from './components/TextInput';
import SaveButton from './components/SaveButton';

function GenderToggle() {
  const gender = useAvatarStore((s) => s.gender);
  const setGender = useAvatarStore((s) => s.setGender);

  return (
    <div className="flex gap-2 mb-4">
      <button
        onClick={() => setGender('male')}
        className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
          gender === 'male'
            ? 'bg-casino-gold text-casino-darker'
            : 'bg-casino-surface text-gray-400 hover:text-white'
        }`}
      >
        Männlich
      </button>
      <button
        onClick={() => setGender('female')}
        className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
          gender === 'female'
            ? 'bg-casino-gold text-casino-darker'
            : 'bg-casino-surface text-gray-400 hover:text-white'
        }`}
      >
        Weiblich
      </button>
    </div>
  );
}

function LightingButtons() {
  const preset = useAvatarStore((s) => s.lightingPreset);
  const setPreset = useAvatarStore((s) => s.setLightingPreset);

  const presets = [
    { key: 'casino' as const, label: 'Casino' },
    { key: 'outdoor' as const, label: 'Outdoor' },
    { key: 'studio' as const, label: 'Studio' },
  ];

  return (
    <div className="absolute bottom-4 left-4 flex gap-2 z-10">
      {presets.map((p) => (
        <button
          key={p.key}
          onClick={() => setPreset(p.key)}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all backdrop-blur-sm ${
            preset === p.key
              ? 'bg-casino-gold text-casino-darker'
              : 'bg-black/50 text-gray-300 hover:bg-black/70 hover:text-white'
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

function Sidebar() {
  const error = useAvatarStore((s) => s.error);
  const isLoading = useAvatarStore((s) => s.isLoading);

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-4 border-b border-casino-gold/20">
        <h1 className="text-casino-gold text-xl font-display mb-2">Avatar Studio</h1>
        <GenderToggle />
      </div>

      {error && (
        <div className="mx-4 mt-3 p-3 bg-red-900/50 border border-red-500/30 rounded-lg text-sm text-red-300">
          {error}
        </div>
      )}

      {isLoading && (
        <div className="mx-4 mt-3 p-3 bg-casino-surface rounded-lg text-sm text-casino-gold flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-casino-gold border-t-transparent rounded-full animate-spin" />
          Wird geladen...
        </div>
      )}

      <div className="p-4 border-b border-casino-gold/20">
        <PhotoUpload />
        <TextInput />
      </div>

      <div className="flex-1 p-4 border-b border-casino-gold/20 min-h-0">
        <PartSelector />
      </div>

      <div className="p-4 border-b border-casino-gold/20">
        <ColorPicker />
      </div>

      <div className="p-4">
        <SaveButton />
      </div>
    </div>
  );
}

function MobileMenuButton() {
  const isSidebarOpen = useAvatarStore((s) => s.isSidebarOpen);
  const setSidebarOpen = useAvatarStore((s) => s.setSidebarOpen);

  return (
    <button
      onClick={() => setSidebarOpen(!isSidebarOpen)}
      className="md:hidden fixed top-4 right-4 z-50 w-10 h-10 bg-casino-gold text-casino-darker rounded-full flex items-center justify-center shadow-lg"
    >
      {isSidebarOpen ? '\u2715' : '\u2630'}
    </button>
  );
}

export default function App() {
  const isSidebarOpen = useAvatarStore((s) => s.isSidebarOpen);

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      {/* Viewport (70% on desktop, full on mobile) */}
      <div className="flex-[7] relative bg-casino-darker">
        <Viewport />
        <LightingButtons />
      </div>

      {/* Sidebar (30% on desktop, drawer on mobile) */}
      <div
        className={`
          bg-casino-dark border-l border-casino-gold/20
          /* Desktop: always visible, 30% width */
          hidden md:flex md:flex-col md:flex-[3] md:max-w-[400px] md:min-w-[300px]
          /* Mobile: slide-in drawer */
          ${isSidebarOpen ? 'fixed inset-y-0 right-0 w-[85vw] max-w-[360px] flex flex-col z-40 shadow-2xl md:relative md:inset-auto md:w-auto md:shadow-none' : ''}
        `}
      >
        <Sidebar />
      </div>

      {/* Mobile overlay when sidebar is open */}
      {isSidebarOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/60 z-30"
          onClick={() => useAvatarStore.getState().setSidebarOpen(false)}
        />
      )}

      <MobileMenuButton />
    </div>
  );
}
```

- [ ] **Step 2: Verify layout**

```bash
cd avatar-studio && npm run dev
```

Expected: Desktop shows 70/30 split. Resizing browser below `md` breakpoint (768px) hides sidebar; hamburger button appears top-right; clicking it opens sidebar as drawer with dark overlay behind it.

- [ ] **Step 3: Commit**

```bash
git add avatar-studio/src/App.tsx
git commit -m "feat(avatar-studio): responsive 70/30 layout with mobile drawer sidebar"
```

---

### Task 8: PartSelector (Category Tabs + Part Grid)

**Files:**
- Create: `avatar-studio/src/components/PartSelector.tsx`

- [ ] **Step 1: Write PartSelector component**

```typescript
import { useEffect, useState } from 'react';
import { useAvatarStore } from '../store/avatar';
import { avatarApi } from '../api/client';
import { PART_CATEGORIES, type AvatarPart } from '../types';

function CategoryTabs() {
  const activeCategory = useAvatarStore((s) => s.activeCategory);
  const setActiveCategory = useAvatarStore((s) => s.setActiveCategory);

  return (
    <div className="flex gap-1 overflow-x-auto pb-2 scrollbar-hide mb-3">
      {PART_CATEGORIES.map((cat) => (
        <button
          key={cat.key}
          onClick={() => setActiveCategory(cat.key)}
          title={cat.label}
          className={`flex-shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
            activeCategory === cat.key
              ? 'bg-casino-gold text-casino-darker'
              : 'bg-casino-surface text-gray-400 hover:text-white hover:bg-casino-surface/80'
          }`}
        >
          <span className="mr-1">{cat.icon}</span>
          {cat.label}
        </button>
      ))}
    </div>
  );
}

function PartGrid({ parts, loading }: { parts: AvatarPart[]; loading: boolean }) {
  const selectedParts = useAvatarStore((s) => s.selectedParts);
  const selectPart = useAvatarStore((s) => s.selectPart);
  const removePart = useAvatarStore((s) => s.removePart);
  const activeCategory = useAvatarStore((s) => s.activeCategory);

  const handlePartClick = (part: AvatarPart) => {
    if (selectedParts[part.category] === part.id) {
      // Deselect if already selected
      removePart(part.category);
    } else {
      selectPart(part.category, part.id);
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-2">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="aspect-square bg-casino-surface rounded-lg animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (parts.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 text-sm">
        Keine Teile in dieser Kategorie verfügbar
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {parts.map((part) => {
        const isSelected = selectedParts[part.category] === part.id;
        return (
          <button
            key={part.id}
            onClick={() => handlePartClick(part)}
            className={`aspect-square rounded-lg border-2 transition-all relative overflow-hidden group ${
              isSelected
                ? 'border-casino-gold bg-casino-gold/10 shadow-[0_0_12px_rgba(212,175,55,0.3)]'
                : 'border-casino-surface bg-casino-surface hover:border-casino-gold/40'
            }`}
          >
            {part.thumbnailUrl ? (
              <img
                src={part.thumbnailUrl}
                alt={part.name}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <span className="text-2xl opacity-50">
                  {PART_CATEGORIES.find((c) => c.key === part.category)?.icon || '?'}
                </span>
              </div>
            )}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-1">
              <span className="text-[10px] text-white font-medium truncate block">
                {part.name}
              </span>
            </div>
            {isSelected && (
              <div className="absolute top-1 right-1 w-5 h-5 bg-casino-gold rounded-full flex items-center justify-center">
                <span className="text-casino-darker text-xs font-bold">✓</span>
              </div>
            )}
            {part.isPremium && (
              <div className="absolute top-1 left-1 bg-casino-gold/90 rounded px-1 py-0.5">
                <span className="text-[8px] text-casino-darker font-bold">PRO</span>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default function PartSelector() {
  const activeCategory = useAvatarStore((s) => s.activeCategory);
  const [parts, setParts] = useState<AvatarPart[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadParts = async () => {
      setLoading(true);
      try {
        const result = await avatarApi.listParts(activeCategory);
        setParts(result);
      } catch (err) {
        console.error('Failed to load parts:', err);
        setParts([]);
      } finally {
        setLoading(false);
      }
    };

    loadParts();
  }, [activeCategory]);

  return (
    <div className="flex flex-col h-full">
      <h2 className="text-sm font-semibold text-gray-300 mb-2">Teile auswählen</h2>
      <CategoryTabs />
      <div className="flex-1 overflow-y-auto min-h-0">
        <PartGrid parts={parts} loading={loading} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify in browser**

```bash
cd avatar-studio && npm run dev
```

Expected: Category tabs render in sidebar scrollable row. Clicking a category shows loading skeleton, then parts grid (empty message if API not running). Selected parts get gold border + checkmark.

- [ ] **Step 3: Commit**

```bash
git add avatar-studio/src/components/PartSelector.tsx
git commit -m "feat(avatar-studio): PartSelector with category tabs + part thumbnail grid"
```

---

### Task 9: ColorPicker (Skin, Eye, Hair)

**Files:**
- Create: `avatar-studio/src/components/ColorPicker.tsx`

- [ ] **Step 1: Write ColorPicker component**

```typescript
import { useState } from 'react';
import { useAvatarStore } from '../store/avatar';

interface ColorPreset {
  label: string;
  hex: string;
}

const SKIN_PRESETS: ColorPreset[] = [
  { label: 'Sehr hell', hex: '#ffe0bd' },
  { label: 'Hell', hex: '#f7c5a0' },
  { label: 'Mittel', hex: '#e8b98a' },
  { label: 'Tan', hex: '#d4a67a' },
  { label: 'Braun', hex: '#a67c5b' },
  { label: 'Dunkel', hex: '#6b4226' },
  { label: 'Sehr dunkel', hex: '#3b2219' },
];

const EYE_PRESETS: ColorPreset[] = [
  { label: 'Braun', hex: '#4a3728' },
  { label: 'Haselnuss', hex: '#8b6914' },
  { label: 'Grün', hex: '#2e8b57' },
  { label: 'Blau', hex: '#4682b4' },
  { label: 'Hellblau', hex: '#87ceeb' },
  { label: 'Grau', hex: '#808080' },
  { label: 'Bernstein', hex: '#ffbf00' },
];

const HAIR_PRESETS: ColorPreset[] = [
  { label: 'Schwarz', hex: '#1a1a1a' },
  { label: 'Dunkelbraun', hex: '#2c1810' },
  { label: 'Braun', hex: '#6b3a2a' },
  { label: 'Kastanie', hex: '#8b4513' },
  { label: 'Rot', hex: '#b22222' },
  { label: 'Blond', hex: '#daa520' },
  { label: 'Hellblond', hex: '#f5deb3' },
  { label: 'Silber', hex: '#c0c0c0' },
  { label: 'Weiß', hex: '#f0f0f0' },
];

interface ColorRowProps {
  label: string;
  value: string;
  presets: ColorPreset[];
  onChange: (hex: string) => void;
}

function ColorRow({ label, value, presets, onChange }: ColorRowProps) {
  const [showCustom, setShowCustom] = useState(false);

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-gray-400 font-medium">{label}</span>
        <button
          onClick={() => setShowCustom(!showCustom)}
          className="text-[10px] text-casino-gold hover:text-casino-gold/80 transition-colors"
        >
          {showCustom ? 'Presets' : 'Custom'}
        </button>
      </div>

      {showCustom ? (
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-8 h-8 rounded cursor-pointer border border-casino-gold/30 bg-transparent"
          />
          <input
            type="text"
            value={value}
            onChange={(e) => {
              if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) {
                onChange(e.target.value);
              }
            }}
            placeholder="#000000"
            className="flex-1 bg-casino-surface border border-casino-gold/20 rounded px-2 py-1 text-xs text-white font-mono"
            maxLength={7}
          />
        </div>
      ) : (
        <div className="flex gap-1.5 flex-wrap">
          {presets.map((preset) => (
            <button
              key={preset.hex}
              onClick={() => onChange(preset.hex)}
              title={preset.label}
              className={`w-7 h-7 rounded-full border-2 transition-all hover:scale-110 ${
                value === preset.hex
                  ? 'border-casino-gold shadow-[0_0_8px_rgba(212,175,55,0.5)] scale-110'
                  : 'border-transparent hover:border-casino-gold/40'
              }`}
              style={{ backgroundColor: preset.hex }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function ColorPicker() {
  const skinColor = useAvatarStore((s) => s.skinColor);
  const eyeColor = useAvatarStore((s) => s.eyeColor);
  const hairColor = useAvatarStore((s) => s.hairColor);
  const setSkinColor = useAvatarStore((s) => s.setSkinColor);
  const setEyeColor = useAvatarStore((s) => s.setEyeColor);
  const setHairColor = useAvatarStore((s) => s.setHairColor);

  return (
    <div>
      <h2 className="text-sm font-semibold text-gray-300 mb-3">Farben</h2>
      <ColorRow
        label="Hautfarbe"
        value={skinColor}
        presets={SKIN_PRESETS}
        onChange={setSkinColor}
      />
      <ColorRow
        label="Augenfarbe"
        value={eyeColor}
        presets={EYE_PRESETS}
        onChange={setEyeColor}
      />
      <ColorRow
        label="Haarfarbe"
        value={hairColor}
        presets={HAIR_PRESETS}
        onChange={setHairColor}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify in browser**

```bash
cd avatar-studio && npm run dev
```

Expected: Color section in sidebar shows 3 rows (Hautfarbe, Augenfarbe, Haarfarbe), each with circular preset buttons. Clicking a preset updates the 3D model's colors in real-time. "Custom" toggle shows hex input + native color picker. Selected preset has gold ring.

- [ ] **Step 3: Commit**

```bash
git add avatar-studio/src/components/ColorPicker.tsx
git commit -m "feat(avatar-studio): ColorPicker with skin/eye/hair presets + custom hex"
```

---

### Task 10: PhotoUpload + TextInput

**Files:**
- Create: `avatar-studio/src/components/PhotoUpload.tsx`
- Create: `avatar-studio/src/components/TextInput.tsx`

- [ ] **Step 1: Write PhotoUpload component**

```typescript
import { useRef, useState, useCallback } from 'react';
import { useAvatarStore } from '../store/avatar';
import { avatarApi, ApiClientError } from '../api/client';

export default function PhotoUpload() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const setError = useAvatarStore((s) => s.setError);
  const setCustomFaceMeshUrl = useAvatarStore((s) => s.setCustomFaceMeshUrl);

  const handleFileSelect = useCallback(async (file: File) => {
    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Bitte nur Bilddateien hochladen');
      return;
    }

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      setError('Datei ist zu groß (max 10MB)');
      return;
    }

    // Validate minimum dimensions
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.src = objectUrl;
    await new Promise((resolve) => { img.onload = resolve; });

    if (img.width < 512 || img.height < 512) {
      setError('Bild muss mindestens 512x512 Pixel groß sein');
      URL.revokeObjectURL(objectUrl);
      return;
    }

    // Show preview
    setPreview(objectUrl);

    // Upload to API
    setUploading(true);
    setProgress('Gesicht wird analysiert...');
    setError(null);

    try {
      const result = await avatarApi.generateFace(file);
      setCustomFaceMeshUrl(result.customFaceMeshUrl);
      setProgress('Fertig!');
      setTimeout(() => setProgress(null), 2000);
    } catch (err) {
      if (err instanceof ApiClientError) {
        switch (err.apiError.error) {
          case 'ai_service_unavailable':
            setError(`KI-Service nicht verfügbar. Bitte in ${err.apiError.retry_after || 30}s erneut versuchen.`);
            break;
          case 'no_face_detected':
            setError(err.apiError.hint || 'Kein Gesicht erkannt. Bitte ein deutliches Foto hochladen.');
            break;
          case 'multiple_faces':
            setError(err.apiError.hint || 'Bitte nur ein Gesicht im Bild.');
            break;
          case 'image_too_small':
            setError(`Bild zu klein. Minimum: ${err.apiError.min}`);
            break;
          case 'ai_queue_full':
            setError(`KI-Warteschlange voll. Position: ${err.apiError.position}, ca. ${err.apiError.estimated_wait}s Wartezeit.`);
            break;
          case 'file_too_large':
            setError(`Datei zu groß (max ${err.apiError.max})`);
            break;
          default:
            setError('Foto-Verarbeitung fehlgeschlagen');
        }
      } else {
        setError('Verbindungsfehler beim Hochladen');
      }
      setProgress(null);
    } finally {
      setUploading(false);
    }
  }, [setError, setCustomFaceMeshUrl]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  return (
    <div className="mb-3">
      <h3 className="text-xs text-gray-400 font-medium mb-1.5">Foto hochladen</h3>

      <div
        onClick={() => !uploading && fileInputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        className={`relative border-2 border-dashed rounded-lg p-3 text-center cursor-pointer transition-all ${
          uploading
            ? 'border-casino-gold/40 bg-casino-surface/50 cursor-wait'
            : 'border-casino-gold/20 hover:border-casino-gold/50 hover:bg-casino-surface/30'
        }`}
      >
        {preview ? (
          <div className="relative">
            <img
              src={preview}
              alt="Vorschau"
              className="w-16 h-16 rounded-full object-cover mx-auto mb-2"
            />
            {uploading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-lg">
                <div className="w-6 h-6 border-2 border-casino-gold border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>
        ) : (
          <div className="py-2">
            <span className="text-2xl block mb-1">📷</span>
            <span className="text-xs text-gray-500">Selfie hierher ziehen oder klicken</span>
          </div>
        )}

        {progress && (
          <p className="text-xs text-casino-gold mt-1">{progress}</p>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFileSelect(file);
          }}
          className="hidden"
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write TextInput component**

```typescript
import { useState, useCallback } from 'react';
import { useAvatarStore } from '../store/avatar';
import { avatarApi, ApiClientError } from '../api/client';

export default function TextInput() {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const setError = useAvatarStore((s) => s.setError);
  const selectPart = useAvatarStore((s) => s.selectPart);

  const handleSubmit = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    setSending(true);
    setError(null);

    try {
      const result = await avatarApi.interpretText(trimmed);
      // Apply suggested parts
      for (const [category, partId] of Object.entries(result.parts)) {
        selectPart(category, partId);
      }
      setText(''); // Clear on success
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.apiError.error === 'ai_service_unavailable') {
          setError('KI-Service nicht verfügbar. Bitte später erneut versuchen.');
        } else {
          setError('Text konnte nicht verarbeitet werden');
        }
      } else {
        setError('Verbindungsfehler');
      }
    } finally {
      setSending(false);
    }
  }, [text, sending, setError, selectPart]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  return (
    <div>
      <h3 className="text-xs text-gray-400 font-medium mb-1.5">Beschreibung eingeben</h3>
      <div className="flex gap-2">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="z.B. großer Mann mit Bart und Fedora..."
          disabled={sending}
          className="flex-1 bg-casino-surface border border-casino-gold/20 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-casino-gold/50 disabled:opacity-50"
        />
        <button
          onClick={handleSubmit}
          disabled={!text.trim() || sending}
          className="px-3 py-2 bg-casino-gold text-casino-darker rounded-lg text-sm font-medium hover:bg-casino-gold/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
        >
          {sending ? (
            <div className="w-4 h-4 border-2 border-casino-darker border-t-transparent rounded-full animate-spin" />
          ) : (
            '✨'
          )}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify in browser**

```bash
cd avatar-studio && npm run dev
```

Expected: Photo upload shows drag-and-drop zone with camera icon. Clicking opens file picker. Text input field with sparkle send button. Both show appropriate loading states and error messages when API is unavailable.

- [ ] **Step 4: Commit**

```bash
git add avatar-studio/src/components/PhotoUpload.tsx avatar-studio/src/components/TextInput.tsx
git commit -m "feat(avatar-studio): PhotoUpload + TextInput components with error handling"
```

---

## Chunk 4: Integration + Tests

### Task 11: Component Tests

**Files:**
- Create: `avatar-studio/tests/components.test.tsx`
- Modify: `avatar-studio/tests/setup.ts`

- [ ] **Step 1: Update test setup for React rendering**

`avatar-studio/tests/setup.ts`:
```typescript
import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => cleanup());
```

- [ ] **Step 2: Write component tests**

`avatar-studio/tests/components.test.tsx`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useAvatarStore } from '../src/store/avatar';

// Mock Three.js Canvas since it needs WebGL (not available in jsdom)
vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children }: { children: React.ReactNode }) => <div data-testid="canvas">{children}</div>,
  useFrame: vi.fn(),
  useThree: vi.fn(() => ({ gl: {}, scene: {}, camera: {} })),
}));

vi.mock('@react-three/drei', () => ({
  OrbitControls: () => null,
  PerspectiveCamera: () => null,
  Environment: () => null,
  ContactShadows: () => null,
  useGLTF: vi.fn(() => ({ scene: { clone: () => ({}) } })),
}));

// Import components after mocks
import PartSelector from '../src/components/PartSelector';
import ColorPicker from '../src/components/ColorPicker';
import SaveButton from '../src/components/SaveButton';
import PhotoUpload from '../src/components/PhotoUpload';
import TextInput from '../src/components/TextInput';

beforeEach(() => {
  useAvatarStore.setState(useAvatarStore.getInitialState());
});

describe('PartSelector', () => {
  it('renders category tabs', () => {
    render(<PartSelector parts={[]} partsLoading={false} />);
    expect(screen.getByText('Haare')).toBeInTheDocument();
    expect(screen.getByText('Oberkörper')).toBeInTheDocument();
    expect(screen.getByText('Hüte')).toBeInTheDocument();
  });

  it('switches active category on click', () => {
    render(<PartSelector parts={[]} partsLoading={false} />);
    fireEvent.click(screen.getByText('Haare'));
    expect(useAvatarStore.getState().activeCategory).toBe('hair');
  });

  it('shows loading indicator when partsLoading is true', () => {
    render(<PartSelector parts={[]} partsLoading={true} />);
    expect(screen.getByText(/laden/i)).toBeInTheDocument();
  });
});

describe('ColorPicker', () => {
  it('renders skin, eye, and hair color sections', () => {
    render(<ColorPicker />);
    expect(screen.getByText('Hautfarbe')).toBeInTheDocument();
    expect(screen.getByText('Augenfarbe')).toBeInTheDocument();
    expect(screen.getByText('Haarfarbe')).toBeInTheDocument();
  });

  it('updates skin color when preset clicked', () => {
    render(<ColorPicker />);
    const swatches = screen.getAllByRole('button');
    // Click first skin swatch (after the section label)
    fireEvent.click(swatches[0]);
    const newColor = useAvatarStore.getState().skinColor;
    expect(newColor).toBeTruthy();
  });
});

describe('SaveButton', () => {
  it('renders save button text', () => {
    render(<SaveButton />);
    expect(screen.getByText('Avatar Speichern')).toBeInTheDocument();
  });

  it('shows saving state when clicked', async () => {
    // Mock fetch to hang (simulate saving)
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    render(<SaveButton />);
    fireEvent.click(screen.getByText('Avatar Speichern'));
    await waitFor(() => {
      expect(screen.getByText(/gespeichert|speichern/i)).toBeInTheDocument();
    });
  });
});

describe('PhotoUpload', () => {
  it('renders upload zone', () => {
    render(<PhotoUpload onUpload={vi.fn()} />);
    expect(screen.getByText(/foto/i)).toBeInTheDocument();
  });
});

describe('TextInput', () => {
  it('renders text input field', () => {
    render(<TextInput onSubmit={vi.fn()} />);
    const input = screen.getByPlaceholderText(/beschreib/i);
    expect(input).toBeInTheDocument();
  });

  it('calls onSubmit when form submitted', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<TextInput onSubmit={onSubmit} />);
    const input = screen.getByPlaceholderText(/beschreib/i);
    fireEvent.change(input, { target: { value: 'großer Mann mit Bart' } });
    fireEvent.submit(input.closest('form')!);
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith('großer Mann mit Bart');
    });
  });
});
```

- [ ] **Step 3: Run component tests — verify they fail**

```bash
cd avatar-studio && npx vitest run tests/components.test.tsx
```

Expected: FAIL — components not yet integrated with expected prop interfaces

- [ ] **Step 4: Fix any component interface mismatches, then re-run**

Adjust component props if tests reveal interface issues (e.g., `PartSelector` expecting `parts` prop).

```bash
cd avatar-studio && npx vitest run
```

Expected: All tests PASS (API client + store + components)

- [ ] **Step 5: Commit**

```bash
git add avatar-studio/tests/
git commit -m "feat(avatar-studio): component tests for PartSelector, ColorPicker, SaveButton, PhotoUpload, TextInput"
```

---

### Task 12: SaveButton

**Files:**
- Create: `avatar-studio/src/components/SaveButton.tsx`

- [ ] **Step 1: Write SaveButton component**

```typescript
import { useState, useCallback } from 'react';
import { useAvatarStore } from '../store/avatar';
import { avatarApi, ApiClientError } from '../api/client';

export default function SaveButton() {
  const isSaving = useAvatarStore((s) => s.isSaving);
  const setSaving = useAvatarStore((s) => s.setSaving);
  const setError = useAvatarStore((s) => s.setError);
  const toSaveRequest = useAvatarStore((s) => s.toSaveRequest);
  const [saved, setSaved] = useState(false);

  const handleSave = useCallback(async () => {
    if (isSaving) return;

    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      const config = toSaveRequest();
      await avatarApi.saveAvatar(config);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.status === 401) {
          setError('Nicht eingeloggt. Bitte zuerst im Casino anmelden.');
        } else {
          setError('Speichern fehlgeschlagen. Bitte erneut versuchen.');
        }
      } else {
        setError('Verbindungsfehler beim Speichern');
      }
    } finally {
      setSaving(false);
    }
  }, [isSaving, setSaving, setError, toSaveRequest]);

  return (
    <button
      onClick={handleSave}
      disabled={isSaving}
      className={`w-full py-3 rounded-lg font-semibold text-sm transition-all ${
        saved
          ? 'bg-green-600 text-white'
          : isSaving
            ? 'bg-casino-gold/50 text-casino-darker cursor-wait'
            : 'bg-casino-gold text-casino-darker hover:bg-casino-gold/90 hover:shadow-[0_0_20px_rgba(212,175,55,0.3)]'
      }`}
    >
      {isSaving ? (
        <span className="flex items-center justify-center gap-2">
          <div className="w-4 h-4 border-2 border-casino-darker border-t-transparent rounded-full animate-spin" />
          Wird gespeichert...
        </span>
      ) : saved ? (
        <span>Gespeichert ✓</span>
      ) : (
        <span>Avatar Speichern</span>
      )}
    </button>
  );
}
```

- [ ] **Step 2: Verify in browser**

```bash
cd avatar-studio && npm run dev
```

Expected: Gold "Avatar Speichern" button at bottom of sidebar. Clicking it shows spinner, then error (since API not running) or success if API is running.

- [ ] **Step 3: Commit**

```bash
git add avatar-studio/src/components/SaveButton.tsx
git commit -m "feat(avatar-studio): SaveButton with loading + success states"
```

---

### Task 12: Full Integration — Load, Save, Error Handling

**Files:**
- Modify: `avatar-studio/src/App.tsx`
- Modify: `avatar-studio/src/hooks/useAvatar.ts`

- [ ] **Step 1: Add avatar loading on mount to App.tsx**

Update App.tsx to use `useAvatar` hook for initial load:

```typescript
// Add at the top of App.tsx:
import { useAvatar } from './hooks/useAvatar';

// Add inside App component, before the return:
// TODO: Get userId from JWT cookie or URL param once auth is integrated
// For development, use a test userId
const userId = new URLSearchParams(window.location.search).get('userId') || undefined;
const { partsLoading } = useAvatar(userId);
```

- [ ] **Step 2: Add global error boundary**

Create `avatar-studio/src/components/ErrorBoundary.tsx`:

```typescript
import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Avatar Studio Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-screen flex items-center justify-center bg-casino-darker">
          <div className="text-center p-8 max-w-md">
            <h1 className="text-casino-gold text-2xl font-display mb-4">Etwas ist schiefgelaufen</h1>
            <p className="text-gray-400 mb-6">
              {this.state.error?.message || 'Ein unerwarteter Fehler ist aufgetreten.'}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="px-6 py-3 bg-casino-gold text-casino-darker rounded-lg font-semibold hover:bg-casino-gold/90"
            >
              Seite neu laden
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
```

- [ ] **Step 3: Wrap App in ErrorBoundary in main.tsx**

Update `avatar-studio/src/main.tsx`:
```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
```

- [ ] **Step 4: Run full test suite**

```bash
cd avatar-studio && npx vitest run
```

Expected: All tests (API client + store) PASS

- [ ] **Step 5: Build check**

```bash
cd avatar-studio && npm run build
```

Expected: TypeScript compilation succeeds, Vite build completes with no errors. Output in `avatar-studio/dist/`.

- [ ] **Step 6: Integration test against Avatar API**

Start Avatar API (from Plan 1) and Avatar Studio simultaneously:

```bash
# Terminal 1: Start Avatar API
cd avatar-api && npm run dev

# Terminal 2: Start Avatar Studio
cd avatar-studio && npm run dev
```

Verify the full user flow in browser at http://localhost:5173:
1. Viewport renders with placeholder body
2. Sidebar shows all sections (gender, photo, text, parts, colors, save)
3. Changing skin color updates 3D model immediately
4. Changing eye color updates eye dots
5. Selecting/deselecting hair updates hair indicator
6. Switching lighting presets changes scene lighting
7. Photo upload shows error toast (KI service not running — expected)
8. Text input shows error toast (KI service not running — expected)
9. Save button sends data to API (creates avatar if API running)
10. Mobile responsive: sidebar collapses to drawer at <768px

- [ ] **Step 7: Final commit**

```bash
git add avatar-studio/
git commit -m "feat(avatar-studio): full integration — load, save, error boundary, dev-ready"
```

---

## Summary

After completing this plan, the Avatar Studio Frontend is fully functional with:
- Project scaffold: Vite + React 18 + TypeScript + TailwindCSS
- API client: typed client matching all Avatar API (Plan 1) endpoints
- Zustand store: complete avatar state management with 16 passing tests
- 3D Viewport: Three.js with OrbitControls, camera, contact shadows
- AvatarModel: placeholder humanoid body with real-time skin/eye/hair color changes
- 3 Lighting presets: Casino (golden/dramatic), Outdoor (natural), Studio (clean)
- Responsive layout: 70/30 desktop, drawer on mobile
- PartSelector: category tabs + thumbnail grid with selection state
- ColorPicker: skin/eye/hair with preset swatches + custom hex input
- PhotoUpload: drag-and-drop + file picker with validation and full error handling
- TextInput: text-to-parts with enter-to-submit
- SaveButton: save with loading/success/error states
- ErrorBoundary: graceful crash recovery
- Full test coverage: API client (mock-based) + Zustand store + component tests (PartSelector, ColorPicker, SaveButton, PhotoUpload, TextInput)

**Dependencies:**
- Requires Avatar API (Plan 1) running on localhost:4000 for full functionality
- 3D parts display requires real GLB files uploaded to MinIO — placeholder body works without them
- KI features (photo/text) return 503 until Plan 3 (KI-Service) is implemented

**Next:** Plan 3 (KI-Service) for photo-to-face and text-to-parts functionality.
