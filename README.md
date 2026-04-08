# Motarjm
A website for translating documents into Arabic language.


How to Run the Project (Step by Step)
1. Clone the repository

```
git clone https://github.com/<your-username>/Torgman.git
cd Torgman/Motarjm/backend
```

2. Create and activate a virtual environment (Windows):
```
python -m venv venv
.\venv\Scripts\activate
```

If PowerShell blocks activation, run this first:
```
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\venv\Scripts\activate
```

3. Install dependencies
```   
pip install -r requirements.txt
```

4. Run the FastAPI server

```
cd backend
python -m uvicorn app.main:app --reload
```


You should see:

```
INFO:     Uvicorn running on http://127.0.0.1:8000
```

5. Open the website
Visit in your browser:
http://localhost:8000


You’ll see the Torgman interface, Upload a .txt file, Click Translate ,Download your translated text file.

6. (Optional) Test API directly
You can also open the automatic FastAPI docs at:
http://localhost:8000/docs


## Run With Docker (Multi-Stage)

This project includes a multi-stage `Dockerfile` that:
- Builds the React frontend in a Node stage.
- Builds one final Python container that serves both API and frontend.
- Pre-downloads OCR/layout models during image build to reduce first-request latency.

### 1. Build the image

Set frontend build-time variables in `frontend/.env` (for example `VITE_POSTHOG_API_KEY`).

```bash
docker build -t motarjm:latest .
```

### 2. Run the container

```bash
docker run --rm -p 8000:8000 --env-file .env motarjm:latest
```

### 3. Verify

- API health: `http://localhost:8000/api`
- App UI: `http://localhost:8000/`
- Compare view: `http://localhost:8000/compare`

### Runtime environment variables

Set these in `.env` (or pass with `-e`):
- `HUGGINGFACE_API_KEY`
- `OPENAI_API_KEY`
- `GEMINI_API_KEY`
- `LANGSMITH_API_KEY`
- `LANGSMITH_TRACING`
