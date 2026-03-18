# KI-Service Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Python KI-Service scaffold — working FastAPI endpoints with face detection, placeholder DECA/texture pipelines (landmark-based approximation), text→part mapping via Claude API. The actual DECA model integration and UV projection require the real basis mesh and pre-trained weights, which are a separate follow-up task once Blender assets are ready.

**Architecture:** FastAPI app with GPU inference. Two main pipelines: (1) Photo upload → MediaPipe face detection → DECA inference → FLAME parameters → blendshape weights for basis mesh head + texture projection + Real-ESRGAN upscale. (2) Text description → Claude API → map to available parts catalog.

**Tech Stack:** Python 3.11+, FastAPI, PyTorch, FLAME, DECA, MediaPipe, Real-ESRGAN, Anthropic SDK (Claude API), Uvicorn

**Spec:** `docs/superpowers/specs/2026-03-16-4k-avatar-studio-design.md`

---

## File Structure

```
ki-service/
├── pyproject.toml
├── Dockerfile
├── requirements.txt
├── .env.example
├── src/
│   ├── main.py               # FastAPI app entry point
│   ├── config.py              # Environment config
│   ├── routers/
│   │   ├── generate.py        # POST /generate — photo → 3D face
│   │   └── interpret.py       # POST /interpret — text → parts
│   ├── services/
│   │   ├── face_detection.py  # MediaPipe face detection + validation
│   │   ├── deca_inference.py  # DECA → FLAME parameters
│   │   ├── blendshape.py      # FLAME params → blendshape weights
│   │   ├── texture.py         # Photo → UV texture projection + Real-ESRGAN upscale
│   │   ├── text_interpret.py  # Claude API → part mapping
│   │   └── queue.py           # Processing queue with position tracking
│   ├── models/                # FLAME/DECA model weights (downloaded at build)
│   └── types.py               # Pydantic models
└── tests/
    ├── conftest.py
    ├── test_face_detection.py
    ├── test_deca.py
    ├── test_blendshape.py
    ├── test_texture.py
    ├── test_interpret.py
    └── test_api.py
```

---

## Model Weights Setup

DECA and FLAME require pre-trained model weights. These are NOT checked into git — they are downloaded at Docker build time or on first run.

**FLAME:**
- Source: https://flame.is.tue.mpg.de/ (requires academic registration)
- Files needed: `generic_model.pkl`, `FLAME_texture.npz`
- Place in: `ki-service/src/models/flame/`

**DECA:**
- Source: https://github.com/yfeng95/DECA (pretrained model)
- Files needed: `deca_model.tar`
- Place in: `ki-service/src/models/deca/`

**Real-ESRGAN:**
- Source: https://github.com/xinntao/Real-ESRGAN/releases
- Files needed: `RealESRGAN_x4plus.pth`
- Place in: `ki-service/src/models/realesrgan/`

A download script `ki-service/scripts/download_models.sh` is created in Task 1 to automate this.

---

## Chunk 1: Project Setup

### Task 1: Python project init (pyproject.toml, requirements.txt, Dockerfile)

**Files:**
- Create: `ki-service/pyproject.toml`
- Create: `ki-service/requirements.txt`
- Create: `ki-service/Dockerfile`
- Create: `ki-service/.env.example`
- Create: `ki-service/scripts/download_models.sh`

- [ ] **Step 1: Create project directory structure**

```bash
mkdir -p ki-service/src/routers
mkdir -p ki-service/src/services
mkdir -p ki-service/src/models/flame
mkdir -p ki-service/src/models/deca
mkdir -p ki-service/src/models/realesrgan
mkdir -p ki-service/tests
mkdir -p ki-service/scripts
touch ki-service/src/__init__.py
touch ki-service/src/routers/__init__.py
touch ki-service/src/services/__init__.py
touch ki-service/src/models/__init__.py
touch ki-service/tests/__init__.py
```

- [ ] **Step 2: Write pyproject.toml**

Write `ki-service/pyproject.toml`:
```toml
[project]
name = "ki-service"
version = "0.1.0"
description = "KI-Service for Avatar Studio — photo→3D face + text→parts"
requires-python = ">=3.11"

[tool.pytest.ini_options]
testpaths = ["tests"]
asyncio_mode = "auto"
```

- [ ] **Step 3: Write requirements.txt**

Write `ki-service/requirements.txt`:
```
# Web framework
fastapi==0.115.*
uvicorn[standard]==0.34.*
python-multipart==0.0.18

# ML / GPU
torch>=2.1.0
torchvision>=0.16.0

# Face detection
mediapipe>=0.10.9

# DECA / FLAME
scipy>=1.11.0
scikit-image>=0.22.0
opencv-python-headless>=4.9.0
chumpy>=0.70

# Texture upscale
realesrgan>=0.3.0
basicsr>=1.4.2

# Claude API
anthropic>=0.40.0

# Config
pydantic>=2.5.0
pydantic-settings>=2.1.0
python-dotenv>=1.0.0

# Testing
pytest>=8.0.0
pytest-asyncio>=0.23.0
httpx>=0.27.0
Pillow>=10.2.0

# Utilities
numpy>=1.26.0
```

- [ ] **Step 4: Write .env.example**

Write `ki-service/.env.example`:
```env
# Server
HOST=0.0.0.0
PORT=5000

# Model paths
FLAME_MODEL_PATH=src/models/flame/generic_model.pkl
DECA_MODEL_PATH=src/models/deca/deca_model.tar
ESRGAN_MODEL_PATH=src/models/realesrgan/RealESRGAN_x4plus.pth

# Claude API (for text→parts interpretation)
ANTHROPIC_API_KEY=sk-ant-...

# Queue
MAX_QUEUE_SIZE=10
MAX_CONCURRENT_JOBS=2

# Privacy: temp directory for photo processing (cleaned after each job)
TEMP_DIR=/tmp/ki-service

# Avatar API (for health checks / callbacks)
AVATAR_API_URL=http://localhost:4000

# CORS
CORS_ORIGINS=http://localhost:4000,http://localhost:3000
```

- [ ] **Step 5: Write Dockerfile**

Write `ki-service/Dockerfile`:
```dockerfile
FROM nvidia/cuda:12.1.0-runtime-ubuntu22.04

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.11 python3.11-venv python3-pip \
    libgl1-mesa-glx libglib2.0-0 wget unzip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python deps
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

# Download model weights
COPY scripts/download_models.sh scripts/
RUN chmod +x scripts/download_models.sh && scripts/download_models.sh

# App code
COPY src/ src/

# Create temp dir for photo processing
RUN mkdir -p /tmp/ki-service

EXPOSE 5000

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "5000"]
```

- [ ] **Step 6: Write model download script**

Write `ki-service/scripts/download_models.sh`:
```bash
#!/bin/bash
set -e

MODEL_DIR="src/models"
mkdir -p "$MODEL_DIR/flame" "$MODEL_DIR/deca" "$MODEL_DIR/realesrgan"

# Real-ESRGAN (publicly available)
if [ ! -f "$MODEL_DIR/realesrgan/RealESRGAN_x4plus.pth" ]; then
    echo "Downloading Real-ESRGAN model..."
    wget -q -O "$MODEL_DIR/realesrgan/RealESRGAN_x4plus.pth" \
        "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth"
fi

# FLAME and DECA require manual download (academic license)
if [ ! -f "$MODEL_DIR/flame/generic_model.pkl" ]; then
    echo "WARNING: FLAME model not found at $MODEL_DIR/flame/generic_model.pkl"
    echo "  Download from https://flame.is.tue.mpg.de/ and place in $MODEL_DIR/flame/"
fi

if [ ! -f "$MODEL_DIR/deca/deca_model.tar" ]; then
    echo "WARNING: DECA model not found at $MODEL_DIR/deca/deca_model.tar"
    echo "  Download from https://github.com/yfeng95/DECA and place in $MODEL_DIR/deca/"
fi

echo "Model setup complete."
```

- [ ] **Step 7: Add .gitignore for model weights**

Write `ki-service/.gitignore`:
```
# Model weights (too large for git)
src/models/flame/*.pkl
src/models/flame/*.npz
src/models/deca/*.tar
src/models/realesrgan/*.pth

# Python
__pycache__/
*.pyc
.venv/
*.egg-info/
dist/
build/

# Env
.env

# Temp
/tmp/
```

- [ ] **Step 8: Verify project structure**

```bash
cd ki-service && find . -type f | head -30
```

Expected: All files listed above visible in the tree.

- [ ] **Step 9: Commit**

```bash
git add ki-service/
git commit -m "feat(ki-service): project setup with pyproject.toml, Dockerfile, model download script"
```

---

### Task 2: FastAPI app with config, health endpoint, CORS

**Files:**
- Create: `ki-service/src/config.py`
- Create: `ki-service/src/main.py`

- [ ] **Step 1: Write test for health endpoint**

Write `ki-service/tests/test_api.py`:
```python
import pytest
from httpx import AsyncClient, ASGITransport
from src.main import app


@pytest.fixture
def client():
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


@pytest.mark.asyncio
async def test_health(client):
    resp = await client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert "gpu_available" in data
```

- [ ] **Step 2: Run test — verify it fails**

```bash
cd ki-service && python -m pytest tests/test_api.py::test_health -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'src.main'`

- [ ] **Step 3: Write config.py**

Write `ki-service/src/config.py`:
```python
from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    # Server
    host: str = "0.0.0.0"
    port: int = 5000

    # Model paths
    flame_model_path: str = "src/models/flame/generic_model.pkl"
    deca_model_path: str = "src/models/deca/deca_model.tar"
    esrgan_model_path: str = "src/models/realesrgan/RealESRGAN_x4plus.pth"

    # Claude API
    anthropic_api_key: str = ""

    # Queue
    max_queue_size: int = 10
    max_concurrent_jobs: int = 2

    # Privacy
    temp_dir: str = "/tmp/ki-service"

    # Avatar API
    avatar_api_url: str = "http://localhost:4000"

    # CORS
    cors_origins: str = "http://localhost:4000,http://localhost:3000"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
```

- [ ] **Step 4: Write main.py**

Write `ki-service/src/main.py`:
```python
import torch
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.config import settings

app = FastAPI(
    title="KI-Service — Avatar Studio",
    description="Photo→3D face reconstruction + Text→part mapping",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    gpu_available = torch.cuda.is_available()
    gpu_name = torch.cuda.get_device_name(0) if gpu_available else None
    return {
        "status": "ok",
        "gpu_available": gpu_available,
        "gpu_name": gpu_name,
    }
```

- [ ] **Step 5: Run test — verify it passes**

```bash
cd ki-service && python -m pytest tests/test_api.py::test_health -v
```

Expected: PASS — `test_health PASSED`

- [ ] **Step 6: Verify server starts manually**

```bash
cd ki-service && uvicorn src.main:app --host 0.0.0.0 --port 5000 &
sleep 2
curl http://localhost:5000/health
kill %1
```

Expected: `{"status":"ok","gpu_available":false,"gpu_name":null}` (or true + GPU name on GPU server)

- [ ] **Step 7: Commit**

