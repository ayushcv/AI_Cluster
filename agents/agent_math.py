# agent_math.py

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
logger = logging.getLogger("agent_math")

app = FastAPI(title="Math Specialist Agent")

# Constants
MODEL_NAME = "deepseek-r1"
PROCESS_TIMEOUT = 90  # seconds

# System prompt for math expertise
SYSTEM_PROMPT = (
    "You are an expert mathematician. "
    "Provide clear, concise, and correct mathematical explanations. "
    "Use equations, step-by-step solutions, and examples when appropriate. "
    "Be extremely precise with numbers and formulas. "
    "Avoid disclaimers about AI capabilities. "
    "Focus on solving or explaining the math problem directly.\n\n"
)

# Disclaimers or phrases we want to remove
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
    """
    Remove disclaimers or AI references using regex, then strip extra whitespace.
    """
    cleaned_text = text
    for pattern in DISCLAIMER_PATTERNS:
        cleaned_text = re.sub(pattern, "", cleaned_text, flags=re.IGNORECASE | re.DOTALL)
    
    # Reduce extra whitespace
    cleaned_text = re.sub(r"\s+", " ", cleaned_text).strip()
    return cleaned_text


def call_ollama(prompt: str) -> str:
    """
    Call the Ollama model with the math system prompt plus the user's question.
    """
    final_prompt = SYSTEM_PROMPT + f"Mathematical problem or question:\n{prompt}"

    logger.info(f"[MathAgent] Invoking '{MODEL_NAME}' with math prompt.")
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
            logger.error(f"[MathAgent] Ollama error: {result.stderr}")
            return "Error processing the mathematical query. Please try again."
        
        logger.info(f"[MathAgent] Query processed in {elapsed:.2f}s")

        output = result.stdout.strip()
        output = remove_disclaimers(output)
        return output
    
    except subprocess.TimeoutExpired:
        logger.error(f"[MathAgent] Timeout after {PROCESS_TIMEOUT}s")
        return "The mathematical computation took too long. Try simplifying the query."
    except Exception as e:
        logger.exception("[MathAgent] Unexpected error calling Ollama.")
        return f"An unexpected error occurred: {str(e)}"


@app.post("/process")
async def process_math(request: Request) -> Dict[str, Any]:
    """
    Process a math question from the orchestrator.
    """
    try:
        data = await request.json()
        question = data.get("question", "").strip()
        if not question:
            raise HTTPException(status_code=400, detail="Missing 'question' in request body")

        logger.info(f"[MathAgent] Received question: {question[:100]}...")
        answer = call_ollama(question)
        return {"answer": answer}

    except Exception as e:
        logger.exception("[MathAgent] Error processing request.")
        return {"answer": f"Error processing the math request: {str(e)}"}


@app.get("/")
def index() -> Dict[str, str]:
    """
    Root endpoint for health check.
    """
    return {
        "service": "Math Specialist Agent",
        "model": MODEL_NAME,
        "status": "running",
        "port": "8001"
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("agent_math:app", host="0.0.0.0", port=8001, log_level="info")
