# 4K 3D Avatar Studio — Design Spec

## Übersicht

Eigenständige Web-App für fotorealistische 3D-Avatar-Erstellung. Läuft als eigenes Produkt auf `avatar.reisendescasino.de`. Das Browser-Casino ist die Eintrittür — Spieler erstellen dort ihren Avatar, der später überall im Ökosystem nutzbar ist (Casino, zukünftige Apps, VR, Metaverse). Spätere Integration von NVIDIA ACE für Sprache und Animation geplant.

## Entscheidungen

| Entscheidung | Wahl |
|---|---|
| Stil | Fotorealistisch (Web-optimiert, nahe MetaHuman-Qualität) |
| Erstellung | Baukasten (GLB-Teile) + KI (Foto→Gesicht, Text→Style) |
| Plattform | Eigene App, eigene Subdomain |
| Export | Erstmal nur im eigenen Ökosystem, kein Download |
| Monetarisierung | Erstmal alles gratis |
| Tech-Ansatz | Full Custom Stack |
| Editor Layout | Sidebar (Viewport 70% links, Parts 30% rechts) |

## Architektur

```
avatar.reisendescasino.de          reisendescasino.de
┌────────────────────────┐         ┌──────────────────┐
│  AVATAR STUDIO (React) │         │  CASINO (Vanilla) │
│  - Three.js Viewport   │         │  - Poker          │
│  - Part-Selector UI    │         │  - Blackjack      │
│  - Foto Upload         │         │  - Slots          │
│  - Text Beschreibung   │◄──API──►│  - Lobby          │
└──────────┬─────────────┘         └────────┬─────────┘
           │                                │
           ▼                                ▼
┌─────────────────────────────────────────────────────┐
│  AVATAR API (Node.js / Express)                     │
│  - GET  /api/avatar/:userId     (Avatar laden)      │
│  - POST /api/avatar/save        (Config speichern)  │
│  - POST /api/avatar/generate    (KI → 3D Gesicht)   │
│  - POST /api/avatar/interpret   (Text → Parts)      │
│  - GET  /api/avatar/parts       (Katalog der Teile) │
│  - GET  /api/avatar/parts/:id   (GLB laden)         │
│  - POST /api/avatar/thumbnail   (2D Vorschau)       │
└──────────┬──────────────┬───────────────────────────┘
           │              │
     ┌─────▼─────┐  ┌────▼──────────────────┐
     │ PostgreSQL │  │ KI-Service (Python)   │
     │ - Users    │  │ - Foto → 3D Mesh      │
     │ - Configs  │  │ - Text → Part-Auswahl │
     │ - Parts    │  │ (FastAPI + GPU)        │
     └───────────┘  └───────────────────────┘
           │
     ┌─────▼─────┐
     │ S3/MinIO   │
     │ - GLB Files│
     │ - Texturen │
     │ - Thumbnails│
     └───────────┘
```

### 4 Services

1. **Avatar Studio** — React Frontend, eigenständige SPA
2. **Avatar API** — Node.js/Express Backend, REST API für alle Clients
3. **KI-Service** — Python/FastAPI auf GPU-Server, Foto→3D + Text→Parts
4. **Storage** — PostgreSQL für Daten, S3/MinIO für 3D-Dateien und Texturen

Das Casino und alle zukünftigen Apps greifen über die gleiche Avatar API zu.

## 3D-Modell-System (Baukasten)

### Basis-Mesh
- 1 männlicher + 1 weiblicher Basis-Body, erstellt in Blender
- ~100k Tris (Kopf ~30k, Body ~50k, Hände ~20k), optimiert für WebGL
- Armature/Skeleton mit benannten Bones als Attachment Points
- Export als GLB mit PBR-Texturen:
  - Haut: 4K (Albedo, Normal, Roughness, AO)
  - Kleidung: 2K pro Teil
  - Accessoires: 1K pro Teil
- GPU-Speicher-Budget: max 350MB pro kompletter Avatar (alle Texturen geladen)

### Modulare Teile (jeweils eigene GLB-Datei)

