from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import os
from app.routers import translate

app = FastAPI()

# Keep your router
app.include_router(translate.router)

# get absolute path to backend/app folder
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# go two directories up to root
STATIC_DIR = os.path.join(BASE_DIR, "..", "..", "frontend", "static")
TEMPLATES_DIR = os.path.join(BASE_DIR, "..", "..", "frontend" ,"templates")

# Serve static files
app.mount("/static", StaticFiles(directory= STATIC_DIR), name="static")

# Load HTML templates
templates = Jinja2Templates(directory=TEMPLATES_DIR)

# Serve the main frontend page
@app.get("/", response_class=HTMLResponse)
async def serve_home(request: Request):
    return templates.TemplateResponse("Torgman.html", {"request": request})

@app.get("/editing", response_class=HTMLResponse)
async def editing(request: Request):
    return templates.TemplateResponse("editing_interface.html", {"request": request})

@app.get("/compare", response_class=HTMLResponse)
async def compare(request: Request):
    return templates.TemplateResponse("compare_interface.html", {"request": request})

# Keep your original root endpoint
@app.get("/api", tags=["Root"])
def root():
    return {"Welcome to the AI Translation"}
