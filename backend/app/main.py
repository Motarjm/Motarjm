from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, FileResponse
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
@app.get("/{full_path:path}", response_class=HTMLResponse)
async def serve_react_app(full_path: str):
    # Check if the requested path maps to a real file in the dist folder
    requested_file = os.path.join(REACT_BUILD_DIR, full_path)
    if os.path.isfile(requested_file):
        return FileResponse(requested_file)

    # Otherwise serve index.html and let React Router handle it
    index_path = os.path.join(REACT_BUILD_DIR, "index.html")
    with open(index_path, "r") as f:
        return HTMLResponse(content=f.read())