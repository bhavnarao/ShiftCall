import os
import json
import anthropic
from dotenv import load_dotenv
from typing import Optional

load_dotenv()

# ── Per-request key resolution ─────────────────────────────────────────
# The frontend now sends each user's Anthropic key via the X-Anthropic-Key
# header. Endpoints in main.py extract that and pass it down as `api_key`
# to the functions in this module. We fall back to the server-side env
# var (ANTHROPIC_API_KEY) if no header is supplied (handy for local dev).
DEFAULT_KEY = os.getenv("ANTHROPIC_API_KEY")

MODEL = "claude-3-5-sonnet-20240620"


def _client(api_key: Optional[str] = None) -> anthropic.Anthropic:
    """Build an Anthropic client using the user-supplied key (preferred)
    or the server's default key as a fallback."""
    key = api_key or DEFAULT_KEY
    if not key:
        raise RuntimeError(
            "No Anthropic API key supplied. Either set ANTHROPIC_API_KEY on "
            "the server or pass an X-Anthropic-Key header from the client."
        )
    return anthropic.Anthropic(api_key=key)


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

    message = _client(api_key).messages.create(
        model=MODEL,
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )
    return json.loads(message.content[0].text)


def get_sentiment_score(message_text: str, history: list, customer_profile: dict = None, api_key: Optional[str] = None):
    profile_blob = (
        json.dumps(customer_profile)
        if customer_profile
        else "Unknown caller. Infer tone from the words alone. Do not assume a specific name, plan, or issue."
    )
    prompt = f"""
    Customer profile: {profile_blob}

    Full conversation so far: {json.dumps(history)}

    The customer just said: '{message_text}'

    Return JSON only, no other text: {{sentiment: <number from -1.0 to 1.0>, tone: <one of: Frustrated|Tense|Neutral|Explaining|Relieved|Warm|Grateful>}}
    """

    message = _client(api_key).messages.create(
        model=MODEL,
        max_tokens=1024,
        system="You are a real-time sentiment analyzer for a telecom support call. Return only a JSON object, nothing else.",
        messages=[{"role": "user", "content": prompt}],
    )
    return json.loads(message.content[0].text)


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

    message = _client(api_key).messages.create(
        model=MODEL,
        max_tokens=1024,
        system="You are monitoring a live telecom support call to detect the optimal moment to suggest a service upgrade. Be precise. Do not trigger early.",
        messages=[{"role": "user", "content": prompt}],
    )
    return json.loads(message.content[0].text)


def analyze_call(transcript: list, api_key: Optional[str] = None):
    prompt = f"""
    Analyze the following complete autonomous AI call transcript:
    {json.dumps(transcript, indent=2)}

    The AI agent (Aria) starts in SUPPORT MODE and switches to SALES MODE when the customer's issue is resolved and sentiment is positive.

    Provide:
    1. A summary of the call focusing on the transition.
    2. The line index where the 'Mode Switch' occurred.
    3. The primary reason for the switch.
    4. Whether a conversion (agreement to upgrade or interest shown) occurred.
    5. A full sentiment trajectory (list of mock numbers aligned with transcript lines if not provided).
    6. Duration split: calculate approximately how many exchanges were in Support vs. Sales.

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

    message = _client(api_key).messages.create(
        model=MODEL,
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )
    return json.loads(message.content[0].text)
