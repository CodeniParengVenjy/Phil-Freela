"""PhilFreela AI service.

Run it from this folder:
    py -m pip install -r requirements.txt
    py -m uvicorn main:app --port 8000
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="PhilFreela AI Service")

# The React dev server runs on localhost:5173, so the browser needs permission
# (CORS) to call this service from that address.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


@app.get("/health")
def health():
    """Quick check that the service is running."""
    return {"status": "ok"}