```bash
git add ki-service/src/config.py ki-service/src/main.py ki-service/tests/test_api.py
git commit -m "feat(ki-service): FastAPI app with config, health endpoint, CORS"
```

---

### Task 3: Pydantic models / types

**Files:**
- Create: `ki-service/src/types.py`

- [ ] **Step 1: Write types.py**

Write `ki-service/src/types.py`:
```python
from pydantic import BaseModel, Field
from enum import Enum


# --- Error codes (match spec) ---

class ErrorCode(str, Enum):
    NO_FACE_DETECTED = "no_face_detected"
    MULTIPLE_FACES = "multiple_faces"
    IMAGE_TOO_SMALL = "image_too_small"
    AI_QUEUE_FULL = "ai_queue_full"
    AI_SERVICE_UNAVAILABLE = "ai_service_unavailable"
    INTERNAL_ERROR = "internal_error"


# --- Generate (photo → 3D face) ---

class GenerateRequest(BaseModel):
    """Metadata sent alongside the photo file upload."""
    user_id: str


class FaceDetectionResult(BaseModel):
    """Output of MediaPipe face detection."""
    landmarks: list[list[float]] = Field(
        description="68 facial landmarks as [x, y] pairs, normalized 0-1"
    )
    bbox: list[float] = Field(
        description="Bounding box [x, y, width, height], normalized 0-1"
    )
    confidence: float


class FlameParameters(BaseModel):
    """FLAME model parameters extracted by DECA."""
    shape_coefficients: list[float] = Field(
        description="100 FLAME shape coefficients"
    )
    expression_coefficients: list[float] = Field(
        description="50 FLAME expression coefficients"
    )
    pose: list[float] = Field(
        description="6 pose parameters (3 jaw + 3 global rotation)"
    )


class BlendshapeWeights(BaseModel):
    """Blendshape weights mapped from FLAME params to basis mesh."""
    weights: dict[str, float] = Field(
        description="Map of blendshape name → weight value (0.0 to 1.0)"
    )


class TextureResult(BaseModel):
    """Result of texture projection + upscale."""
    texture_url: str = Field(
        description="URL/path to the generated 4K UV texture"
    )
    resolution: tuple[int, int] = Field(
        default=(4096, 4096),
        description="Texture resolution in pixels"
    )


class GenerateProgress(BaseModel):
    """Progress update during face generation pipeline."""
    stage: str = Field(description="Current processing stage")
    progress: float = Field(
        ge=0.0, le=1.0,
        description="Progress 0.0 to 1.0"
    )
    message: str = Field(description="Human-readable status message")


class GenerateResponse(BaseModel):
    """Final response from /generate endpoint."""
    blendshape_weights: dict[str, float]
    texture_url: str
    texture_resolution: tuple[int, int] = (4096, 4096)
    processing_time_seconds: float


# --- Interpret (text → parts) ---

class PartSuggestion(BaseModel):
    """A single part suggestion from text interpretation."""
    category: str = Field(description="Part category (hair, top, hat, etc.)")
    part_id: str = Field(description="UUID of the matched part")
    part_name: str = Field(description="Human-readable part name")
    confidence: float = Field(
        ge=0.0, le=1.0,
        description="How confident the match is"
    )
    reason: str = Field(description="Why this part was chosen")


class InterpretRequest(BaseModel):
    """Request to interpret text into part selections."""
    text: str = Field(
        min_length=1, max_length=500,
        description="User's text description of desired avatar look"
    )
    catalog: list[dict] = Field(
        description="Available parts catalog passed from Avatar API"
    )


class InterpretResponse(BaseModel):
    """Response from /interpret endpoint."""
    suggestions: list[PartSuggestion]
    raw_interpretation: str = Field(
        description="Claude's raw text interpretation for debugging"
    )


# --- Queue ---

class QueueStatus(BaseModel):
    """Queue position info returned with 429 responses."""
    position: int
    estimated_wait: int = Field(description="Estimated wait in seconds")


# --- Error response ---

class ErrorResponse(BaseModel):
    error: str
    hint: str | None = None
    min: str | None = None
    position: int | None = None
    estimated_wait: int | None = None
    retry_after: int | None = None
```

- [ ] **Step 2: Write test for types**

Write `ki-service/tests/test_types.py`:
```python
from src.types import (
    GenerateResponse,
    InterpretRequest,
    InterpretResponse,
    PartSuggestion,
    ErrorResponse,
    FlameParameters,
    BlendshapeWeights,
    ErrorCode,
)


def test_generate_response_serialization():
    resp = GenerateResponse(
        blendshape_weights={"jaw_open": 0.3, "brow_raise_L": 0.1},
        texture_url="https://storage.example.com/textures/abc123.png",
        processing_time_seconds=32.5,
    )
    data = resp.model_dump()
    assert data["blendshape_weights"]["jaw_open"] == 0.3
    assert data["texture_resolution"] == (4096, 4096)


def test_interpret_request_validation():
    req = InterpretRequest(
        text="großer Mann mit schwarzem Bart und Fedora",
        catalog=[
            {"id": "uuid-1", "category": "hat", "name": "Fedora"},
            {"id": "uuid-2", "category": "hair", "name": "Short"},
        ],
    )
    assert len(req.catalog) == 2


def test_interpret_response():
    resp = InterpretResponse(
        suggestions=[
            PartSuggestion(
                category="hat",
                part_id="uuid-1",
                part_name="Fedora",
                confidence=0.95,
                reason="User explicitly mentioned 'Fedora'",
            ),
        ],
        raw_interpretation="The user wants a tall man with a black beard and fedora hat.",
    )
    assert resp.suggestions[0].confidence == 0.95


def test_flame_parameters():
    params = FlameParameters(
        shape_coefficients=[0.1] * 100,
        expression_coefficients=[0.0] * 50,
        pose=[0.0] * 6,
    )
    assert len(params.shape_coefficients) == 100
    assert len(params.expression_coefficients) == 50


def test_error_response():
    err = ErrorResponse(
        error=ErrorCode.AI_QUEUE_FULL,
        position=3,
        estimated_wait=90,
    )
    data = err.model_dump()
    assert data["error"] == "ai_queue_full"
    assert data["position"] == 3


def test_blendshape_weights():
    bw = BlendshapeWeights(weights={"jaw_open": 0.5, "smile_L": 0.8})
    assert bw.weights["smile_L"] == 0.8
```

- [ ] **Step 3: Run tests — verify they pass**

```bash
cd ki-service && python -m pytest tests/test_types.py -v
```

Expected: 6 tests PASS

- [ ] **Step 4: Commit**

```bash
git add ki-service/src/types.py ki-service/tests/test_types.py
git commit -m "feat(ki-service): Pydantic models for generate, interpret, queue, errors"
```

---

## Chunk 2: Face Detection + Validation

### Task 4: MediaPipe face detection service

**Files:**
- Create: `ki-service/src/services/face_detection.py`
- Create: `ki-service/tests/test_face_detection.py`

- [ ] **Step 1: Write face detection tests**

Write `ki-service/tests/test_face_detection.py`:
```python
import pytest
import numpy as np
from PIL import Image
import io

from src.services.face_detection import FaceDetector, FaceDetectionError


@pytest.fixture
def detector():
    return FaceDetector()


def _make_blank_image(width: int, height: int, color=(200, 180, 160)) -> bytes:
    """Create a blank image as bytes (no face)."""
    img = Image.new("RGB", (width, height), color)
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


def _make_face_image(width: int = 1024, height: int = 1024) -> bytes:
    """Create a synthetic image with a face-like oval shape.

    Note: MediaPipe may not detect this as a real face.
    For reliable tests, use a real test photo.
    This test primarily validates the validation logic.
    """
    img = Image.new("RGB", (width, height), (200, 180, 160))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


class TestImageValidation:
    """Tests for image validation (size checks) — no ML needed."""

    def test_rejects_too_small_image(self, detector):
        """Images smaller than 512x512 must be rejected."""
        small_img = _make_blank_image(256, 256)
        with pytest.raises(FaceDetectionError) as exc_info:
            detector.validate_image(small_img)
        assert exc_info.value.error_code == "image_too_small"

    def test_accepts_valid_size_image(self, detector):
        """Images >= 512x512 must pass size validation."""
        valid_img = _make_blank_image(512, 512)
        width, height = detector.validate_image(valid_img)
        assert width == 512
        assert height == 512

    def test_accepts_large_image(self, detector):
        """Large images should pass validation."""
        large_img = _make_blank_image(2048, 1536)
        width, height = detector.validate_image(large_img)
        assert width == 2048
        assert height == 1536

    def test_rejects_narrow_image(self, detector):
        """Image where one dimension is < 512 must be rejected."""
        narrow_img = _make_blank_image(1024, 400)
        with pytest.raises(FaceDetectionError) as exc_info:
            detector.validate_image(narrow_img)
        assert exc_info.value.error_code == "image_too_small"


class TestFaceDetection:
    """Tests for actual face detection — requires MediaPipe."""

    def test_no_face_in_blank_image(self, detector):
        """Blank image should raise no_face_detected."""
        blank = _make_blank_image(512, 512)
        with pytest.raises(FaceDetectionError) as exc_info:
            detector.detect(blank)
        assert exc_info.value.error_code == "no_face_detected"
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd ki-service && python -m pytest tests/test_face_detection.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'src.services.face_detection'`

- [ ] **Step 3: Write face detection service**

