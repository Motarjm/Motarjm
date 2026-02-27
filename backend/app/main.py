from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware

import os
from app.routers import translation, pdf, segment

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(translation.router)
app.include_router(pdf.router)
app.include_router(segment.router)

# get absolute path to backend/app folder
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Path to React build (dist) directory
REACT_BUILD_DIR = os.path.join(BASE_DIR, '..', '..', 'frontend', 'dist')

# Mount the React build directory to serve static files
app.mount("/", StaticFiles(directory=REACT_BUILD_DIR, html=True), name="react-app")

# Keep your original root endpoint
@app.get("/api", tags=["Root"])
def root():
    return {"Welcome to the AI Translation"}
