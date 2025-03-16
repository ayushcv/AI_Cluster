from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse
import requests
import subprocess
import re
import logging
import asyncio
from enum import Enum
from typing import Tuple, List, Dict, Optional, Generator
import json
import uuid
import atexit

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("orchestrator")

app = FastAPI(title="AI Cluster Orchestrator")

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --------------------------------------------------------------------
#                          CONFIGURATION
# --------------------------------------------------------------------

class AgentType(str, Enum):
    MATH = "agent_math"
    CODING = "agent_coding"
    CREATIVE = "agent_creative"
    SELF = "self"

# Agent configurations
AGENT_CONFIG = {
    AgentType.MATH: {
        "port": 8001,
        "model": "deepseek-r1",
        "specialty": "mathematical problems and calculations"
    },
    AgentType.CODING: {
        "port": 8002,
        "model": "codellama",
        "specialty": "programming and software development"
    },
    AgentType.CREATIVE: {
        "port": 8003,
        "model": "vicuna",
        "specialty": "creative and open-ended questions"
    },
    AgentType.SELF: {
        "model": "llama3.2", 
        "specialty": "general knowledge and conversation"
    }
}

# Timeouts and retry configuration
REQUEST_TIMEOUT = 60  # seconds
MAX_RETRIES = 3
RETRY_DELAY = 30  # seconds

# --------------------------------------------------------------------
#                          HELPER FUNCTIONS
# --------------------------------------------------------------------

async def call_llama_async(prompt: str) -> str:
    """
    Asynchronously call Llama 2 via Ollama subprocess.
    
    Args:
        prompt: The input prompt to send to the model
        
    Returns:
        The model's text response
    """
    logger.debug(f"Calling Llama with prompt: {prompt[:100]}...")
    
    try:
        # Create subprocess asynchronously
        process = await asyncio.create_subprocess_exec(
            "ollama", "run", "llama3.2", prompt,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        
        # Wait for it to complete with timeout
        stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=15)
        
        if process.returncode != 0:
            error_msg = stderr.decode('utf-8', errors='replace')
            logger.error(f"Ollama subprocess error: {error_msg}")
            return f"Error in LLM processing. Please try again."
            
        return stdout.decode('utf-8', errors='replace').strip().replace('"', '')
        
    except asyncio.TimeoutError:
        logger.error("Ollama subprocess timed out")
        return "Processing took too long. Please try a simpler query."
    except Exception as e:
        logger.exception(f"Error in call_llama_async: {e}")
        return f"Unexpected error in LLM processing: {str(e)}"

def sanitize_text(text: str) -> str:
    """
    Remove any internal thought process markers, normalize whitespace.
    
    Args:
        text: Raw text to clean
        
    Returns:
        Sanitized text
    """
    # Remove thinking process tags
    text = re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL)
    
    # Remove common AI disclaimers
    disclaimers = [
        r"As an AI",
        r"As a language model",
        r"I don't have personal",
        r"I'm just an AI",
        r"I am an AI",
    ]
    for disclaimer in disclaimers:
        text = re.sub(disclaimer + r".*?\.", "", text, flags=re.IGNORECASE)
    
    # Normalize whitespace
    text = re.sub(r'\s+', ' ', text).strip()
    
    return text

# -------------------- DECISION: ORCHESTRATOR vs. AGENT --------------------

async def decide_agent(user_input: str) -> AgentType:
    """
    Decide which agent should handle the user query.
    
    Args:
        user_input: The user's query
        
    Returns:
        AgentType enum value indicating which agent to use
    """
    prompt = f"""Based on this user query, select the most appropriate specialist agent to handle it:
    
Current user query: "{user_input}"

Available specialists:
- Math Agent ({AGENT_CONFIG[AgentType.MATH]["specialty"]})
- Coding Agent ({AGENT_CONFIG[AgentType.CODING]["specialty"]})
- Creative Agent ({AGENT_CONFIG[AgentType.CREATIVE]["specialty"]})
- Self (handle directly for {AGENT_CONFIG[AgentType.SELF]["specialty"]})

Your selection (respond with ONLY "agent_math", "agent_coding", "agent_creative", or "self"):"""

    response = await call_llama_async(prompt)
    response = response.strip().lower()
    
    logger.info(f"Agent decision for '{user_input[:50]}...': {response}")
    
    # Map the response to an AgentType
    if "agent_math" in response:
        return AgentType.MATH
    elif "agent_coding" in response:
        return AgentType.CODING
    elif "agent_creative" in response:
        return AgentType.CREATIVE
    else:
        return AgentType.SELF