Write `ki-service/src/services/face_detection.py`:
```python
import io
import numpy as np
from PIL import Image
import mediapipe as mp

from src.types import FaceDetectionResult


class FaceDetectionError(Exception):
    """Raised when face detection fails with a specific error code."""

    def __init__(self, error_code: str, hint: str, min_size: str | None = None):
        self.error_code = error_code
        self.hint = hint
        self.min_size = min_size
        super().__init__(hint)


class FaceDetector:
    """MediaPipe-based face detection with validation."""

    MIN_IMAGE_SIZE = 512

    def __init__(self):
        self._face_detection = mp.solutions.face_detection.FaceDetection(
            model_selection=1,  # Full-range model (better for varied distances)
            min_detection_confidence=0.5,
        )
        self._face_mesh = mp.solutions.face_mesh.FaceMesh(
            static_image_mode=True,
            max_num_faces=5,  # Detect up to 5 to catch multiple_faces
            refine_landmarks=True,
            min_detection_confidence=0.5,
        )

    def validate_image(self, image_bytes: bytes) -> tuple[int, int]:
        """Validate image dimensions. Returns (width, height).

        Raises:
            FaceDetectionError: if image is too small (< 512x512)
        """
        img = Image.open(io.BytesIO(image_bytes))
        width, height = img.size

        if width < self.MIN_IMAGE_SIZE or height < self.MIN_IMAGE_SIZE:
            raise FaceDetectionError(
                error_code="image_too_small",
                hint=f"Bild muss mindestens {self.MIN_IMAGE_SIZE}x{self.MIN_IMAGE_SIZE} Pixel sein",
                min_size=f"{self.MIN_IMAGE_SIZE}x{self.MIN_IMAGE_SIZE}",
            )

        return width, height

    def detect(self, image_bytes: bytes) -> FaceDetectionResult:
        """Detect exactly one face in the image.

        Pipeline:
        1. Validate image size (>= 512x512)
        2. Run MediaPipe face detection
        3. Ensure exactly 1 face detected
        4. Extract 468 facial landmarks via FaceMesh
        5. Return top 68 landmarks (compatible with DECA/FLAME)

        Raises:
            FaceDetectionError: no_face_detected, multiple_faces, or image_too_small
        """
        # Step 1: Validate size
        self.validate_image(image_bytes)

        # Step 2: Load image as numpy array
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        img_array = np.array(img)

        # Step 3: Face detection (bounding box + confidence)
        detection_results = self._face_detection.process(img_array)

        if not detection_results.detections:
            raise FaceDetectionError(
                error_code="no_face_detected",
                hint="Bitte lade ein Foto mit einem klar sichtbaren Gesicht hoch",
            )

        if len(detection_results.detections) > 1:
            raise FaceDetectionError(
                error_code="multiple_faces",
                hint="Bitte nur ein Gesicht im Bild",
            )

        # Step 4: Extract bounding box from detection
        detection = detection_results.detections[0]
        bbox = detection.location_data.relative_bounding_box
        bbox_list = [bbox.xmin, bbox.ymin, bbox.width, bbox.height]
        confidence = detection.score[0]

        # Step 5: FaceMesh for detailed landmarks
        mesh_results = self._face_mesh.process(img_array)

        if not mesh_results.multi_face_landmarks:
            raise FaceDetectionError(
                error_code="no_face_detected",
                hint="Gesicht erkannt aber Landmarks konnten nicht extrahiert werden",
            )

        if len(mesh_results.multi_face_landmarks) > 1:
            raise FaceDetectionError(
                error_code="multiple_faces",
                hint="Bitte nur ein Gesicht im Bild",
            )

        # Step 6: Extract landmarks (use first 68 for DECA compatibility)
        face_landmarks = mesh_results.multi_face_landmarks[0]
        # MediaPipe provides 468 landmarks. We take a subset mapping to
        # the standard 68-point face landmark scheme.
        # Mapping indices from MediaPipe 468 → 68 point standard
        MEDIAPIPE_TO_68 = [
            # Jaw line (17 points)
            10, 338, 297, 332, 284, 251, 389, 356, 454,
            323, 361, 288, 397, 365, 379, 378, 400,
            # Right eyebrow (5 points)
            46, 53, 52, 65, 55,
            # Left eyebrow (5 points)
            285, 295, 282, 283, 276,
            # Nose bridge (4 points)
            6, 197, 195, 5,
            # Nose bottom (5 points)
            48, 115, 220, 45, 4,
            # Right eye (6 points)
            33, 160, 158, 133, 153, 144,
            # Left eye (6 points)
            362, 385, 387, 263, 373, 380,
            # Outer lip (12 points)
            61, 39, 37, 0, 267, 269, 291, 321, 314, 17, 84, 91,
            # Inner lip (8 points)
            78, 82, 87, 14, 317, 312, 308, 324,
        ]

        landmarks_68 = []
        for idx in MEDIAPIPE_TO_68:
            lm = face_landmarks.landmark[idx]
            landmarks_68.append([lm.x, lm.y])

        return FaceDetectionResult(
            landmarks=landmarks_68,
            bbox=bbox_list,
            confidence=float(confidence),
        )

    def close(self):
        """Release MediaPipe resources."""
        self._face_detection.close()
        self._face_mesh.close()
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd ki-service && python -m pytest tests/test_face_detection.py -v
```

Expected: 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add ki-service/src/services/face_detection.py ki-service/tests/test_face_detection.py
git commit -m "feat(ki-service): MediaPipe face detection with validation (size, count)"
```

---

### Task 5: Face detection router integration

**Files:**
- Modify: `ki-service/src/main.py`
- Create: `ki-service/src/routers/generate.py`
- Modify: `ki-service/tests/test_api.py`

- [ ] **Step 1: Write router-level tests for face detection errors**

Append to `ki-service/tests/test_api.py`:
```python
import io
from PIL import Image


def _make_blank_image(width: int, height: int) -> bytes:
    img = Image.new("RGB", (width, height), (200, 180, 160))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


@pytest.mark.asyncio
async def test_generate_no_photo(client):
    """POST /generate without photo returns 422."""
    resp = await client.post("/generate", data={"user_id": "test-user"})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_generate_image_too_small(client):
    """POST /generate with small image returns 422 image_too_small."""
    small_img = _make_blank_image(256, 256)
    resp = await client.post(
        "/generate",
        files={"photo": ("small.jpg", small_img, "image/jpeg")},
        data={"user_id": "test-user"},
    )
    assert resp.status_code == 422
    assert resp.json()["error"] == "image_too_small"
    assert resp.json()["min"] == "512x512"


@pytest.mark.asyncio
async def test_generate_no_face(client):
    """POST /generate with blank image returns 422 no_face_detected."""
    blank_img = _make_blank_image(512, 512)
    resp = await client.post(
        "/generate",
        files={"photo": ("blank.jpg", blank_img, "image/jpeg")},
        data={"user_id": "test-user"},
    )
    assert resp.status_code == 422
    assert resp.json()["error"] == "no_face_detected"
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd ki-service && python -m pytest tests/test_api.py -v
```

Expected: FAIL — `/generate` endpoint not found (404)

- [ ] **Step 3: Write generate router (face detection phase only)**

Write `ki-service/src/routers/generate.py`:
```python
import os
import uuid
import time
from fastapi import APIRouter, File, UploadFile, Form, HTTPException
from fastapi.responses import JSONResponse

from src.types import ErrorResponse, GenerateResponse
from src.services.face_detection import FaceDetector, FaceDetectionError
from src.services.queue import ProcessingQueue, QueueFullError
from src.config import settings

router = APIRouter()

# Singleton instances
_face_detector = FaceDetector()
_queue = ProcessingQueue(
    max_size=settings.max_queue_size,
    max_concurrent=settings.max_concurrent_jobs,
)


@router.post("/generate")
async def generate_face(
    photo: UploadFile = File(...),
    user_id: str = Form(...),
):
    """Photo → 3D face reconstruction pipeline.

    Pipeline stages (30-45 seconds total):
    1. Face detection + validation (~2s)
    2. DECA inference → FLAME parameters (~5s)
    3. FLAME → blendshape weights (~1s)
    4. Texture projection → UV map (~5s)
    5. Real-ESRGAN upscale → 4K (~20s)

    Error codes:
    - 422 no_face_detected: No face found in photo
    - 422 multiple_faces: More than one face detected
    - 422 image_too_small: Image < 512x512
    - 429 ai_queue_full: Processing queue is full
    - 503 ai_service_unavailable: Service error
    """
    start_time = time.time()

    # Check queue capacity
    try:
        queue_position = _queue.enqueue(user_id)
    except QueueFullError as e:
        return JSONResponse(
            status_code=429,
            content={
                "error": "ai_queue_full",
                "position": e.position,
                "estimated_wait": e.estimated_wait,
            },
        )

    # Create temp directory for this job
    job_id = str(uuid.uuid4())
    temp_dir = os.path.join(settings.temp_dir, job_id)
    os.makedirs(temp_dir, exist_ok=True)

    try:
        # Read uploaded photo
        image_bytes = await photo.read()

        # --- Stage 1: Face detection + validation ---
        try:
            face_result = _face_detector.detect(image_bytes)
        except FaceDetectionError as e:
            error_data: dict = {"error": e.error_code, "hint": e.hint}
            if e.min_size:
                error_data["min"] = e.min_size
            return JSONResponse(status_code=422, content=error_data)

        # --- Stage 2: DECA inference ---
        # TODO: Implement in Task 6
        # flame_params = deca_service.infer(image_bytes, face_result)

        # --- Stage 3: Blendshape mapping ---
        # TODO: Implement in Task 7
        # blendshape_weights = blendshape_service.map(flame_params)

        # --- Stage 4+5: Texture projection + upscale ---
        # TODO: Implement in Task 8
        # texture_result = texture_service.project_and_upscale(image_bytes, face_result)

        # For now, return placeholder response indicating face was detected
        processing_time = time.time() - start_time
        return JSONResponse(
            status_code=200,
            content={
                "status": "face_detected",
                "landmarks_count": len(face_result.landmarks),
                "confidence": face_result.confidence,
                "message": "Face detection OK — DECA/blendshape/texture pipeline not yet implemented",
                "processing_time_seconds": round(processing_time, 2),
            },
        )

    except Exception as e:
        return JSONResponse(
            status_code=503,
            content={"error": "ai_service_unavailable", "retry_after": 30},
        )

    finally:
        # Privacy: delete temp files
        import shutil
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)

        # Remove from queue
        _queue.dequeue(user_id)
```

- [ ] **Step 4: Create queue service stub** (needed for generate router)

Write `ki-service/src/services/queue.py`:
```python
import threading
import time
from collections import OrderedDict


class QueueFullError(Exception):
    """Raised when the processing queue is at capacity."""

    def __init__(self, position: int, estimated_wait: int):
        self.position = position
        self.estimated_wait = estimated_wait
        super().__init__(f"Queue full. Position: {position}, wait: {estimated_wait}s")


class ProcessingQueue:
    """Thread-safe processing queue with position tracking.

    Tracks active jobs and queued requests. Returns queue position
    and estimated wait time when full (for 429 responses).

    Average processing time per job: ~40 seconds (per spec: 30-45s).
    """

    AVG_JOB_SECONDS = 40

    def __init__(self, max_size: int = 10, max_concurrent: int = 2):
        self._max_size = max_size
        self._max_concurrent = max_concurrent
        self._lock = threading.Lock()
        self._active: OrderedDict[str, float] = OrderedDict()  # user_id → start_time
        self._waiting: OrderedDict[str, float] = OrderedDict()  # user_id → enqueue_time

    @property
    def active_count(self) -> int:
        return len(self._active)

    @property
    def waiting_count(self) -> int:
        return len(self._waiting)

    @property
    def total_count(self) -> int:
        return self.active_count + self.waiting_count

    def enqueue(self, user_id: str) -> int:
        """Add a job to the queue. Returns queue position (1-based).

        Raises:
            QueueFullError: if queue is at max capacity
        """
        with self._lock:
            # Already in queue?
            if user_id in self._active or user_id in self._waiting:
                pos = self._get_position(user_id)
                return pos

            # Queue full?
            if self.total_count >= self._max_size:
                position = self._max_size + 1
                estimated_wait = position * self.AVG_JOB_SECONDS
                raise QueueFullError(position=position, estimated_wait=estimated_wait)

            # Can start immediately?
            if self.active_count < self._max_concurrent:
                self._active[user_id] = time.time()
                return 0  # 0 = processing now

            # Must wait
            self._waiting[user_id] = time.time()
            return self._get_position(user_id)

    def dequeue(self, user_id: str) -> None:
        """Remove a completed job and promote next waiting job."""
        with self._lock:
            self._active.pop(user_id, None)
            self._waiting.pop(user_id, None)

            # Promote waiting → active
            while (
                self.active_count < self._max_concurrent
                and self.waiting_count > 0
            ):
                next_user, enqueue_time = self._waiting.popitem(last=False)
                self._active[next_user] = time.time()

    def get_status(self, user_id: str) -> dict:
        """Get queue status for a user."""
        with self._lock:
            if user_id in self._active:
                return {"status": "processing", "position": 0}
            if user_id in self._waiting:
                pos = self._get_position(user_id)
                return {
                    "status": "waiting",
                    "position": pos,
                    "estimated_wait": pos * self.AVG_JOB_SECONDS,
                }
            return {"status": "not_in_queue"}

    def _get_position(self, user_id: str) -> int:
        """Get 1-based position in queue (active jobs count as ahead)."""
        if user_id in self._active:
            return 0
        waiting_list = list(self._waiting.keys())
        if user_id in waiting_list:
            return self.active_count + waiting_list.index(user_id) + 1
        return -1
