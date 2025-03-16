# agent_creative.py

from fastapi import FastAPI, Request, HTTPException
import subprocess
import logging
import time
import re
from typing import Dict, Any

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("agent_creative")

app = FastAPI(title="Creative Specialist Agent")

# Constants
MODEL_NAME = "vicuna"
PROCESS_TIMEOUT = 15  # seconds

SYSTEM_PROMPT = (
    "You are a creative specialist with a distinctive voice. "
    "Express ideas with vivid imagery, metaphors, or stories. "
    "Be playful, witty, and engaging in your responses. "
    "Avoid generic phrases and clichés. "
    "Avoid disclaimers about AI capabilities. "
    "Be concise yet impactful.\n\n"
)

DISCLAIMER_PATTERNS = [
    r"As a language model.*?\.", 
    r"I am just an AI.*?\.", 
    r"I am not sure.*?\.", 
    r"I don't have direct knowledge.*?\.", 
    r"I am not capable.*?\.", 
    r"As an AI.*?\.", 
    r"I don't have the ability.*?\."
]


def remove_disclaimers(text: str) -> str:
    cleaned_text = text
    for pattern in DISCLAIMER_PATTERNS:
        cleaned_text = re.sub(pattern, "", cleaned_text, flags=re.IGNORECASE | re.DOTALL)
    cleaned_text = re.sub(r"\s+", " ", cleaned_text).strip()
    return cleaned_text


def call_ollama(prompt: str) -> str:
    """
    Call the Ollama model with a creative system prompt plus the user's request.
    """
    final_prompt = SYSTEM_PROMPT + f"Creative prompt or question:\n{prompt}"

    logger.info(f"[CreativeAgent] Invoking '{MODEL_NAME}' with creative prompt.")
    start_time = time.time()

    try:
        result = subprocess.run(
            ["ollama", "run", MODEL_NAME, final_prompt],
            capture_output=True,
            text=True,
            timeout=PROCESS_TIMEOUT
        )

        elapsed = time.time() - start_time
        if result.returncode != 0:
            logger.error(f"[CreativeAgent] Ollama error: {result.stderr}")
            return "Error processing the creative request. Please try again."

        logger.info(f"[CreativeAgent] Query processed in {elapsed:.2f}s")

        output = result.stdout.strip()
        output = remove_disclaimers(output)
        return output

    except subprocess.TimeoutExpired:
        logger.error(f"[CreativeAgent] Timeout after {PROCESS_TIMEOUT}s")
        return "The creative process took too long. Try a simpler or shorter prompt."
    except Exception as e:
        logger.exception("[CreativeAgent] Unexpected error calling Ollama.")
        return f"An unexpected error occurred: {str(e)}"


@app.post("/process")
async def process_creative(request: Request) -> Dict[str, Any]:
    """
    Process a creative question/prompt from the orchestrator.
    """
    try:
        data = await request.json()
        question = data.get("question", "").strip()
        if not question:
            raise HTTPException(status_code=400, detail="Missing 'question' in request body")

        logger.info(f"[CreativeAgent] Received question: {question[:100]}...")
        answer = call_ollama(question)
        return {"answer": answer}

    except Exception as e:
        logger.exception("[CreativeAgent] Error processing request.")
        return {"answer": "An error occurred while processing your creative request. Please try again."}


@app.get("/")
def index() -> Dict[str, str]:
    """
    Root endpoint for health check.
    """
    return {
        "message": "Creative agent running",
        "status": "online",
        "model": MODEL_NAME,
        "specialty": "creative and open-ended questions",
        "port": "8003"
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("agent_creative:app", host="0.0.0.0", port=8003)
