from fastapi import FastAPI
import os 
app = FastAPI()
API_TOKEN = os.getenv("API_TOKEN")
ENV = os.getenv("ENV", "testing") #default to testing 

@app.get("/")
def root():
    return {"status": "EMS Backend Is Running"}

