# Motarjm
A website for translating documents into Arabic language.


How to Run the Project (Step by Step)
1. Clone the repository
git clone https://github.com/<your-username>/Torgman.git
cd Torgman/Motarjm/backend

2. Create and activate a virtual environment (Windows):
python -m venv venv
.\venv\Scripts\activate

If PowerShell blocks activation, run this first:
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\venv\Scripts\activate

3. Install dependencies
pip install -r requirements.txt

If you don’t have requirements.txt yet, you can install manually:
pip install fastapi uvicorn jinja2 requests python-multipart


Then generate it for others:

pip freeze > requirements.txt

4. Run the FastAPI server
From inside backend/:
python -m uvicorn app.main:app --reload


You should see:
INFO:     Uvicorn running on http://127.0.0.1:8000

5. Open the website
Visit in your browser:
http://localhost:8000


You’ll see the Torgman interface, Upload a .txt file, Click Translate ,Download your translated text file.

6. (Optional) Test API directly
You can also open the automatic FastAPI docs at:
http://localhost:8000/docs