Teile docken über **benannte Bones im Armature** an. Jedes Teil-GLB enthält einen Root-Bone der dem Attachment-Bone im Basis-Mesh entspricht. Der Editor matcht die Bones beim Laden automatisch.

| Kategorie | Launch-Anzahl | Attachment Bone | Textur-Res |
|---|---|---|---|
| Köpfe | 4 | `bone_neck` | 4K |
| Haare | 10 | `bone_head_top` | 2K |
| Augenbrauen | 6 | `bone_forehead` | 1K |
| Augen | 4 Iris-Texturen | `bone_eye_L/R` | 1K |
| Nasen | 4 | `bone_face_center` | 1K |
| Münder | 4 | `bone_lower_face` | 1K |
| Oberkörper | 6 (T-Shirt, Hemd, Jacke, Anzug, Hoodie, Tank) | `bone_torso` | 2K |
| Hosen | 4 (Jeans, Anzughose, Shorts, Jogger) | `bone_lower_body` | 2K |
| Schuhe | 4 (Sneaker, Stiefel, Elegant, Sandalen) | `bone_foot_L/R` | 1K |
| Accessoires | 6 (Brille, Kette, Uhr, Ohrringe, Ring, Piercing) | diverse `bone_*` | 1K |
| Hüte | 5 (Tophat, Cap, Crown, Fedora, Beanie) | `bone_head_top` | 1K |

### Funktionsweise
1. Basis-Body laden (GLB, ~2MB)
2. Spieler wählt Teile → GLB wird per API geladen und am richtigen Bone/Joint angedockt
3. Haut-Farbe + Augen-Farbe per Shader-Uniform anpassbar (kein neues Mesh nötig)
4. Haare-Farbe ebenfalls per Shader
5. Echtzeit-Preview im Three.js Viewport

### Beleuchtung im Editor
- Studio-Setup: 3-Punkt-Licht (Key, Fill, Rim) + HDRI Environment Map
- Beleuchtungs-Presets: "Casino", "Outdoor", "Studio"
- Post-Processing: Bloom, SSAO, Tone Mapping für 4K-Look

### Performance
- Lazy Loading: Teile werden erst geladen wenn ausgewählt
- LOD: Niedrigere Auflösung für Katalog-Thumbnails
- Texture Compression: KTX2/Basis für schnelleres Laden

## KI-System

### Foto → 3D-Gesicht

```
Selfie Upload
    → Validierung (Bildgröße, Format, min 512x512)
    → Face Detection (MediaPipe) — genau 1 Gesicht erwartet
    → Landmark Extraction (68 Punkte)
    → DECA Inference → FLAME-Parameter (shape, expression, pose)
    → FLAME-Parameter → Blendshape-Gewichte für Basis-Mesh-Kopf
    → Textur-Projektion (Foto → UV-Map des Basis-Mesh-Kopfs)
    → Textur Enhancement (Real-ESRGAN → 4K Upscale)
    → Fertiger Custom-Kopf (gleiche Topology wie Basis!)
```

**Retopology-Ansatz:** Wir verwenden NICHT das DECA-Output-Mesh direkt. Stattdessen:
1. DECA liefert FLAME-Parameter (shape coefficients, expression coefficients)
2. Unser Basis-Mesh-Kopf hat korrespondierende Blendshapes (aus FLAME-Topologie vorberechnet)
3. FLAME shape coefficients werden als Blendshape-Gewichte auf den Basis-Kopf angewendet
4. Ergebnis: personalisierte Gesichtsform MIT beibehaltener Basis-Topology und UVs
5. Textur wird per Projektion vom Foto auf die UV-Map des Basis-Kopfs gemapped

Das vermeidet den harten Retopology-Schritt komplett — wir bleiben immer auf unserer eigenen Topology.

- Open-Source Stack: FLAME (Gesichtsmodell) + DECA (Parameter-Extraktion)
- Blendshapes werden einmalig in Blender vorbereitet (FLAME→Basis-Mesh Mapping)
- Ergebnis: personalisiertes Gesichts-Mesh + projizierte Textur
- Spieler kann danach im Editor tweaken (Nase, Augen etc. = Blendshape-Slider)
- Verarbeitung: 30-45 Sekunden gesamt (Detection 2s + DECA 5s + Textur-Projektion 5s + Upscale 20s)
- Loading-Screen mit Fortschrittsanzeige während Verarbeitung

