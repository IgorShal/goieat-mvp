from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base
from routers import auth, customer, partner, websocket, uploads

# Create tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Business MVP API", version="1.0.0")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router)
app.include_router(customer.router)
app.include_router(partner.router)
app.include_router(websocket.router)
app.include_router(uploads.router)

@app.get("/")
def root():
    return {"message": "Business MVP API"}

@app.get("/api/health")
def health_check():
    return {"status": "ok"}