```

- [ ] **Step 5: Register router in main.py**

Update `ki-service/src/main.py` — add router import and include after the health endpoint:

Add after `from src.config import settings`:
```python
from src.routers.generate import router as generate_router
```

Add after the health endpoint:
```python
app.include_router(generate_router)
```

- [ ] **Step 6: Run tests — verify they pass**

```bash
cd ki-service && python -m pytest tests/test_api.py -v
```

Expected: All tests PASS (health, image_too_small, no_face)

- [ ] **Step 7: Commit**

```bash
git add ki-service/src/routers/generate.py ki-service/src/services/queue.py ki-service/src/main.py ki-service/tests/test_api.py
git commit -m "feat(ki-service): /generate endpoint with face detection, validation, queue"
```

---

## Chunk 3: DECA + Blendshape Pipeline

### Task 6: DECA inference service (photo → FLAME parameters)

**Files:**
- Create: `ki-service/src/services/deca_inference.py`
- Create: `ki-service/tests/test_deca.py`

- [ ] **Step 1: Write DECA inference tests**

Write `ki-service/tests/test_deca.py`:
```python
import pytest
import numpy as np
from unittest.mock import patch, MagicMock

from src.services.deca_inference import DECAService
from src.types import FaceDetectionResult, FlameParameters


@pytest.fixture
def mock_deca_service():
    """Create DECA service with mocked model (no GPU needed for tests)."""
    with patch("src.services.deca_inference.DECAService._load_model"):
        service = DECAService.__new__(DECAService)
        service._model = None
        service._device = "cpu"
        service._loaded = False
        return service


def _make_face_result() -> FaceDetectionResult:
    """Create a realistic face detection result for testing."""
    return FaceDetectionResult(
        landmarks=[[0.3 + i * 0.005, 0.3 + i * 0.003] for i in range(68)],
        bbox=[0.2, 0.15, 0.6, 0.7],
        confidence=0.98,
    )


class TestDECAServiceInterface:
    """Test DECA service interface without actual model loading."""

    def test_flame_params_shape(self, mock_deca_service):
        """FLAME parameters must have correct dimensions."""
        # Simulate DECA output
        mock_output = {
            "shape": np.random.randn(1, 100).astype(np.float32),
            "exp": np.random.randn(1, 50).astype(np.float32),
            "pose": np.random.randn(1, 6).astype(np.float32),
        }

        params = mock_deca_service._raw_to_flame_params(mock_output)

        assert isinstance(params, FlameParameters)
        assert len(params.shape_coefficients) == 100
        assert len(params.expression_coefficients) == 50
        assert len(params.pose) == 6

    def test_coefficients_are_floats(self, mock_deca_service):
        """All coefficients must be Python floats (JSON serializable)."""
        mock_output = {
            "shape": np.array([[0.1, -0.2] + [0.0] * 98], dtype=np.float32),
            "exp": np.array([[0.0] * 50], dtype=np.float32),
            "pose": np.array([[0.0] * 6], dtype=np.float32),
        }

        params = mock_deca_service._raw_to_flame_params(mock_output)

        for val in params.shape_coefficients:
            assert isinstance(val, float)

    def test_normalize_shape_coefficients(self, mock_deca_service):
        """Shape coefficients should be clamped to reasonable range."""
        mock_output = {
            "shape": np.array([[100.0, -100.0] + [0.0] * 98], dtype=np.float32),
            "exp": np.array([[0.0] * 50], dtype=np.float32),
            "pose": np.array([[0.0] * 6], dtype=np.float32),
        }

        params = mock_deca_service._raw_to_flame_params(mock_output)

        # Values should be clamped to [-3, 3] (3 standard deviations)
        assert all(-3.0 <= v <= 3.0 for v in params.shape_coefficients)
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd ki-service && python -m pytest tests/test_deca.py -v
```

Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: Write DECA inference service**

Write `ki-service/src/services/deca_inference.py`:
```python
import os
import io
import numpy as np
import torch
from PIL import Image

from src.types import FaceDetectionResult, FlameParameters
from src.config import settings


class DECAService:
    """DECA inference: photo → FLAME shape/expression/pose parameters.

    Uses the DECA model to extract FLAME parameters from a face photo.
    The FLAME parameters are then used to drive blendshapes on the
    basis mesh head (Task 7).

    Processing time: ~5 seconds on GPU.
    """

    SHAPE_COEFF_COUNT = 100
    EXPRESSION_COEFF_COUNT = 50
    POSE_PARAM_COUNT = 6
    COEFF_CLAMP = 3.0  # Clamp to ±3 standard deviations

    def __init__(self):
        self._model = None
        self._device = "cuda" if torch.cuda.is_available() else "cpu"
        self._loaded = False

    def _load_model(self):
        """Lazy-load the DECA model on first inference.

        DECA model file expected at settings.deca_model_path.
        This avoids slow startup when model isn't needed yet.
        """
        if self._loaded:
            return

        model_path = settings.deca_model_path
        if not os.path.exists(model_path):
            raise FileNotFoundError(
                f"DECA model not found at {model_path}. "
                "Run scripts/download_models.sh first."
            )

        # Load DECA model
        # In production, this would use the actual DECA library:
        #   from decalib.deca import DECA
        #   from decalib.utils.config import cfg
        #   cfg.model.topology_path = ...
        #   cfg.model.flame_model_path = settings.flame_model_path
        #   self._model = DECA(cfg, device=self._device)
        #
        # For now, we load the checkpoint directly:
        checkpoint = torch.load(model_path, map_location=self._device)
        self._model = checkpoint
        self._loaded = True

    def infer(
        self,
        image_bytes: bytes,
        face_result: FaceDetectionResult,
    ) -> FlameParameters:
        """Run DECA inference on a face photo.

        Args:
            image_bytes: Raw image bytes (JPEG/PNG)
            face_result: Face detection result with landmarks and bbox

        Returns:
            FlameParameters with shape, expression, and pose coefficients
        """
        self._load_model()

        # Crop face region using bbox
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        img_array = np.array(img)
        h, w = img_array.shape[:2]

        bbox = face_result.bbox
        x1 = max(0, int(bbox[0] * w) - 20)
        y1 = max(0, int(bbox[1] * h) - 20)
        x2 = min(w, int((bbox[0] + bbox[2]) * w) + 20)
        y2 = min(h, int((bbox[1] + bbox[3]) * h) + 20)

        face_crop = img_array[y1:y2, x1:x2]

        # Resize to DECA input size (224x224)
        face_img = Image.fromarray(face_crop).resize((224, 224))
        face_tensor = torch.from_numpy(
            np.array(face_img).transpose(2, 0, 1)
        ).float().unsqueeze(0) / 255.0
        face_tensor = face_tensor.to(self._device)

        # Run DECA inference
        # In production:
        #   with torch.no_grad():
        #       codedict = self._model.encode(face_tensor)
        #       raw_output = {
        #           "shape": codedict["shape"].cpu().numpy(),
        #           "exp": codedict["exp"].cpu().numpy(),
        #           "pose": codedict["pose"].cpu().numpy(),
        #       }
        #
        # Placeholder: generate synthetic FLAME params from face landmarks
        # This will be replaced with actual DECA inference when model weights are available
        raw_output = self._landmark_to_flame(face_result)

        return self._raw_to_flame_params(raw_output)

    def placeholder_inference(
        self, face_result: FaceDetectionResult
    ) -> FlameParameters:
        """Public fallback when DECA model is not available.
        Derives approximate FLAME params from landmarks."""
        raw = self._landmark_to_flame(face_result)
        return self._raw_to_flame_params(raw)

    def _landmark_to_flame(
        self, face_result: FaceDetectionResult
    ) -> dict[str, np.ndarray]:
        """Temporary: derive approximate FLAME params from landmarks.

        This is a placeholder until the actual DECA model is loaded.
        It generates reasonable-looking FLAME parameters from the
        face landmark positions.
        """
        landmarks = np.array(face_result.landmarks)

        # Derive rough shape from landmark spread
        face_width = np.max(landmarks[:17, 0]) - np.min(landmarks[:17, 0])
        face_height = np.max(landmarks[:, 1]) - np.min(landmarks[:, 1])

        shape = np.zeros((1, self.SHAPE_COEFF_COUNT), dtype=np.float32)
        shape[0, 0] = (face_width - 0.4) * 5.0  # Width → first shape coeff
        shape[0, 1] = (face_height - 0.5) * 5.0  # Height → second shape coeff

        # Expression from mouth/eye landmarks
        exp = np.zeros((1, self.EXPRESSION_COEFF_COUNT), dtype=np.float32)
        if len(landmarks) >= 68:
            mouth_open = landmarks[66, 1] - landmarks[62, 1]  # Approximate
            exp[0, 0] = mouth_open * 10.0  # Jaw open

        pose = np.zeros((1, self.POSE_PARAM_COUNT), dtype=np.float32)

        return {"shape": shape, "exp": exp, "pose": pose}

    def _raw_to_flame_params(self, raw_output: dict) -> FlameParameters:
        """Convert raw DECA output arrays to FlameParameters.

        Clamps coefficients to ±3 standard deviations to avoid
        extreme deformations.
        """
        shape = np.clip(
            raw_output["shape"].flatten(),
            -self.COEFF_CLAMP,
            self.COEFF_CLAMP,
        )
        exp = np.clip(
            raw_output["exp"].flatten(),
            -self.COEFF_CLAMP,
            self.COEFF_CLAMP,
        )
        pose = raw_output["pose"].flatten()

        # Pad/truncate to exact sizes
        shape_padded = np.zeros(self.SHAPE_COEFF_COUNT, dtype=np.float32)
        shape_padded[: len(shape)] = shape[: self.SHAPE_COEFF_COUNT]

        exp_padded = np.zeros(self.EXPRESSION_COEFF_COUNT, dtype=np.float32)
        exp_padded[: len(exp)] = exp[: self.EXPRESSION_COEFF_COUNT]

        pose_padded = np.zeros(self.POSE_PARAM_COUNT, dtype=np.float32)
        pose_padded[: len(pose)] = pose[: self.POSE_PARAM_COUNT]

        return FlameParameters(
            shape_coefficients=[float(v) for v in shape_padded],
            expression_coefficients=[float(v) for v in exp_padded],
            pose=[float(v) for v in pose_padded],
        )
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd ki-service && python -m pytest tests/test_deca.py -v
```

Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add ki-service/src/services/deca_inference.py ki-service/tests/test_deca.py
git commit -m "feat(ki-service): DECA inference service with FLAME parameter extraction"
```

