FROM node:20-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend ./
ARG VITE_POSTHOG_API_KEY
ENV VITE_POSTHOG_API_KEY=${VITE_POSTHOG_API_KEY}
RUN npm run build

FROM python:3.13-slim-bookworm

# Install system dependencies used by OCR, rendering and runtime tools,
# plus Arabic-capable fonts for DOCX/PDF rendering (RTL/complex script support)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    fontconfig \
    libcairo2 \
    libpango-1.0-0 \
    libgdk-pixbuf-2.0-0 \
    libffi8 \
    shared-mime-info \
    && fc-cache -f \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy backend requirements and install Python dependencies
COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY backend ./backend

# Copy built frontend assets from the frontend-build stage.
# app/main.py resolves this via __file__ as ../../frontend/dist from app/main.py,
# i.e. BASE_DIR (backend/app) -> backend -> /app/frontend/dist. Must land here exactly.
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

# Pre-download OCR/layout models at build-time to avoid first-request latency
# WORKDIR /app/backend
# RUN python -c "from app.services.extract_text import _get_yolo_model, _get_ocr_model; _get_yolo_model('cpu'); _get_ocr_model('cpu'); print('Model warmup complete')"

# Run the app from inside backend/, where app.main actually lives
WORKDIR /app/backend

EXPOSE 8000

# Start the backend that serves both API and frontend dist
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
