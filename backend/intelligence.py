"""
ShiftCall AI intelligence layer (xAI Grok).

We use xAI's OpenAI-compatible API via the `openai` SDK. The frontend sends
each user's xAI key via the `X-XAI-Key` header; endpoints in main.py extract
that and pass it down here as `api_key`. We fall back to the server's
XAI_API_KEY env var when no header is supplied (handy for local dev and for
trial users who haven't entered their own key yet).
"""

import os
import json
import re
from typing import Optional

from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

# Server-side fallback key. Used when:
#   - The frontend doesn't send X-XAI-Key (local dev)
#   - The user is on a free trial and has no key of their own
DEFAULT_KEY = os.getenv("XAI_API_KEY")

XAI_BASE_URL = "https://api.x.ai/v1"
MODEL = os.getenv("XAI_MODEL", "grok-2-latest")


def _client(api_key: Optional[str] = None) -> OpenAI:
    """Build an xAI client (via OpenAI SDK) using the user-supplied key first,
    falling back to the server's default key."""
    key = api_key or DEFAULT_KEY
    if not key:
        raise RuntimeError(
            "No xAI API key supplied. Either set XAI_API_KEY on the server "
            "or pass an X-XAI-Key header from the client."
        )
    return OpenAI(api_key=key, base_url=XAI_BASE_URL)


def _extract_json(text: str) -> dict:
    """xAI sometimes wraps JSON in ```json fences or prose. Strip and parse."""
    text = text.strip()
    # Strip code fences
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    # Find the first {...} JSON object if there's surrounding prose
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if m:
        text = m.group(0)
    return json.loads(text)


def _chat(prompt: str, system: Optional[str] = None, api_key: Optional[str] = None,
          max_tokens: int = 1024) -> str:
    """One-shot non-streaming chat completion. Returns the assistant text."""
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    resp = _client(api_key).chat.completions.create(
        model=MODEL,
        messages=messages,
        max_tokens=max_tokens,
    )
    return resp.choices[0].message.content or ""


def get_receptivity_score(customer_profile: dict, api_key: Optional[str] = None):
    prompt = f"""
    You are an AI sales intelligence engine. Analyze the following customer profile and history:
    {json.dumps(customer_profile, indent=2)}

    Score their receptivity (0-100) for a new offer today.
    Recommend the best emotional angle to lead with (e.g. "lead with cost savings", "lead with peace of mind").
    Recommend the best time to call.

    Return ONLY a JSON object:
    {{
        "score": int,
        "angle": "string",
        "best_time": "string",
        "rationale": "string"
    }}
    """
    text = _chat(prompt, api_key=api_key)
    return _extract_json(text)


def get_sentiment_score(message_text: str, history: list, customer_profile: dict = None,
                        api_key: Optional[str] = None):
    profile_blob = (
        json.dumps(customer_profile)
        if customer_profile
        else "Unknown caller. Infer tone from the words alone. Do not assume a specific name, plan, or issue."
    )
    prompt = f"""
    Customer profile: {profile_blob}

    Full conversation so far: {json.dumps(history)}

    The customer just said: '{message_text}'

    Return JSON only, no other text: {{"sentiment": <number from -1.0 to 1.0>, "tone": <one of: Frustrated|Tense|Neutral|Explaining|Relieved|Warm|Grateful>}}
    """
    text = _chat(
        prompt,
        system="You are a real-time sentiment analyzer for a telecom support call. Return only a JSON object, nothing else.",
        api_key=api_key,
    )
    return _extract_json(text)


def detect_pivot(transcript: list, customer_profile: dict = None, api_key: Optional[str] = None):
    prompt = f"""
    Customer profile: {json.dumps(customer_profile) if customer_profile else "[PINECONE_PROFILE]"}
    Full transcript so far: {json.dumps(transcript)}

    Evaluate ALL THREE conditions:
    1. Has the customer's specific issue been confirmed as resolved in this conversation? (not just worked on, but confirmed fixed)
    2. Is the customer's current sentiment above +0.4 based on their last message?
    3. Has the customer expressed relief, gratitude, or positive emotion in their words?

    If ALL THREE are true, generate a pivot suggestion using the BrightFiber knowledge base.

    Return JSON only: {{
      "should_pivot": boolean,
      "confidence": number between 0 and 1,
      "condition_1_met": boolean,
      "condition_2_met": boolean,
      "condition_3_met": boolean,
      "reason": "string (one sentence explaining why now is the right moment)",
      "suggested_pivot_line": "string (what the agent should say: natural, warm, specific to THIS customer's exact issue from the transcript above, mentions Fiber Pro dedicated bandwidth, includes the $69 locked rate for loyal customers; address the customer by the name used in the transcript if any)",
      "upgrade_to": "Fiber Pro",
      "monthly_price": "$69/mo"
    }}
    """
    text = _chat(
        prompt,
        system="You are monitoring a live telecom support call to detect the optimal moment to suggest a service upgrade. Be precise. Do not trigger early.",
        api_key=api_key,
    )
    return _extract_json(text)


def analyze_call(transcript: list, api_key: Optional[str] = None):
    prompt = f"""
    Analyze the following complete autonomous AI call transcript:
    {json.dumps(transcript, indent=2)}

    The AI agent (Aria) starts in SUPPORT MODE and switches to SALES MODE when the customer's issue is resolved and sentiment is positive.

    DEFINITION OF CONVERSION (be permissive, optimize for recall):
    A "conversion" means the CUSTOMER expressed any of the following at any point:
      - Said yes / yeah / sure / okay / alright / fine to an upgrade or new plan
      - Said they want to take it / try it / sign up / go ahead / do it / are interested
      - Asked to be upgraded, switched, signed up, billed for it
      - Said "let's do it" / "count me in" / "I'm in" / "deal" / "works for me" / "sounds good" in the upgrade context
      - Showed clear intent to accept the upgrade, even if hedged ("yeah I'll try it for a month")
    NOT a conversion:
      - "Maybe later" / "I'll think about it" / "Not interested" / silence / topic change
      - The agent suggesting an upgrade without the customer agreeing

    If the customer's last upgrade-context response could reasonably be read as agreement, set converted=true. When in doubt and there is any explicit affirmation word from the customer in response to an upgrade pitch, set converted=true.

    Provide:
    1. A summary of the call focusing on the transition.
    2. The line index where the 'Mode Switch' occurred (or -1 if no switch).
    3. The primary reason for the switch (or why it didn't happen).
    4. Whether a conversion occurred (per the definition above).
    5. A full sentiment trajectory (numbers from -1.0 to 1.0 aligned with transcript lines).
    6. Duration split: how many exchanges were in Support vs. Sales.

    Return ONLY a JSON object:
    {{
        "summary": "string",
        "gratitude_line": int,
        "reason": "string",
        "converted": bool,
        "sentiment_trajectory": list of numbers,
        "support_duration_lines": int,
        "sales_duration_lines": int
    }}
    """
    text = _chat(prompt, api_key=api_key, max_tokens=2048)
    return _extract_json(text)
