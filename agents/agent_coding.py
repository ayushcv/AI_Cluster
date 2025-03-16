#agent_coding.py

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
logger = logging.getLogger("agent_coding")

app = FastAPI(title="Coding Specialist Agent")

# Constants
MODEL_NAME = "codellama"
PROCESS_TIMEOUT = 15  # seconds

SYSTEM_PROMPT = (
    "You are an expert software engineer and programmer. "
    "Provide clean, efficient, and well-documented code examples. "
    "Explain complex concepts clearly using practical examples. "
    "Consider edge cases and performance implications. "
    "Format code properly with syntax highlighting when relevant. "
    "Avoid disclaimers about AI capabilities. "
    "Focus on solving the programming problem directly.\n\n"
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
    Call the Ollama model with a coding system prompt plus the user's input.
    """
    final_prompt = SYSTEM_PROMPT + f"Coding question or problem:\n{prompt}"
    
    logger.info(f"[CodingAgent] Invoking '{MODEL_NAME}' with coding prompt.")
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
            logger.error(f"[CodingAgent] Ollama error: {result.stderr}")
            return "Error processing the coding query. Please try again."

        logger.info(f"[CodingAgent] Query processed in {elapsed:.2f}s")

        output = result.stdout.strip()
        output = remove_disclaimers(output)
        return output

    except subprocess.TimeoutExpired:
        logger.error(f"[CodingAgent] Timeout after {PROCESS_TIMEOUT}s")
        return "The coding analysis took too long. Try breaking the query into smaller parts."
    except Exception as e:
        logger.exception("[CodingAgent] Unexpected error calling Ollama.")
        return f"An unexpected error occurred: {str(e)}"


@app.post("/process")
async def process_coding(request: Request) -> Dict[str, Any]:
    """
    Process a coding question from the orchestrator.
    """
    try:
        data = await request.json()
        question = data.get("question", "").strip()
        if not question:
            raise HTTPException(status_code=400, detail="Missing 'question' in request body")

        logger.info(f"[CodingAgent] Received question: {question[:100]}...")
        answer = call_ollama(question)
        return {"answer": answer}

    except Exception as e:
        logger.exception("[CodingAgent] Error processing request.")
        return {"answer": f"Error processing the coding request: {str(e)}"}


@app.get("/")
def index() -> Dict[str, str]:
    """
    Root endpoint for health check.
    """
    return {
        "service": "Coding Specialist Agent",
        "model": MODEL_NAME,
        "status": "running",
        "port": "8002"
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("agent_coding:app", host="0.0.0.0", port=8002, log_level="info")