---

### Task 7: Blendshape mapping (FLAME coefficients → blendshape weights)

**Files:**
- Create: `ki-service/src/services/blendshape.py`
- Create: `ki-service/tests/test_blendshape.py`

- [ ] **Step 1: Write blendshape tests**

Write `ki-service/tests/test_blendshape.py`:
```python
import pytest
from src.services.blendshape import BlendshapeMapper
from src.types import FlameParameters, BlendshapeWeights


@pytest.fixture
def mapper():
    return BlendshapeMapper()


def _make_neutral_params() -> FlameParameters:
    """All-zero FLAME params = neutral face."""
    return FlameParameters(
        shape_coefficients=[0.0] * 100,
        expression_coefficients=[0.0] * 50,
        pose=[0.0] * 6,
    )


def _make_shaped_params() -> FlameParameters:
    """Non-zero shape params = personalized face."""
    shape = [0.0] * 100
    shape[0] = 1.5   # Wide face
    shape[1] = -0.8   # Short face
    shape[2] = 0.6   # Prominent jaw
    return FlameParameters(
        shape_coefficients=shape,
        expression_coefficients=[0.0] * 50,
        pose=[0.0] * 6,
    )


class TestBlendshapeMapper:

    def test_neutral_face_returns_zero_weights(self, mapper):
        """Neutral FLAME params should produce near-zero blendshape weights."""
        params = _make_neutral_params()
        result = mapper.map(params)
        assert isinstance(result, BlendshapeWeights)
        for name, weight in result.weights.items():
            assert abs(weight) < 0.01, f"{name} should be ~0 for neutral face"

    def test_shaped_face_returns_nonzero_weights(self, mapper):
        """Non-neutral shape params should produce non-zero weights."""
        params = _make_shaped_params()
        result = mapper.map(params)
        nonzero = [n for n, w in result.weights.items() if abs(w) > 0.01]
        assert len(nonzero) > 0, "Shaped face should have non-zero weights"

    def test_weights_are_normalized(self, mapper):
        """All weights must be in range [0.0, 1.0]."""
        params = _make_shaped_params()
        result = mapper.map(params)
        for name, weight in result.weights.items():
            assert 0.0 <= weight <= 1.0, f"{name}={weight} out of range"

    def test_all_blendshape_names_present(self, mapper):
        """Result must include all defined blendshape names."""
        params = _make_neutral_params()
        result = mapper.map(params)
        expected_names = mapper.BLENDSHAPE_NAMES
        for name in expected_names:
            assert name in result.weights, f"Missing blendshape: {name}"

    def test_expression_affects_weights(self, mapper):
        """Expression coefficients should affect expression blendshapes."""
        params = FlameParameters(
            shape_coefficients=[0.0] * 100,
            expression_coefficients=[2.0] + [0.0] * 49,  # Strong jaw_open
            pose=[0.0] * 6,
        )
        result = mapper.map(params)
        # jaw_open should be activated
        assert result.weights.get("jaw_open", 0.0) > 0.1

    def test_deterministic(self, mapper):
        """Same input should always produce same output."""
        params = _make_shaped_params()
        result1 = mapper.map(params)
        result2 = mapper.map(params)
        assert result1.weights == result2.weights
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd ki-service && python -m pytest tests/test_blendshape.py -v
```

Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: Write blendshape mapper**

Write `ki-service/src/services/blendshape.py`:
```python
import numpy as np
from src.types import FlameParameters, BlendshapeWeights


class BlendshapeMapper:
    """Maps FLAME parameters to blendshape weights for the basis mesh head.

    The basis mesh head has pre-computed blendshapes that correspond to
    FLAME shape/expression deformations. This mapper converts the
    continuous FLAME coefficients into normalized [0, 1] weights.

    Shape blendshapes affect facial structure (bone structure, proportions).
    Expression blendshapes affect facial expressions (mouth, eyes, brows).

    The mapping matrix is pre-computed in Blender by:
    1. Importing the FLAME model
    2. Driving each FLAME coefficient to +1 / -1
    3. Recording the resulting vertex offsets on the basis mesh
    4. Storing as blendshape targets
    """

    # Blendshape names on the basis mesh head.
    # These correspond to the deformations our Blender artist creates.
    BLENDSHAPE_NAMES = [
        # Shape (facial structure) — driven by FLAME shape coefficients
        "face_width",
        "face_height",
        "jaw_width",
        "jaw_length",
        "chin_size",
        "cheekbone_height",
        "cheekbone_width",
        "forehead_height",
        "forehead_width",
        "nose_length",
        "nose_width",
        "nose_bridge",
        "nose_tip",
        "eye_size",
        "eye_spacing",
        "eye_depth",
        "brow_height",
        "lip_thickness_upper",
        "lip_thickness_lower",
        "lip_width",
        # Expression — driven by FLAME expression coefficients
        "jaw_open",
        "jaw_left",
        "jaw_right",
        "smile_L",
        "smile_R",
        "frown_L",
        "frown_R",
        "brow_raise_L",
        "brow_raise_R",
        "brow_lower_L",
        "brow_lower_R",
        "eye_wide_L",
        "eye_wide_R",
        "eye_squint_L",
        "eye_squint_R",
        "nose_wrinkle",
        "lip_pucker",
        "cheek_puff_L",
        "cheek_puff_R",
        "mouth_press",
    ]

    # Number of shape vs expression blendshapes
    N_SHAPE_BLENDSHAPES = 20
    N_EXPRESSION_BLENDSHAPES = 20

    def __init__(self):
        # Mapping matrix: FLAME shape coefficients → shape blendshapes
        # Each row maps one FLAME coefficient to one blendshape.
        # In production, this matrix is calibrated per basis mesh.
        # For now, use a simplified direct mapping for the first N coefficients.
        self._shape_mapping = self._build_shape_mapping()
        self._expression_mapping = self._build_expression_mapping()

    def _build_shape_mapping(self) -> np.ndarray:
        """Build mapping from FLAME shape coefficients (100) to shape blendshapes (20).

        Returns: (20, 100) matrix where each row defines how FLAME shape
        coefficients contribute to one blendshape.
        """
        mapping = np.zeros(
            (self.N_SHAPE_BLENDSHAPES, 100), dtype=np.float32
        )
        # Simplified 1:1 mapping for first 20 FLAME coefficients
        # In production: calibrated per basis mesh via Blender script
        for i in range(min(self.N_SHAPE_BLENDSHAPES, 100)):
            mapping[i, i] = 1.0

        return mapping

    def _build_expression_mapping(self) -> np.ndarray:
        """Build mapping from FLAME expression coefficients (50) to expression blendshapes (20).

        Returns: (20, 50) matrix.
        """
        mapping = np.zeros(
            (self.N_EXPRESSION_BLENDSHAPES, 50), dtype=np.float32
        )
        # Simplified 1:1 mapping for first 20 FLAME expression coefficients
        for i in range(min(self.N_EXPRESSION_BLENDSHAPES, 50)):
            mapping[i, i] = 1.0

        return mapping

    def map(self, flame_params: FlameParameters) -> BlendshapeWeights:
        """Convert FLAME parameters to blendshape weights.

        Steps:
        1. Multiply shape coefficients by shape mapping matrix
        2. Multiply expression coefficients by expression mapping matrix
        3. Apply sigmoid normalization to map to [0, 1]
        4. Package as named weights dict

        Args:
            flame_params: FLAME shape, expression, and pose parameters

        Returns:
            BlendshapeWeights with all blendshape names mapped to [0, 1]
        """
        shape_coeffs = np.array(flame_params.shape_coefficients, dtype=np.float32)
        expr_coeffs = np.array(
            flame_params.expression_coefficients, dtype=np.float32
        )

        # Matrix multiply: (20, 100) @ (100,) → (20,)
        raw_shape_weights = self._shape_mapping @ shape_coeffs

        # Matrix multiply: (20, 50) @ (50,) → (20,)
        raw_expr_weights = self._expression_mapping @ expr_coeffs

        # Normalize to [0, 1] using sigmoid
        shape_weights = self._sigmoid_normalize(raw_shape_weights)
        expr_weights = self._sigmoid_normalize(raw_expr_weights)

        # Build named weights dict
        weights: dict[str, float] = {}
        for i, name in enumerate(self.BLENDSHAPE_NAMES):
            if i < self.N_SHAPE_BLENDSHAPES:
                weights[name] = float(shape_weights[i])
            else:
                expr_idx = i - self.N_SHAPE_BLENDSHAPES
                weights[name] = float(expr_weights[expr_idx])

        return BlendshapeWeights(weights=weights)

    @staticmethod
    def _sigmoid_normalize(values: np.ndarray) -> np.ndarray:
        """Normalize values to [0, 1] using sigmoid function.

        Maps 0 → 0.5, positive → closer to 1, negative → closer to 0.
        Then rescale so that 0 input → 0 output (neutral = no deformation).
        """
        # Sigmoid: 1 / (1 + exp(-x))
        sigmoid = 1.0 / (1.0 + np.exp(-values))
        # Rescale: sigmoid(0) = 0.5, so subtract 0.5 and multiply by 2
        # This maps: 0 → 0, positive → (0, 1), negative → (-1, 0)
        normalized = (sigmoid - 0.5) * 2.0
        # Clamp to [0, 1] (discard negative = opposite direction deformations)
        return np.clip(normalized, 0.0, 1.0)
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd ki-service && python -m pytest tests/test_blendshape.py -v
```

Expected: 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add ki-service/src/services/blendshape.py ki-service/tests/test_blendshape.py
git commit -m "feat(ki-service): blendshape mapper (FLAME coefficients → basis mesh weights)"
```

---

### Task 8: Texture projection + Real-ESRGAN upscale

**Files:**
- Create: `ki-service/src/services/texture.py`
- Create: `ki-service/tests/test_texture.py`

- [ ] **Step 1: Write texture tests**

Write `ki-service/tests/test_texture.py`:
```python
import pytest
import io
import os
import numpy as np
from PIL import Image
from unittest.mock import patch, MagicMock

from src.services.texture import TextureService
from src.types import FaceDetectionResult, TextureResult


@pytest.fixture
def texture_service():
    """TextureService with mocked Real-ESRGAN (no GPU needed)."""
    with patch("src.services.texture.TextureService._load_upscaler"):
        service = TextureService.__new__(TextureService)
        service._upscaler = None
        service._upscaler_loaded = False
        return service


def _make_test_image(width=1024, height=1024) -> bytes:
    """Create a test image with face-like colors."""
    img = np.zeros((height, width, 3), dtype=np.uint8)
    # Skin-tone face region
    cy, cx = height // 2, width // 2
    for y in range(height):
        for x in range(width):
            dist = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
            if dist < min(width, height) * 0.3:
                img[y, x] = [200, 160, 140]  # Skin tone
            else:
                img[y, x] = [50, 50, 80]  # Background
    pil_img = Image.fromarray(img)
    buf = io.BytesIO()
    pil_img.save(buf, format="JPEG")
    return buf.getvalue()