### Text → Part-Auswahl

```
Spieler tippt Beschreibung
    → Claude API interpretiert Text
    → Mapped auf vorhandene Parts im Katalog
    → Parts werden automatisch geladen
    → Spieler passt manuell an
```

- Kein eigenes Modell nötig — Claude API interpretiert die Beschreibung
- Mapped auf vorhandene Parts im Katalog

### Datenschutz
- Fotos werden nach Verarbeitung sofort gelöscht
- Kein Speichern der Selfies auf dem Server
- Nur das fertige 3D-Mesh wird gespeichert

## Editor UI

### Layout: Sidebar
- **Links (70%):** 3D Viewport mit OrbitControls, Beleuchtungs-Presets, Zoom/Rotate Buttons
- **Rechts (30%):** Foto-Upload/Text-Input oben, Kategorie-Liste darunter (Gesicht, Haare, Augen, Kleidung, Accessoires, Farben), Speichern-Button unten

### User Flow
1. Spieler öffnet `avatar.reisendescasino.de` (Login über Casino-Account)
2. Basis-Mesh wird geladen — männlich oder weiblich wählen
3. Optional: Foto hochladen → KI generiert Gesicht (5-15s)
4. Optional: Text eingeben → KI wählt passende Parts
5. Manuell anpassen: durch Kategorien klicken, Parts auswählen
6. Farben anpassen: Haut, Augen, Haare per Color Picker / Presets
7. Beleuchtung wechseln für verschiedene Ansichten
8. Speichern → Avatar wird auf Server gespeichert
9. Avatar erscheint automatisch im Casino (Poker, Lobby etc.)

### Responsive
- Desktop: Sidebar Layout (70/30)
- Mobile: Sidebar klappt zu Drawer um, Viewport wird Fullscreen mit Overlay-Controls

## Datenmodell

### PostgreSQL Schema

```sql
-- Avatar-Konfiguration
avatars (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  gender VARCHAR(10),          -- 'male' | 'female'
  skin_color VARCHAR(7),       -- Hex
  eye_color VARCHAR(7),
  hair_color VARCHAR(7),
  parts JSONB,                 -- { head: 'head_03', hair: 'long_curly', ... }
  custom_face_mesh_url TEXT,   -- S3 URL für KI-generiertes Gesicht
  thumbnail_url TEXT,          -- 2D Preview
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)

-- Verfügbare Teile
avatar_parts (
  id UUID PRIMARY KEY,
  category VARCHAR(50),        -- 'hair', 'top', 'hat', etc.
  name VARCHAR(100),
  glb_url TEXT,                -- S3 URL
  thumbnail_url TEXT,
  attachment_point VARCHAR(50),
  is_premium BOOLEAN DEFAULT false,
  metadata JSONB
)
```

## API Endpunkte

| Method | Endpoint | Beschreibung |
|---|---|---|
| GET | `/api/avatar/:userId` | Avatar-Config + URLs laden |
| POST | `/api/avatar/save` | Avatar speichern/aktualisieren |
| POST | `/api/avatar/generate` | Foto → 3D Gesicht (KI) |
| POST | `/api/avatar/interpret` | Text → Part-Vorschläge (Claude) |
| GET | `/api/avatar/parts` | Teile-Katalog (optional: ?category=hair) |
| GET | `/api/avatar/parts/:id/glb` | GLB-Datei eines Teils laden |
| POST | `/api/avatar/thumbnail` | 2D Thumbnail generieren und speichern |

### Error Handling