async def query_agent(agent_type: AgentType, question: str) -> str:
    """
    Query a specialized agent with the user's question.
    
    Args:
        agent_type: The type of agent to query
        question: The user's question
        
    Returns:
        The agent's response
    """
    if agent_type == AgentType.SELF:
        return await call_llama_async(question)
    
    config = AGENT_CONFIG[agent_type]
    agent_port = config.get("port")
    agent_name = agent_type.value
    
    try:
        for attempt in range(MAX_RETRIES + 1):
            payload = {"question": question}
            try:
                # Fix: Ensure we're using the correct endpoint URL with /process
                agent_endpoint = f"http://localhost:{agent_port}/process"
                
                logger.info(f"Querying {agent_type} (attempt {attempt+1}/{MAX_RETRIES+1})")
                response = await asyncio.get_event_loop().run_in_executor(
                    None,
                    lambda: requests.post(agent_endpoint, json=payload, timeout=REQUEST_TIMEOUT)
                )
                
                if response.status_code == 200:
                    result = response.json().get("answer", "")
                    logger.info(f"Got response from {agent_type} ({len(result)} chars)")
                    return result
                else:
                    logger.warning(f"{agent_type} returned status {response.status_code}")
                    
            except requests.exceptions.Timeout:
                logger.warning(f"Timeout querying {agent_type}")
            except requests.exceptions.ConnectionError:
                logger.warning(f"Connection error querying {agent_type}")
            except Exception as e:
                logger.exception(f"Error querying {agent_type}: {e}")
                
            # Don't sleep on the last attempt
            if attempt < MAX_RETRIES:
                await asyncio.sleep(RETRY_DELAY)
        
        # If we get here, all attempts failed
        return f"Sorry, I couldn't get a response from the {agent_type} expert at this time."
    
    except Exception as e:
        logger.exception(f"Error querying agent: {e}")
        return f"Error querying agent: {str(e)}"

# -------------------- ORCHESTRATOR DIALOGUE FUNCTIONS --------------------

async def generate_intro(agent_type: AgentType, user_input: str) -> str:
    """
    Generate an introduction message when delegating to an agent.
    
    Args:
        agent_type: The agent being consulted
        user_input: The user's query
        
    Returns:
        A natural introduction message
    """
    config = AGENT_CONFIG[agent_type]
    specialty = config["specialty"]
    
    prompt = f"""You are the AI-Chat Manager. The user said: "{user_input}"

You've decided to consult your specialist for {specialty}.

Write a short, friendly message explaining that you're forwarding their request to the specialist. 
Be conversational and brief. Do NOT repeat or rephrase their question back to them - they already know what they asked for.
For example: "I'll connect you with our math expert for this" or "Let me get our programming specialist on this right away."
"""
    
    intro = await call_llama_async(prompt)
    return sanitize_text(intro)

async def generate_followup(agent_type: AgentType, user_input: str, agent_response: str) -> str:
    """
    Generate a follow-up message after receiving an agent's response.
    
    Args:
        agent_type: The agent that was consulted
        user_input: The original user query
        agent_response: The agent's response
        
    Returns:
        A natural follow-up message
    """
    # Keep the prompt simple to avoid prompt injection risks
    prompt = f"""You are the AI-Chat Project Manager leading a team of specialized AI agents. 
The user asked: "{user_input}"
Your specialist responded with valuable information.

Write a brief, friendly closing remark or follow-up question. Be concise and natural.
For example: "I hope that helps with your question! Let me know if you need further clarification."
"""
    
    followup = await call_llama_async(prompt)
    return sanitize_text(followup)

# -------------------- EVALUATION AND GUIDANCE --------------------

async def evaluate_response(user_input: str, agent_type: AgentType, agent_reply: str) -> Tuple[bool, str]:
    """
    Evaluate if the agent's response is satisfactory.
    
    Args:
        user_input: The user's original query
        agent_type: Which agent provided the response
        agent_reply: The agent's response
        
    Returns:
        Tuple of (is_satisfactory, guidance)
    """
    config = AGENT_CONFIG[agent_type]
    specialty = config["specialty"]
    
    # Truncate very long responses for the evaluator
    truncated_reply = agent_reply[:1500] + "..." if len(agent_reply) > 1500 else agent_reply
    
    prompt = f"""As the AI-Chat Project Manager, you're evaluating a specialized AI's response for {specialty}.

User question: "{user_input}"
Specialist response: "{truncated_reply}"

Evaluate ONLY if the response is:
1) Relevant to the user's question
2) Technically accurate
3) Complete enough to be helpful

Output format:
SATISFACTORY
or
NEEDS_IMPROVEMENT: <specific guidance on what's missing or incorrect>
"""
    
    evaluation = await call_llama_async(prompt)
    evaluation = evaluation.strip()
    
    logger.info(f"Evaluation result: {evaluation[:50]}...")
    
    if evaluation.startswith("SATISFACTORY"):
        return True, ""
    elif "NEEDS_IMPROVEMENT" in evaluation:
        parts = evaluation.split(":", 1)
        if len(parts) > 1:
            return False, parts[1].strip()
        else:
            return False, "Please be more comprehensive and accurate in your response."
    else:
        # If format isn't followed, assume it needs improvement
        return False, "Please provide a more helpful response to the user's question."

