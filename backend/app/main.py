from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pathlib import Path
from backend.app.routers import translate

app = FastAPI()

# Keep your router
app.include_router(translate.router)

# Absolute path to your backend/app folder
BASE_DIR = Path("D:/Torgman/Motarjm/backend/app").resolve()

# Serve static files
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")

# Load HTML templates
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))

# Serve the main frontend page
@app.get("/", response_class=HTMLResponse)
async def serve_home(request: Request):
    return templates.TemplateResponse("Torgman.html", {"request": request})

# Keep your original root endpoint
@app.get("/api", tags=["Root"])
def root():
    return {"Welcome to the AI Translation"}