def _make_face_result() -> FaceDetectionResult:
    return FaceDetectionResult(
        landmarks=[[0.3 + i * 0.005, 0.3 + i * 0.003] for i in range(68)],
        bbox=[0.2, 0.15, 0.6, 0.7],
        confidence=0.98,
    )


class TestTextureProjection:

    def test_project_creates_uv_map(self, texture_service):
        """Projection should create a UV texture image."""
        image_bytes = _make_test_image()
        face_result = _make_face_result()

        uv_texture = texture_service.project(image_bytes, face_result)

        assert isinstance(uv_texture, np.ndarray)
        assert uv_texture.shape[2] == 3  # RGB
        assert uv_texture.shape[0] >= 512  # At least 512px
        assert uv_texture.shape[1] >= 512

    def test_project_output_is_square(self, texture_service):
        """UV texture should be square (for UV mapping)."""
        image_bytes = _make_test_image()
        face_result = _make_face_result()

        uv_texture = texture_service.project(image_bytes, face_result)

        assert uv_texture.shape[0] == uv_texture.shape[1]

    def test_upscale_without_model_returns_resized(self, texture_service):
        """Without Real-ESRGAN model, upscale falls back to Pillow resize."""
        small_texture = np.zeros((512, 512, 3), dtype=np.uint8)

        result = texture_service.upscale(small_texture, target_size=4096)

        assert result.shape == (4096, 4096, 3)

    def test_save_texture(self, texture_service, tmp_path):
        """Should save texture as PNG to given path."""
        texture = np.random.randint(0, 255, (1024, 1024, 3), dtype=np.uint8)
        output_path = str(tmp_path / "test_texture.png")

        result = texture_service.save(texture, output_path)

        assert os.path.exists(output_path)
        saved_img = Image.open(output_path)
        assert saved_img.size == (1024, 1024)
        assert result == output_path
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd ki-service && python -m pytest tests/test_texture.py -v
```

Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: Write texture service**

Write `ki-service/src/services/texture.py`:
```python
import os
import io
import numpy as np
from PIL import Image

from src.types import FaceDetectionResult, TextureResult
from src.config import settings


class TextureService:
    """Photo → UV texture projection + Real-ESRGAN 4K upscale.

    Pipeline:
    1. Extract face region from photo using bbox
    2. Project face pixels onto UV coordinate space
    3. Fill gaps with inpainting / color interpolation
    4. Upscale to 4K using Real-ESRGAN (or Pillow fallback)

    Processing time: ~5s projection + ~20s upscale = ~25s total.
    """

    DEFAULT_UV_SIZE = 1024  # Initial UV map size before upscale
    TARGET_4K_SIZE = 4096   # Final texture resolution

    def __init__(self):
        self._upscaler = None
        self._upscaler_loaded = False

    def _load_upscaler(self):
        """Lazy-load Real-ESRGAN model."""
        if self._upscaler_loaded:
            return

        model_path = settings.esrgan_model_path
        if not os.path.exists(model_path):
            print(f"WARNING: Real-ESRGAN model not found at {model_path}. "
                  "Using Pillow resize as fallback.")
            self._upscaler_loaded = True
            return

        try:
            from realesrgan import RealESRGANer
            from basicsr.archs.rrdbnet_arch import RRDBNet
            import torch

            model = RRDBNet(
                num_in_ch=3, num_out_ch=3, num_feat=64,
                num_block=23, num_grow_ch=32, scale=4,
            )

            device = "cuda" if torch.cuda.is_available() else "cpu"

            self._upscaler = RealESRGANer(
                scale=4,
                model_path=model_path,
                model=model,
                tile=400,  # Process in tiles to save GPU memory
                tile_pad=10,
                pre_pad=0,
                half=torch.cuda.is_available(),  # FP16 on GPU
                device=device,
            )
        except ImportError:
            print("WARNING: Real-ESRGAN not installed. Using Pillow resize.")

        self._upscaler_loaded = True

    def project(
        self,
        image_bytes: bytes,
        face_result: FaceDetectionResult,
    ) -> np.ndarray:
        """Project face photo onto UV coordinate space.

        Uses facial landmarks to establish correspondence between
        photo pixels and UV coordinates on the basis mesh head.

        Args:
            image_bytes: Raw photo bytes
            face_result: Face detection result with landmarks

        Returns:
            UV texture as numpy array (H, W, 3), uint8
        """
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        img_array = np.array(img)
        h, w = img_array.shape[:2]

        # Extract face region with padding
        bbox = face_result.bbox
        pad = 0.1  # 10% padding around face
        x1 = max(0, int((bbox[0] - pad) * w))
        y1 = max(0, int((bbox[1] - pad) * h))
        x2 = min(w, int((bbox[0] + bbox[2] + pad) * w))
        y2 = min(h, int((bbox[1] + bbox[3] + pad) * h))

        face_crop = img_array[y1:y2, x1:x2]

        # Resize face crop to square UV map
        face_img = Image.fromarray(face_crop)
        uv_size = self.DEFAULT_UV_SIZE
        face_resized = face_img.resize((uv_size, uv_size), Image.LANCZOS)

        # Create UV texture map
        uv_texture = np.array(face_resized)

        # Apply UV mapping correction using landmarks
        # In production: use a pre-computed UV correspondence map
        # that maps face landmark positions to UV coordinates on
        # the basis mesh head. This involves:
        # 1. For each UV texel, find nearest face landmark
        # 2. Interpolate photo pixel color at that position
        # 3. Use barycentric interpolation within landmark triangles
        #
        # For now: the face crop serves as a first approximation.
        # The Blender-side UV layout is designed to match a frontal
        # face photo projection.

        return uv_texture

    def upscale(
        self,
        texture: np.ndarray,
        target_size: int = TARGET_4K_SIZE,
    ) -> np.ndarray:
        """Upscale texture to target resolution.

        Uses Real-ESRGAN if available, falls back to Pillow LANCZOS.

        Args:
            texture: Input texture as numpy array (H, W, 3)
            target_size: Target resolution (square)

        Returns:
            Upscaled texture as numpy array (target_size, target_size, 3)
        """
        self._load_upscaler()

        if self._upscaler is not None:
            try:
                # Real-ESRGAN upscale (4x)
                output, _ = self._upscaler.enhance(texture, outscale=4)

                # Resize to exact target if needed
                if output.shape[0] != target_size or output.shape[1] != target_size:
                    output_img = Image.fromarray(output)
                    output_img = output_img.resize(
                        (target_size, target_size), Image.LANCZOS
                    )
                    output = np.array(output_img)

                return output
            except Exception as e:
                print(f"Real-ESRGAN failed, falling back to Pillow: {e}")

        # Fallback: Pillow LANCZOS resize
        img = Image.fromarray(texture)
        img_upscaled = img.resize((target_size, target_size), Image.LANCZOS)
        return np.array(img_upscaled)

    def save(self, texture: np.ndarray, output_path: str) -> str:
        """Save texture to disk as PNG.

        Args:
            texture: Texture as numpy array (H, W, 3)
            output_path: File path to save to

        Returns:
            The output path (for chaining)
        """
        os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
        img = Image.fromarray(texture)
        img.save(output_path, format="PNG", optimize=True)
        return output_path

    def project_and_upscale(
        self,
        image_bytes: bytes,
        face_result: FaceDetectionResult,
        output_path: str,
    ) -> TextureResult:
        """Full pipeline: project → upscale → save.

        Args:
            image_bytes: Raw photo bytes
            face_result: Face detection result
            output_path: Where to save the final texture

        Returns:
            TextureResult with URL and resolution
        """
        # Project face onto UV map (~5s)
        uv_texture = self.project(image_bytes, face_result)

        # Upscale to 4K (~20s)
        upscaled = self.upscale(uv_texture, self.TARGET_4K_SIZE)

        # Save
        saved_path = self.save(upscaled, output_path)

        return TextureResult(
            texture_url=saved_path,
            resolution=(self.TARGET_4K_SIZE, self.TARGET_4K_SIZE),
        )
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd ki-service && python -m pytest tests/test_texture.py -v
```

Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add ki-service/src/services/texture.py ki-service/tests/test_texture.py
git commit -m "feat(ki-service): texture projection + Real-ESRGAN upscale (4K)"
```

---

## Chunk 4: Text Interpretation + Queue + Full Pipeline

### Task 9: Claude API text interpretation (text → part IDs)

**Files:**
- Create: `ki-service/src/services/text_interpret.py`
- Create: `ki-service/tests/test_interpret.py`

- [ ] **Step 1: Write text interpretation tests**

Write `ki-service/tests/test_interpret.py`:
```python
import pytest
from unittest.mock import patch, MagicMock, AsyncMock

from src.services.text_interpret import TextInterpreter
from src.types import InterpretRequest, InterpretResponse


SAMPLE_CATALOG = [
    {"id": "uuid-hair-short", "category": "hair", "name": "Short"},
    {"id": "uuid-hair-long", "category": "hair", "name": "Long Curly"},
    {"id": "uuid-hair-slick", "category": "hair", "name": "Slick"},
    {"id": "uuid-top-tshirt", "category": "top", "name": "T-Shirt"},
    {"id": "uuid-top-suit", "category": "top", "name": "Anzug"},
    {"id": "uuid-top-hoodie", "category": "top", "name": "Hoodie"},
    {"id": "uuid-hat-fedora", "category": "hat", "name": "Fedora"},
    {"id": "uuid-hat-crown", "category": "hat", "name": "Crown"},
    {"id": "uuid-hat-tophat", "category": "hat", "name": "Tophat"},
    {"id": "uuid-acc-glasses", "category": "accessory", "name": "Brille"},
    {"id": "uuid-acc-chain", "category": "accessory", "name": "Kette"},
]


@pytest.fixture
def interpreter():
    return TextInterpreter()


class TestPromptBuilding:

    def test_build_prompt_includes_catalog(self, interpreter):
        """The Claude prompt must include all catalog items."""
        prompt = interpreter._build_prompt(
            "Mann mit Fedora und Anzug", SAMPLE_CATALOG
        )
        assert "Fedora" in prompt
        assert "Anzug" in prompt
        assert "uuid-hat-fedora" in prompt

    def test_build_prompt_includes_user_text(self, interpreter):
        """The Claude prompt must include the user's description."""
        prompt = interpreter._build_prompt(
            "große Frau mit lockigen Haaren", SAMPLE_CATALOG
        )
        assert "große Frau mit lockigen Haaren" in prompt


class TestResponseParsing:

    def test_parse_valid_json_response(self, interpreter):
        """Valid JSON from Claude should parse into PartSuggestions."""
        claude_response = """
        {
            "suggestions": [
                {
                    "category": "hat",
                    "part_id": "uuid-hat-fedora",
                    "part_name": "Fedora",
                    "confidence": 0.95,
                    "reason": "User explicitly mentioned Fedora"
                },
                {
                    "category": "top",
                    "part_id": "uuid-top-suit",
                    "part_name": "Anzug",
                    "confidence": 0.9,
                    "reason": "User wants a suit"
                }
            ],
            "interpretation": "The user wants a man wearing a Fedora hat and suit."
        }
        """
        result = interpreter._parse_response(claude_response, SAMPLE_CATALOG)

        assert isinstance(result, InterpretResponse)
        assert len(result.suggestions) == 2
        assert result.suggestions[0].part_id == "uuid-hat-fedora"
        assert result.suggestions[1].category == "top"

    def test_parse_filters_invalid_part_ids(self, interpreter):
        """Part IDs not in catalog should be filtered out."""
        claude_response = """
        {
            "suggestions": [
                {
                    "category": "hat",
                    "part_id": "INVALID-ID",
                    "part_name": "Nonexistent",
                    "confidence": 0.5,
                    "reason": "Hallucinated"
                },
                {
                    "category": "hat",
                    "part_id": "uuid-hat-fedora",
                    "part_name": "Fedora",
                    "confidence": 0.95,
                    "reason": "Valid match"
                }
            ],
            "interpretation": "Test"
        }
        """
        result = interpreter._parse_response(claude_response, SAMPLE_CATALOG)

        assert len(result.suggestions) == 1
        assert result.suggestions[0].part_id == "uuid-hat-fedora"

    def test_parse_handles_malformed_json(self, interpreter):
        """Malformed Claude response should return empty suggestions."""
        result = interpreter._parse_response(
            "This is not JSON at all", SAMPLE_CATALOG
        )
        assert len(result.suggestions) == 0
        assert "parse" in result.raw_interpretation.lower() or len(result.raw_interpretation) > 0


class TestInterpretIntegration:

    @pytest.mark.asyncio
    async def test_interpret_calls_claude(self, interpreter):
        """interpret() should call Claude API and return parsed result."""
        mock_message = MagicMock()
        mock_message.content = [MagicMock()]
        mock_message.content[0].text = """
        {
            "suggestions": [
                {
                    "category": "hair",
                    "part_id": "uuid-hair-long",
                    "part_name": "Long Curly",
                    "confidence": 0.85,
                    "reason": "User mentioned curly hair"
                }
            ],
            "interpretation": "User wants curly hair."
        }
        """

        with patch.object(
            interpreter, "_client", create=True
        ) as mock_client:
            mock_client.messages.create = AsyncMock(return_value=mock_message)

            request = InterpretRequest(
                text="Frau mit lockigen Haaren",
                catalog=SAMPLE_CATALOG,
            )
            result = await interpreter.interpret(request)

            assert len(result.suggestions) == 1
            assert result.suggestions[0].part_name == "Long Curly"
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd ki-service && python -m pytest tests/test_interpret.py -v
```

Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: Write text interpretation service**

