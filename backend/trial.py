"""
ShiftCall — Free trial keys + counter.

A signed-up user gets N free calls (default 3) using the platform's shared
keys before they need to bring their own. The counter lives in Supabase
on the `profiles` table (added by migration 002_trial.sql).

This module exposes two FastAPI endpoints (registered in main.py):

    POST /trial/keys   - hand out trial keys for the next call
    POST /trial/use    - mark one trial call as consumed

Both endpoints require an `Authorization: Bearer <supabase_access_token>`
header. We validate the token by calling Supabase's /auth/v1/user, then
read/write the profile via the service-role key (which bypasses RLS).

Server-side env vars required:

    SUPABASE_URL                e.g. https://xxxxx.supabase.co
    SUPABASE_SERVICE_ROLE_KEY   from Supabase dashboard, settings → API
    SUPABASE_ANON_KEY           same as the frontend's anon key
    VAPI_TRIAL_PUBLIC_KEY       browser-safe Vapi public key
    DEEPGRAM_TRIAL_KEY          master Deepgram key (used to mint scoped tokens)
"""

import os
import time
from typing import Optional, Dict, Any

import httpx
from fastapi import APIRouter, Header, HTTPException


router = APIRouter(prefix="/trial", tags=["trial"])


# ── Config ──────────────────────────────────────────────────────────────
SUPABASE_URL              = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_ANON_KEY         = os.getenv("SUPABASE_ANON_KEY", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
VAPI_TRIAL_PUBLIC_KEY     = os.getenv("VAPI_TRIAL_PUBLIC_KEY", "")
DEEPGRAM_TRIAL_KEY        = os.getenv("DEEPGRAM_TRIAL_KEY", "")
DEEPGRAM_TOKEN_TTL_SEC    = int(os.getenv("DEEPGRAM_TOKEN_TTL_SEC", "3600"))


def _supabase_configured() -> bool:
    return bool(SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY and SUPABASE_ANON_KEY)


def _bearer(authorization: Optional[str]) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    return authorization.split(None, 1)[1].strip()


async def _verify_user(jwt: str) -> Dict[str, Any]:
    """Validate a Supabase access token by asking Supabase who it belongs to.
    Returns the user record on success, raises 401 on failure."""
    if not _supabase_configured():
        raise HTTPException(status_code=503, detail="Trial mode not configured on the server")

    async with httpx.AsyncClient(timeout=8.0) as client:
        r = await client.get(
            f"{SUPABASE_URL}/auth/v1/user",
            headers={
                "Authorization": f"Bearer {jwt}",
                "apikey": SUPABASE_ANON_KEY,
            },
        )
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    return r.json()


async def _get_profile(user_id: str) -> Dict[str, Any]:
    async with httpx.AsyncClient(timeout=8.0) as client:
        r = await client.get(
            f"{SUPABASE_URL}/rest/v1/profiles",
            params={
                "id": f"eq.{user_id}",
                "select": "id,trial_calls_used,trial_limit,is_trial_active,onboarded",
            },
            headers={
                "apikey": SUPABASE_SERVICE_ROLE_KEY,
                "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
            },
        )
    if r.status_code != 200:
        raise HTTPException(status_code=500, detail=f"Profile lookup failed ({r.status_code})")
    rows = r.json()
    if not rows:
        # First time we've seen this user from the trial path; create a profile row.
        await _ensure_profile(user_id)
        return {
            "id": user_id,
            "trial_calls_used": 0,
            "trial_limit": 3,
            "is_trial_active": True,
            "onboarded": False,
        }
    return rows[0]


async def _ensure_profile(user_id: str) -> None:
    async with httpx.AsyncClient(timeout=8.0) as client:
        await client.post(
            f"{SUPABASE_URL}/rest/v1/profiles",
            json={"id": user_id, "is_trial_active": True},
            headers={
                "apikey": SUPABASE_SERVICE_ROLE_KEY,
                "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
                "Content-Type": "application/json",
                "Prefer": "resolution=ignore-duplicates",
            },
        )


async def _bump_counter(user_id: str, current: int) -> int:
    new_value = current + 1
    async with httpx.AsyncClient(timeout=8.0) as client:
        r = await client.patch(
            f"{SUPABASE_URL}/rest/v1/profiles",
            params={"id": f"eq.{user_id}"},
            json={"trial_calls_used": new_value},
            headers={
                "apikey": SUPABASE_SERVICE_ROLE_KEY,
                "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
                "Content-Type": "application/json",
                "Prefer": "return=minimal",
            },
        )
    if r.status_code not in (200, 204):
        raise HTTPException(status_code=500, detail="Failed to update trial counter")
    return new_value


async def _mint_deepgram_token() -> str:
    """Create a short-lived, scoped Deepgram key for one trial session.
    Falls back to returning the master key only if minting fails AND we're
    in dev mode (DEEPGRAM_ALLOW_MASTER_FALLBACK=true), to avoid hard
    blocking local development. Never falls back in production."""
    if not DEEPGRAM_TRIAL_KEY:
        raise HTTPException(status_code=503, detail="Deepgram trial key not configured")

    async with httpx.AsyncClient(timeout=8.0) as client:
        # 1. Find our project ID
        proj = await client.get(
            "https://api.deepgram.com/v1/projects",
            headers={"Authorization": f"Token {DEEPGRAM_TRIAL_KEY}"},
        )
        if proj.status_code != 200:
            raise HTTPException(status_code=502, detail=f"Deepgram /projects failed ({proj.status_code})")
        projects = proj.json().get("projects", [])
        if not projects:
            raise HTTPException(status_code=502, detail="No Deepgram projects on master account")
        project_id = projects[0]["project_id"]

        # 2. Mint a temporary key scoped only to live transcription
        body = {
            "comment": f"shiftcall-trial-{int(time.time())}",
            "scopes": ["usage:write"],  # streaming/listen scope
            "time_to_live_in_seconds": DEEPGRAM_TOKEN_TTL_SEC,
        }
        mint = await client.post(
            f"https://api.deepgram.com/v1/projects/{project_id}/keys",
            json=body,
            headers={
                "Authorization": f"Token {DEEPGRAM_TRIAL_KEY}",
                "Content-Type": "application/json",
            },
        )
    if mint.status_code not in (200, 201):
        raise HTTPException(status_code=502, detail=f"Deepgram key mint failed ({mint.status_code}): {mint.text[:200]}")
    return mint.json().get("key", "")


# ── Routes ──────────────────────────────────────────────────────────────
@router.get("/status")
async def trial_status(authorization: Optional[str] = Header(default=None)):
    """Lightweight check the frontend can call to render counters."""
    jwt = _bearer(authorization)
    user = await _verify_user(jwt)
    profile = await _get_profile(user["id"])
    used = int(profile.get("trial_calls_used", 0))
    limit = int(profile.get("trial_limit", 3))
    return {
        "trial_active": bool(profile.get("is_trial_active", False)),
        "used": used,
        "limit": limit,
        "remaining": max(0, limit - used),
        "onboarded": bool(profile.get("onboarded", False)),
    }


@router.post("/keys")
async def trial_keys(authorization: Optional[str] = Header(default=None)):
    """Hand out trial keys for the next call. Refuses if trial is exhausted."""
    if not VAPI_TRIAL_PUBLIC_KEY:
        raise HTTPException(status_code=503, detail="Trial mode not configured (Vapi)")

    jwt = _bearer(authorization)
    user = await _verify_user(jwt)
    profile = await _get_profile(user["id"])

    used = int(profile.get("trial_calls_used", 0))
    limit = int(profile.get("trial_limit", 3))
    if used >= limit:
        raise HTTPException(
            status_code=403,
            detail={"code": "trial_exhausted", "used": used, "limit": limit},
        )

    deepgram_token = await _mint_deepgram_token()
    return {
        "vapi_public_key": VAPI_TRIAL_PUBLIC_KEY,
        "deepgram_token": deepgram_token,
        "deepgram_ttl_sec": DEEPGRAM_TOKEN_TTL_SEC,
        "remaining_before": limit - used,
    }


@router.post("/use")
async def trial_use(authorization: Optional[str] = Header(default=None)):
    """Mark one trial call as consumed. Idempotency is best-effort: the
    caller is expected to call this exactly once per completed call."""
    jwt = _bearer(authorization)
    user = await _verify_user(jwt)
    profile = await _get_profile(user["id"])

    used = int(profile.get("trial_calls_used", 0))
    limit = int(profile.get("trial_limit", 3))
    if used >= limit:
        return {"used": used, "limit": limit, "remaining": 0}

    new_used = await _bump_counter(user["id"], used)
    return {"used": new_used, "limit": limit, "remaining": max(0, limit - new_used)}


@router.post("/activate")
async def trial_activate(authorization: Optional[str] = Header(default=None)):
    """Mark the user as a trial user (sets is_trial_active=true and
    onboarded=true so they skip the key entry wizard). Called when the
    user clicks 'Try with N free calls' on Onboarding."""
    jwt = _bearer(authorization)
    user = await _verify_user(jwt)
    await _ensure_profile(user["id"])

    async with httpx.AsyncClient(timeout=8.0) as client:
        r = await client.patch(
            f"{SUPABASE_URL}/rest/v1/profiles",
            params={"id": f"eq.{user['id']}"},
            json={"is_trial_active": True, "onboarded": True},
            headers={
                "apikey": SUPABASE_SERVICE_ROLE_KEY,
                "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
                "Content-Type": "application/json",
                "Prefer": "return=minimal",
            },
        )
    if r.status_code not in (200, 204):
        raise HTTPException(status_code=500, detail="Failed to activate trial")
    return {"trial_active": True, "onboarded": True}
