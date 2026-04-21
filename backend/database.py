import os
from dotenv import load_dotenv

load_dotenv()

# Pinecone + Mistral are optional. They power vector-search over real
# customer profiles. Without them we fall back to the local MOCK_DATA
# below; the rest of the app keeps working.
pc = None
index = None
client = None

if os.getenv("PINECONE_API_KEY"):
    try:
        from pinecone import Pinecone
        pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))
        index = pc.Index(os.getenv("PINECONE_INDEX", "shiftcall-telecom"))
    except Exception as e:
        print(f"[database] Pinecone unavailable: {e}. Using mock data only.")

if os.getenv("MISTRAL_API_KEY"):
    try:
        from mistralai import Mistral
        client = Mistral(api_key=os.getenv("MISTRAL_API_KEY"))
    except Exception as e:
        print(f"[database] Mistral SDK unavailable ({e}). Search will return mock data.")

MOCK_DATA = [
    {
        "id": "maria-chen",
        "name": "Maria Chen",
        "industry": "insurance",
        "history": "Maria has been a loyal customer for 3 years. Recently she complained about a duplicate billing charge for her auto-insurance policy. She typically responds well to cost-saving narratives and efficiency.",
        "engagement": "Opened last 3 marketing emails.",
        "last_interaction": "2026-03-15",
        "previous_issues": "Duplicate billing charge, policy renewal delay."
    },
    {
        "id": "james-okafor",
        "name": "James Okafor",
        "industry": "healthcare",
        "history": "James runs a small clinic. He is very focused on reliability and compliance. He has had a few minor issues with account login stability in the past.",
        "engagement": "Ignored last email, but responded to SMS alert.",
        "last_interaction": "2026-04-01",
        "previous_issues": "Login stability, MFA setup."
    },
    {
        "id": "priya-nair",
        "name": "Priya Nair",
        "industry": "e-commerce",
        "history": "Priya is a high-volume merchant. She cares deeply about social proof and what other merchants are using. She often asks for case studies.",
        "engagement": "High engagement on help articles.",
        "last_interaction": "2026-03-20",
        "previous_issues": "Payment gateway latency."
    },
    {
        "id": "tom-brecker",
        "name": "Tom Brecker",
        "industry": "fintech",
        "history": "Tom is very technical and skeptical. He has had negative experiences with AI support in the past. He prefers human interactions and direct answers.",
        "engagement": "Low engagement.",
        "last_interaction": "2025-12-10",
        "previous_issues": "API integration failures."
    }
]

def get_customer_profile(customer_id: str):
    if index is not None:
        try:
            fetch_res = index.fetch(ids=[customer_id])
            if customer_id in fetch_res["vectors"]:
                return fetch_res["vectors"][customer_id]["metadata"]
        except Exception as e:
            print(f"Database error: {e}. Falling back to mock data.")

    for customer in MOCK_DATA:
        if customer["id"] == customer_id:
            return customer
    return None


def search_customers(query: str, top_k: int = 5):
    if client is not None and index is not None:
        try:
            response = client.embeddings.create(model="mistral-embed", inputs=[query])
            embedding = response.data[0].embedding
            results = index.query(vector=embedding, top_k=top_k, include_metadata=True)
            return [match["metadata"] for match in results["matches"]]
        except Exception as e:
            print(f"Search error: {e}. Returning all mock customers.")
    return MOCK_DATA
