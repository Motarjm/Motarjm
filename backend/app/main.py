from fastapi import FastAPI
from app.routers import translate

app = FastAPI()

app.include_router(translate.router)

app.get("/")
def root():
    return {"Welcome to the AI Translation"}