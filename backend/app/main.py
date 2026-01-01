from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware

import os
from app.routers import translate

app = FastAPI()


# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"], # Your React App URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Keep your router
app.include_router(translate.router)

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