Write `ki-service/src/services/text_interpret.py`:
```python
import json
import anthropic

from src.types import (
    InterpretRequest,
    InterpretResponse,
    PartSuggestion,
)
from src.config import settings


class TextInterpreter:
    """Text → part selection using Claude API.

    Receives a text description from the user and the available parts
    catalog from the Avatar API. Uses Claude to interpret the description
    and map it to specific part IDs.

    The catalog is passed from the Avatar API on each request (not cached)
    to ensure the interpreter always uses the current parts list.
    """

    MODEL = "claude-sonnet-4-20250514"
    MAX_TOKENS = 1024

    def __init__(self):
        if settings.anthropic_api_key:
            self._client = anthropic.AsyncAnthropic(
                api_key=settings.anthropic_api_key,
            )
        else:
            self._client = None

    async def interpret(self, request: InterpretRequest) -> InterpretResponse:
        """Interpret text description and map to parts catalog.

        Args:
            request: Text description + parts catalog

        Returns:
            InterpretResponse with suggestions and raw interpretation

        Raises:
            RuntimeError: if Claude API is not configured
        """
        if self._client is None:
            raise RuntimeError(
                "ANTHROPIC_API_KEY not configured. Cannot interpret text."
            )

        prompt = self._build_prompt(request.text, request.catalog)

        message = await self._client.messages.create(
            model=self.MODEL,
            max_tokens=self.MAX_TOKENS,
            messages=[{"role": "user", "content": prompt}],
        )

        response_text = message.content[0].text
        return self._parse_response(response_text, request.catalog)

    def _build_prompt(self, text: str, catalog: list[dict]) -> str:
        """Build the Claude prompt with catalog and user text.

        The prompt instructs Claude to:
        1. Interpret the user's avatar description
        2. Map it to specific parts from the catalog
        3. Return structured JSON with part IDs and confidence
        """
        catalog_str = json.dumps(catalog, indent=2, ensure_ascii=False)

        return f"""Du bist ein Avatar-Stylist für ein Online-Casino. Ein Spieler beschreibt, wie sein Avatar aussehen soll. Deine Aufgabe: wähle die passenden Teile aus dem Katalog aus.

## Verfügbare Teile (Katalog)

{catalog_str}

## Spieler-Beschreibung

"{text}"

## Antwort-Format

Antworte NUR mit validem JSON in diesem Format:

{{
    "suggestions": [
        {{
            "category": "kategorie",
            "part_id": "exakte-id-aus-katalog",
            "part_name": "name-aus-katalog",
            "confidence": 0.0-1.0,
            "reason": "Kurze Begründung auf Deutsch"
        }}
    ],
    "interpretation": "Deine Interpretation der Beschreibung auf Deutsch"
}}

Regeln:
- Verwende NUR part_id Werte die im Katalog existieren
- confidence: 1.0 = explizit genannt, 0.7-0.9 = stark impliziert, 0.5-0.7 = schwache Vermutung
- Wenn nichts passt, gib leere suggestions zurück
- Maximal 1 Teil pro Kategorie
- Antworte NUR mit JSON, kein anderer Text"""

    def _parse_response(
        self, response_text: str, catalog: list[dict]
    ) -> InterpretResponse:
        """Parse Claude's JSON response into InterpretResponse.

        Validates that all suggested part_ids actually exist in the catalog.
        Filters out hallucinated or invalid part IDs.
        """
        # Extract valid part IDs from catalog
        valid_ids = {item["id"] for item in catalog}

        try:
            # Try to extract JSON from response (Claude sometimes wraps in markdown)
            json_str = response_text.strip()
            if json_str.startswith("```"):
                # Remove markdown code blocks
                lines = json_str.split("\n")
                json_lines = []
                in_block = False
                for line in lines:
                    if line.strip().startswith("```"):
                        in_block = not in_block
                        continue
                    if in_block or not line.strip().startswith("```"):
                        json_lines.append(line)
                json_str = "\n".join(json_lines)

            data = json.loads(json_str)
        except json.JSONDecodeError:
            return InterpretResponse(
                suggestions=[],
                raw_interpretation=f"Failed to parse Claude response: {response_text[:200]}",
            )

        suggestions = []
        for item in data.get("suggestions", []):
            # Validate part_id exists in catalog
            if item.get("part_id") not in valid_ids:
                continue

            try:
                suggestion = PartSuggestion(
                    category=item["category"],
                    part_id=item["part_id"],
                    part_name=item["part_name"],
                    confidence=float(item.get("confidence", 0.5)),
                    reason=item.get("reason", ""),
                )
                suggestions.append(suggestion)
            except (KeyError, ValueError):
                continue

        interpretation = data.get("interpretation", response_text[:200])

        return InterpretResponse(
            suggestions=suggestions,
            raw_interpretation=interpretation,
        )
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd ki-service && python -m pytest tests/test_interpret.py -v
```

Expected: 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add ki-service/src/services/text_interpret.py ki-service/tests/test_interpret.py
git commit -m "feat(ki-service): Claude API text interpreter (text → part mapping)"
```

---

### Task 10: Processing queue with position tracking

**Files:**
- Modify: `ki-service/src/services/queue.py` (already created as stub in Task 5)
- Create: `ki-service/tests/test_queue.py`

- [ ] **Step 1: Write queue tests**

Write `ki-service/tests/test_queue.py`:
```python
import pytest
from src.services.queue import ProcessingQueue, QueueFullError


@pytest.fixture
def small_queue():
    """Queue with small limits for testing."""
    return ProcessingQueue(max_size=3, max_concurrent=1)


class TestQueueBasics:

    def test_enqueue_first_job_starts_immediately(self, small_queue):
        """First job should start processing (position 0)."""
        pos = small_queue.enqueue("user-1")
        assert pos == 0  # Processing now
        assert small_queue.active_count == 1
        assert small_queue.waiting_count == 0

    def test_enqueue_second_job_waits(self, small_queue):
        """Second job should wait (max_concurrent=1)."""
        small_queue.enqueue("user-1")
        pos = small_queue.enqueue("user-2")
        assert pos > 0  # Waiting
        assert small_queue.active_count == 1
        assert small_queue.waiting_count == 1

    def test_dequeue_promotes_waiting(self, small_queue):
        """Completing a job should promote next waiting job."""
        small_queue.enqueue("user-1")
        small_queue.enqueue("user-2")

        small_queue.dequeue("user-1")

        assert small_queue.active_count == 1
        assert small_queue.waiting_count == 0
        status = small_queue.get_status("user-2")
        assert status["status"] == "processing"

    def test_queue_full_raises(self, small_queue):
        """Exceeding max_size should raise QueueFullError."""
        small_queue.enqueue("user-1")
        small_queue.enqueue("user-2")
        small_queue.enqueue("user-3")

        with pytest.raises(QueueFullError) as exc_info:
            small_queue.enqueue("user-4")

        assert exc_info.value.position > 0
        assert exc_info.value.estimated_wait > 0


class TestQueueStatus:

    def test_active_user_status(self, small_queue):
        small_queue.enqueue("user-1")
        status = small_queue.get_status("user-1")
        assert status["status"] == "processing"
        assert status["position"] == 0

    def test_waiting_user_status(self, small_queue):
        small_queue.enqueue("user-1")
        small_queue.enqueue("user-2")
        status = small_queue.get_status("user-2")
        assert status["status"] == "waiting"
        assert status["position"] > 0
        assert "estimated_wait" in status

    def test_unknown_user_status(self, small_queue):
        status = small_queue.get_status("nobody")
        assert status["status"] == "not_in_queue"


class TestQueueDuplicate:

    def test_duplicate_enqueue_returns_position(self, small_queue):
        """Re-enqueuing same user should return current position."""
        small_queue.enqueue("user-1")
        pos = small_queue.enqueue("user-1")
        assert pos == 0
        assert small_queue.active_count == 1  # Not doubled


class TestQueueConcurrency:

    def test_multiple_concurrent(self):
        """Queue with max_concurrent=3 should allow 3 active jobs."""
        queue = ProcessingQueue(max_size=5, max_concurrent=3)
        pos1 = queue.enqueue("user-1")
        pos2 = queue.enqueue("user-2")
        pos3 = queue.enqueue("user-3")

        assert pos1 == 0
        assert pos2 == 0
        assert pos3 == 0
        assert queue.active_count == 3
        assert queue.waiting_count == 0

        # 4th should wait
        pos4 = queue.enqueue("user-4")
        assert pos4 > 0
```

- [ ] **Step 2: Run tests — verify they pass**

The queue was already implemented in Task 5. These tests validate it thoroughly.

```bash
cd ki-service && python -m pytest tests/test_queue.py -v
```

Expected: 9 tests PASS

- [ ] **Step 3: Fix any failing tests, then commit**