| Szenario | HTTP Status | Response |
|---|---|---|
| Avatar nicht gefunden | 404 | `{ error: "avatar_not_found" }` |
| Kein Gesicht im Foto erkannt | 422 | `{ error: "no_face_detected", hint: "Bitte lade ein Foto mit einem klar sichtbaren Gesicht hoch" }` |
| Mehrere Gesichter im Foto | 422 | `{ error: "multiple_faces", hint: "Bitte nur ein Gesicht im Bild" }` |
| Foto zu klein (< 512x512) | 422 | `{ error: "image_too_small", min: "512x512" }` |
| KI-Service nicht erreichbar | 503 | `{ error: "ai_service_unavailable", retry_after: 30 }` |
| KI-Service überlastet | 429 | `{ error: "ai_queue_full", position: 5, estimated_wait: 120 }` |
| S3/Storage Fehler | 502 | `{ error: "storage_error" }` |
| GLB-Teil nicht gefunden | 404 | `{ error: "part_not_found" }` |
| Ungültiger JWT | 401 | `{ error: "unauthorized" }` |
| Datei zu groß (> 10MB) | 413 | `{ error: "file_too_large", max: "10MB" }` |

KI-Requests werden in eine Queue gestellt. Frontend zeigt Fortschrittsanzeige mit Position und geschätzter Wartezeit.

## Tech Stack

### Avatar Studio (Frontend)
- React 18+ mit Vite
- Three.js (r160+) für 3D Rendering
- @react-three/fiber + @react-three/drei für React-Integration
- Zustand für State Management
- TailwindCSS für UI

### Avatar API (Backend)
- Node.js + Express
- PostgreSQL (via Prisma ORM)
- S3/MinIO SDK für File Storage
- JWT Auth (shared mit Casino)

### Cross-Subdomain Auth
- JWT Token wird auf Parent-Domain `.reisendescasino.de` als Cookie gesetzt
- Dadurch automatisch verfügbar auf `avatar.reisendescasino.de` und `reisendescasino.de`
- Cookie: `Set-Cookie: token=<jwt>; Domain=.reisendescasino.de; Path=/; HttpOnly; Secure; SameSite=Lax`
- CORS: Avatar API erlaubt Origins `https://reisendescasino.de` und `https://avatar.reisendescasino.de`
- Beide Apps nutzen denselben JWT-Secret für Token-Validierung

### KI-Service
- Python 3.11+
- FastAPI
- FLAME + DECA (Gesichtsrekonstruktion)
- MediaPipe (Face Detection)
- PyTorch (GPU Inference)

### Infrastructure
- GPU-Server für KI (z.B. Hetzner GPU, RunPod, oder eigener Server)
- S3-kompatibel für File Storage (MinIO self-hosted oder AWS S3)
- PostgreSQL (managed oder self-hosted)

## Testing

### Frontend (Avatar Studio)
- **Unit Tests:** Vitest für React-Komponenten und State Management
- **Visuelle Tests:** Storybook für UI-Komponenten (Part-Selector, Color Picker, Upload)
- **E2E Tests:** Playwright für kompletten User Flow (Login → Teil auswählen → Speichern)
- **3D Rendering:** Screenshot-Vergleichstests (Snapshot des WebGL Canvas gegen Referenzbild)

### Avatar API
- **Unit Tests:** Jest für Endpunkt-Handler und Validierung
- **Integration Tests:** Supertest gegen laufende API mit Test-Datenbank
- **S3 Tests:** LocalStack oder MinIO lokal für File-Upload/Download Tests

### KI-Service
- **Unit Tests:** pytest für Face Detection und Parameter-Extraktion
- **Integration Tests:** Test-Fotos mit bekannten Gesichtern → Ergebnis-Mesh gegen Referenz prüfen
- **Performance Tests:** Verarbeitungszeit pro Foto messen, sicherstellen < 60s

### Deployment
- Docker Compose für lokale Entwicklung (alle 4 Services)
- Produktion: einzelne Container pro Service, orchestriert via Docker Compose oder Kubernetes (je nach Skalierungsbedarf)

## Zukunft (nicht Teil dieser Spec)
- NVIDIA ACE Integration für Sprache und Gesichtsanimation
- Avatar-Export als GLB für externe Nutzung
- Premium-Items und Monetarisierung
- VR/AR-Kompatibilität
- Physischer Slot-Automat mit Avatar-Display
