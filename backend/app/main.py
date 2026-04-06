from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware

import os
from app.routers import translation, generation, segment

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(translation.router)
app.include_router(generation.router)
app.include_router(segment.router)

# get absolute path to backend/app folder
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Path to React build (dist) directory
REACT_BUILD_DIR = os.path.join(BASE_DIR, '..', '..', 'frontend', 'dist')

# Path to the assets subfolder inside the React build
REACT_ASSETS_DIR = os.path.join(REACT_BUILD_DIR, 'assets')


@app.get("/api", tags=["Root"])
def root():
    return {"Welcome to the AI Translation"}


# Mount only the assets folder at /assets, not the entire dist at /
# app.mount("/assets", StaticFiles(directory=REACT_ASSETS_DIR), name="react-assets")
app.mount("/dist", StaticFiles(directory=REACT_BUILD_DIR), name="react-static")


# Catch-all route: serves real static files if they exist, otherwise returns index.html
# This prevents JS/CSS files outside /assets from being served with text/html MIME type
# i need to whitelist only my 4 endpoints and blacklist all other
# Whitelist static assets (JS, CSS, images, fonts, etc.)
# app.mount("/assets", StaticFiles(directory=REACT_ASSETS_DIR), name="react-assets")


# Known React SPA routes that should fallback to index.html
# Add your SPA routes here
REACT_ROUTES = {
    "/",
    "/compare"
}


@app.get("/{full_path:path}")
async def serve_react_app(full_path: str):
    """
    Serves index.html only for known React SPA routes.
    Serves static files from dist/ if they exist.
    Returns 404 for unknown paths (security: no catch-all for scanners).
    """
    # Check if this is a known React route
    normalized_path = f"/{full_path}" if full_path else "/"
    
    # If it matches a known route or is a root request, serve SPA
    if normalized_path == "/" or f"/{full_path.split('/')[0]}" in REACT_ROUTES or normalized_path in REACT_ROUTES:
        index_path = os.path.join(REACT_BUILD_DIR, "index.html")
        if os.path.exists(index_path):
            with open(index_path, "r") as f:
                return HTMLResponse(content=f.read())
    
    # Try to serve as a static file
    requested_file = os.path.join(REACT_BUILD_DIR, full_path)
    if os.path.isfile(requested_file):
        return FileResponse(requested_file)
    
    # Not found: return 404 (no catch-all)
    return JSONResponse(status_code=404, content={"detail": "Not found"})