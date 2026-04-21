import os
from pinecone import Pinecone, ServerlessSpec
from mistralai.client import Mistral
from dotenv import load_dotenv

load_dotenv()

# Constants
INDEX_NAME = "shiftcall-telecom"
EMBEDDING_MODEL = "mistral-embed"
DIMS = 1024

# Mock Data
MOCK_CUSTOMERS = [
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

def setup_pinecone():
    api_key = os.getenv("PINECONE_API_KEY")
    if not api_key:
        print("PINECONE_API_KEY not found")
        return

    pc = Pinecone(api_key=api_key)
    client = Mistral(api_key=os.getenv("MISTRAL_API_KEY"))

    # Delete index if it exists
    try:
        if INDEX_NAME in [idx.name for idx in pc.list_indexes()]:
            print(f"Deleting existing index {INDEX_NAME}...")
            pc.delete_index(INDEX_NAME)
            import time
            time.sleep(10)
    except Exception as e:
        print(f"Index error: {e}")

    # Create index with Mistral dimensions (1024)
    print(f"Creating index {INDEX_NAME} with {DIMS} dims...")
    pc.create_index(
        name=INDEX_NAME,
        dimension=DIMS,
        metric="cosine",
        spec=ServerlessSpec(cloud="aws", region="us-east-1")
    )

    index = pc.Index(INDEX_NAME)

    # Prepare vectors
    vectors = []
    for customer in MOCK_CUSTOMERS:
        text_to_embed = f"Name: {customer['name']}. Industry: {customer['industry']}. History: {customer['history']}. Issues: {customer['previous_issues']}"
        
        response = client.embeddings.create(
            inputs=[text_to_embed],
            model=EMBEDDING_MODEL
        )
        embedding = response.data[0].embedding
        
        vectors.append({
            "id": customer["id"],
            "values": embedding,
            "metadata": customer
        })

    # Upsert
    index.upsert(vectors=vectors)
    print(f"Upserted {len(vectors)} customer profiles using Mistral")

if __name__ == "__main__":
    setup_pinecone()