```bash
git add ki-service/tests/test_queue.py
git commit -m "test(ki-service): comprehensive queue tests (capacity, promotion, concurrency)"
```

---

### Task 11: Full /generate endpoint + /interpret endpoint integration

**Files:**
- Modify: `ki-service/src/routers/generate.py`
- Create: `ki-service/src/routers/interpret.py`
- Modify: `ki-service/src/main.py`
- Create: `ki-service/tests/conftest.py`
- Modify: `ki-service/tests/test_api.py`

- [ ] **Step 1: Write conftest.py with shared fixtures**

Write `ki-service/tests/conftest.py`:
```python
import pytest
from httpx import AsyncClient, ASGITransport
from src.main import app


@pytest.fixture
def client():
    """Shared async test client for all API tests."""
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")
```

- [ ] **Step 2: Update generate router with full pipeline**

Replace `ki-service/src/routers/generate.py`:
```python
import os
import uuid
import time
import shutil
from fastapi import APIRouter, File, UploadFile, Form
from fastapi.responses import JSONResponse

from src.types import ErrorResponse, GenerateResponse
from src.services.face_detection import FaceDetector, FaceDetectionError
from src.services.deca_inference import DECAService
from src.services.blendshape import BlendshapeMapper
from src.services.texture import TextureService
from src.services.queue import ProcessingQueue, QueueFullError
from src.config import settings

router = APIRouter()

# Singleton service instances
_face_detector = FaceDetector()
_deca_service = DECAService()
_blendshape_mapper = BlendshapeMapper()
_texture_service = TextureService()
_queue = ProcessingQueue(
    max_size=settings.max_queue_size,
    max_concurrent=settings.max_concurrent_jobs,
)


@router.post("/generate")
async def generate_face(
    photo: UploadFile = File(...),
    user_id: str = Form(...),
):
    """Photo → 3D face reconstruction pipeline.

    Full pipeline (30-45 seconds total):
    1. Queue check — 429 if full
    2. Face detection + validation (~2s) — 422 on error
    3. DECA inference → FLAME parameters (~5s)
    4. FLAME → blendshape weights (~1s)
    5. Texture projection → UV map (~5s)
    6. Real-ESRGAN upscale → 4K (~20s)
    7. Cleanup: delete photo, return result

    Privacy: uploaded photos are deleted after processing.
    Only the resulting blendshape weights and texture are kept.
    """
    start_time = time.time()

    # --- Queue check ---
    try:
        queue_position = _queue.enqueue(user_id)
    except QueueFullError as e:
        return JSONResponse(
            status_code=429,
            content={
                "error": "ai_queue_full",
                "position": e.position,
                "estimated_wait": e.estimated_wait,
            },
        )

    # Create temp directory for this job
    job_id = str(uuid.uuid4())
    temp_dir = os.path.join(settings.temp_dir, job_id)
    os.makedirs(temp_dir, exist_ok=True)

    try:
        # Read uploaded photo
        image_bytes = await photo.read()

        # --- Stage 1: Face detection + validation (~2s) ---
        try:
            face_result = _face_detector.detect(image_bytes)
        except FaceDetectionError as e:
            error_data: dict = {"error": e.error_code, "hint": e.hint}
            if e.min_size:
                error_data["min"] = e.min_size
            return JSONResponse(status_code=422, content=error_data)

        # --- Stage 2: DECA inference → FLAME parameters (~5s) ---
        try:
            flame_params = _deca_service.infer(image_bytes, face_result)
        except FileNotFoundError:
            # DECA model not downloaded yet — use landmark-based approximation
            flame_params = _deca_service.placeholder_inference(face_result)
        except Exception as e:
            return JSONResponse(
                status_code=503,
                content={"error": "ai_service_unavailable", "retry_after": 30},
            )

        # --- Stage 3: FLAME → blendshape weights (~1s) ---
        blendshape_result = _blendshape_mapper.map(flame_params)

        # --- Stage 4+5: Texture projection + upscale (~25s) ---
        texture_output_path = os.path.join(temp_dir, "texture_4k.png")
        try:
            texture_result = _texture_service.project_and_upscale(
                image_bytes, face_result, texture_output_path
            )
        except Exception as e:
            return JSONResponse(
                status_code=503,
                content={"error": "ai_service_unavailable", "retry_after": 30},
            )

        # --- Build response ---
        processing_time = time.time() - start_time

        response = GenerateResponse(
            blendshape_weights=blendshape_result.weights,
            texture_url=texture_result.texture_url,
            texture_resolution=texture_result.resolution,
            processing_time_seconds=round(processing_time, 2),
        )

        return JSONResponse(status_code=200, content=response.model_dump())

    except Exception as e:
        return JSONResponse(
            status_code=503,
            content={"error": "ai_service_unavailable", "retry_after": 30},
        )

    finally:
        # Privacy: delete uploaded photo and temp files
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)

        # Remove from queue
        _queue.dequeue(user_id)
```

- [ ] **Step 3: Write interpret router**

Write `ki-service/src/routers/interpret.py`:
```python
from fastapi import APIRouter
from fastapi.responses import JSONResponse

from src.types import InterpretRequest, InterpretResponse
from src.services.text_interpret import TextInterpreter

router = APIRouter()

_interpreter = TextInterpreter()


@router.post("/interpret")
async def interpret_text(request: InterpretRequest):
    """Text description → part suggestions from catalog.

    The Avatar API sends the user's text description along with
    the current parts catalog. Claude API interprets the text
    and maps it to specific part IDs.

    Error codes:
    - 422: missing or invalid text
    - 503: Claude API unavailable or not configured
    """
    try:
        result = await _interpreter.interpret(request)
        return JSONResponse(
            status_code=200,
            content=result.model_dump(),
        )
    except RuntimeError as e:
        # ANTHROPIC_API_KEY not configured
        return JSONResponse(
            status_code=503,
            content={
                "error": "ai_service_unavailable",
                "retry_after": 30,
                "hint": str(e),
            },
        )
    except Exception as e:
        return JSONResponse(
            status_code=503,
            content={"error": "ai_service_unavailable", "retry_after": 30},
        )
```

- [ ] **Step 4: Register interpret router in main.py**

Update `ki-service/src/main.py` to its final form:

```python
import torch
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.config import settings
from src.routers.generate import router as generate_router
from src.routers.interpret import router as interpret_router

app = FastAPI(
    title="KI-Service — Avatar Studio",
    description="Photo→3D face reconstruction + Text→part mapping",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    gpu_available = torch.cuda.is_available()
    gpu_name = torch.cuda.get_device_name(0) if gpu_available else None
    return {
        "status": "ok",
        "gpu_available": gpu_available,
        "gpu_name": gpu_name,
    }


app.include_router(generate_router)
app.include_router(interpret_router)
```

- [ ] **Step 5: Write full integration tests**

Update `ki-service/tests/test_api.py` to its final form:

```python
import io
import pytest
from PIL import Image
from httpx import AsyncClient, ASGITransport
from src.main import app


@pytest.fixture
def client():
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


def _make_blank_image(width: int, height: int) -> bytes:
    img = Image.new("RGB", (width, height), (200, 180, 160))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


# === Health ===

@pytest.mark.asyncio
async def test_health(client):
    resp = await client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert "gpu_available" in data


# === Generate: validation errors ===

@pytest.mark.asyncio
async def test_generate_no_photo(client):
    """POST /generate without photo returns 422."""
    resp = await client.post("/generate", data={"user_id": "test-user"})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_generate_image_too_small(client):
    """POST /generate with small image returns 422 image_too_small."""
    small_img = _make_blank_image(256, 256)
    resp = await client.post(
        "/generate",
        files={"photo": ("small.jpg", small_img, "image/jpeg")},
        data={"user_id": "test-user"},
    )
    assert resp.status_code == 422
    assert resp.json()["error"] == "image_too_small"
    assert resp.json()["min"] == "512x512"


@pytest.mark.asyncio
async def test_generate_no_face(client):
    """POST /generate with blank image returns 422 no_face_detected."""
    blank_img = _make_blank_image(512, 512)
    resp = await client.post(
        "/generate",
        files={"photo": ("blank.jpg", blank_img, "image/jpeg")},
        data={"user_id": "test-user"},
    )
    assert resp.status_code == 422
    assert resp.json()["error"] == "no_face_detected"


# === Interpret: validation ===

@pytest.mark.asyncio
async def test_interpret_missing_text(client):
    """POST /interpret with empty text returns 422."""
    resp = await client.post(
        "/interpret",
        json={"text": "", "catalog": []},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_interpret_no_api_key(client):
    """POST /interpret without ANTHROPIC_API_KEY returns 503."""
    resp = await client.post(
        "/interpret",
        json={
            "text": "Mann mit Fedora",
            "catalog": [
                {"id": "uuid-1", "category": "hat", "name": "Fedora"},
            ],
        },
    )
    # Without API key configured, should return 503
    assert resp.status_code == 503
    assert resp.json()["error"] == "ai_service_unavailable"
```

- [ ] **Step 6: Run all tests**

```bash
cd ki-service && python -m pytest tests/ -v
```

Expected: All tests PASS across all test files:
- `test_api.py` — 5 tests (health, generate validation, interpret validation)
- `test_face_detection.py` — 5 tests (image size, no face)
- `test_deca.py` — 3 tests (FLAME param shape, floats, clamping)
- `test_blendshape.py` — 6 tests (neutral, shaped, normalized, names, expression, deterministic)
- `test_texture.py` — 4 tests (UV map, square, upscale, save)
- `test_interpret.py` — 6 tests (prompt, parsing, filtering, integration)
- `test_queue.py` — 9 tests (basics, status, duplicates, concurrency)
- `test_types.py` — 6 tests (serialization, validation)

Total: ~44 tests

- [ ] **Step 7: Final commit**

```bash
git add ki-service/
git commit -m "feat(ki-service): complete KI-Service with generate + interpret endpoints"
```

---

## Summary

After completing this plan, the KI-Service provides:

- POST `/generate` — Photo upload → face detection → DECA → FLAME parameters → blendshape weights + 4K texture
- POST `/interpret` — Text description + parts catalog → Claude API → part suggestions
- GET `/health` — Service health check with GPU status
- Processing queue with position tracking and 429 responses
- Privacy: photos deleted after processing
- Error responses matching spec: 422 (face errors), 429 (queue full), 503 (service unavailable)
- ~44 pytest tests covering all services and endpoints
- Docker support with NVIDIA CUDA base image

**Integration with Avatar API:** The Avatar API (Plan 1) has stub endpoints for `/api/avatar/generate` and `/api/avatar/interpret` that return 503. These stubs should be updated to proxy requests to `http://ki-service:5000/generate` and `http://ki-service:5000/interpret` respectively. The Avatar API passes the parts catalog to the KI-Service's `/interpret` endpoint on each request.

**Next steps before production:**
1. Download FLAME and DECA model weights (academic registration required)
2. Replace placeholder DECA inference with actual model loading
3. Calibrate blendshape mapping matrix per basis mesh in Blender
4. Implement proper UV correspondence mapping for texture projection
5. Add the KI-Service to the project's `docker-compose.yml` with GPU passthrough