async def generate_retry_message(agent_type: AgentType) -> str:
    """
    Generate a message indicating the orchestrator is refining the response.
    
    Args:
        agent_type: The agent whose response is being refined
        
    Returns:
        A natural transition message
    """
    config = AGENT_CONFIG[agent_type]
    specialty = config["specialty"]
    
    prompt = f"""As the AI-Chat Project Manager leading a team of AI specialists, you need to get more details from your specialist on {specialty}.

Write a short, natural transition message to the user. For example:
"Let me get some additional details on that..."
"I think we can improve that answer. One moment..."
"Let's dig deeper into this question..."

Keep it brief and conversational.
"""
    
    retry_msg = await call_llama_async(prompt)
    return sanitize_text(retry_msg)

# --------------------------------------------------------------------
#                          FASTAPI ENDPOINTS
# --------------------------------------------------------------------

@app.get("/query")
async def handle_query(request: Request):
    """
    Main endpoint that processes user queries and streams responses.
    
    Args:
        request: The incoming HTTP request with user_input parameter
        
    Returns:
        Streamed SSE response with the orchestrator's messages
    """
    user_input = request.query_params.get("user_input", "").strip()
    
    if not user_input:
        raise HTTPException(status_code=400, detail="Missing or empty user_input parameter")
    
    async def event_generator():
        try:
            agent_type = await decide_agent(user_input)
            
            if (agent_type == AgentType.SELF):
                direct_response = await query_agent(agent_type, user_input)
                direct_response_sanitized = sanitize_text(direct_response)
                # Send response as regular message
                response_data = {
                    "message_type": "content",
                    "content": direct_response_sanitized
                }
                yield f"data: {json.dumps(response_data)}\n\n"
            else:
                intro = await generate_intro(agent_type, user_input)
                intro_sanitized = sanitize_text(intro)
                yield f"data: {intro_sanitized}\n\n"
                
                agent_response = await query_agent(agent_type, user_input)
                agent_response_sanitized = sanitize_text(agent_response)
                yield f"data: {agent_type.value}: {agent_response_sanitized}\n\n"
                
                followup = await generate_followup(agent_type, user_input, agent_response_sanitized)
                followup_sanitized = sanitize_text(followup)
                yield f"data: {followup_sanitized}\n\n"
        except Exception as e:
            logger.exception(f"Error processing query: {e}")
            error_message = "I'm sorry, there was an error processing your request. Please try again."
            yield f"data: {error_message}\n\n"
    
    return EventSourceResponse(event_generator())

@app.get("/health")
async def health_check():
    """
    Simple health check endpoint.
    
    Returns:
        Status information about the orchestrator and agents
    """
    agent_status = {}
    
    # Check each agent
    for agent_type in [AgentType.MATH, AgentType.CODING, AgentType.CREATIVE]:
        config = AGENT_CONFIG[agent_type]
        url = f"http://localhost:{config['port']}/"
        
        try:
            response = await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: requests.get(url, timeout=3)
            )
            agent_status[agent_type] = {
                "status": "online" if response.status_code == 200 else "error",
                "details": response.json() if response.status_code == 200 else str(response.status_code)
            }
        except Exception as e:
            agent_status[agent_type] = {
                "status": "offline",
                "details": str(e)
            }
    
    # Add orchestrator status
    agent_status["orchestrator"] = {
        "status": "online",
        "model": AGENT_CONFIG[AgentType.SELF]["model"],
        "uptime": "N/A"  # You could add actual uptime tracking if desired
    }
    
    return {
        "status": "healthy",
        "timestamp": asyncio.get_event_loop().time(),
        "agents": agent_status
    }

@app.get("/")
async def index():
    """
    Root endpoint.
    
    Returns:
        Basic information about the orchestrator service
    """
    return {
        "name": "AI Cluster Orchestrator",
        "version": "1.0.0",
        "status": "running",
        "endpoints": {
            "/": "This help information",
            "/query": "Main query endpoint (requires user_input parameter)",
            "/health": "System health and status information"
        }
    }

if __name__ == "__main__":
    import uvicorn
    
    # Start the server
    uvicorn.run(
        "orchestrator:app",
        host="0.0.0.0",
        port=8000,
        log_level="info",
        reload=True  # Enable auto-reload during development
    )