import json
import os
from fastapi import FastAPI, WebSocket, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional

from intelligence import (
    get_receptivity_score,
    analyze_call,
    detect_pivot,
)
from database import get_customer_profile
from fastapi.responses import StreamingResponse
from trial import router as trial_router

app = FastAPI(title="ShiftCall API")
app.include_router(trial_router)

# CORS_ORIGINS env var: comma-separated list of allowed frontend origins.
# In dev we leave it open; in production, set it to your Vercel URL(s).
# e.g. CORS_ORIGINS="https://shiftcall.vercel.app,https://shiftcall-git-main.vercel.app"
_origins_env = os.getenv("CORS_ORIGINS", "*").strip()
_allow_origins = [o.strip() for o in _origins_env.split(",")] if _origins_env != "*" else ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*", "X-XAI-Key"],
)


# ── Request models ────────────────────────────────────────────────────
class ContactRequest(BaseModel):
    customer_ids: List[str]


class CallAnalysisRequest(BaseModel):
    transcript: List[dict]


class PivotRequest(BaseModel):
    transcript: List[dict]
    customer_id: Optional[str] = None


class SentimentRequest(BaseModel):
    text: str
    history: List[dict]
    customer_id: Optional[str] = None


# ── Routes ────────────────────────────────────────────────────────────
@app.get("/")
async def root():
    return {"status": "ok", "message": "ShiftCall AI Intelligence Layer is active"}


@app.post("/score-contacts")
async def score_contacts(
    request: ContactRequest,
    x_xai_key: Optional[str] = Header(default=None, alias="X-XAI-Key"),
):
    scored_contacts = []
    for cid in request.customer_ids:
        profile = get_customer_profile(cid)
        if profile:
            score_data = get_receptivity_score(profile, api_key=x_xai_key)
            scored_contacts.append({
                "id": cid,
                "name": profile["name"],
                "industry": profile["industry"],
                "score": score_data["score"],
                "angle": score_data["angle"],
                "best_time": score_data["best_time"],
            })

    scored_contacts.sort(key=lambda x: x["score"], reverse=True)
    return scored_contacts


@app.post("/detect-pivot")
async def detect_pivot_endpoint(
    request: PivotRequest,
    x_xai_key: Optional[str] = Header(default=None, alias="X-XAI-Key"),
):
    profile = get_customer_profile(request.customer_id) if request.customer_id else None
    return detect_pivot(request.transcript, profile, api_key=x_xai_key)


@app.post("/sentiment-stream")
async def sentiment_stream_endpoint(
    request: SentimentRequest,
    x_xai_key: Optional[str] = Header(default=None, alias="X-XAI-Key"),
):
    """Stream sentiment+tone JSON tokens from xAI Grok as they arrive.
    Per-request header takes precedence; falls back to server XAI_API_KEY."""
    profile = get_customer_profile(request.customer_id) if request.customer_id else None
    api_key = x_xai_key or os.getenv("XAI_API_KEY")

    async def generate():
        profile_blob = (
            json.dumps(profile)
            if profile
            else "Unknown caller. Infer tone from the words alone. Do not assume a specific name, plan, or issue."
        )
        prompt = (
            f"Customer profile: {profile_blob}\n"
            f"Full conversation so far: {json.dumps(request.history)}\n"
            f"The customer just said: '{request.text}'\n"
            'Return JSON only, no other text: {"sentiment": <number from -1.0 to 1.0>, '
            '"tone": <one of: Frustrated|Tense|Neutral|Explaining|Relieved|Warm|Grateful>}'
        )

        from openai import AsyncOpenAI
        async_client = AsyncOpenAI(api_key=api_key, base_url="https://api.x.ai/v1")

        stream = await async_client.chat.completions.create(
            model=os.getenv("XAI_MODEL", "grok-2-latest"),
            messages=[
                {"role": "system", "content": "You are a real-time sentiment analyzer for a telecom support call. Return only a JSON object, nothing else."},
                {"role": "user", "content": prompt},
            ],
            max_tokens=1024,
            stream=True,
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta.content if chunk.choices else None
            if delta:
                yield delta

    return StreamingResponse(generate(), media_type="text/plain")


@app.websocket("/call-stream")
async def call_stream(websocket: WebSocket):
    await websocket.accept()
    await websocket.send_json({"status": "deprecated", "message": "Use Deepgram SDK on frontend directly"})
    await websocket.close()


@app.post("/analyze-call")
async def analyze_call_endpoint(
    request: CallAnalysisRequest,
    x_xai_key: Optional[str] = Header(default=None, alias="X-XAI-Key"),
):
    return analyze_call(request.transcript, api_key=x_xai_key)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
