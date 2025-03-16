# ai_clients.py

import asyncio
import requests
import logging
import re
from typing import Optional

logger = logging.getLogger("ai_clients")

class LocalLlamaClient:
    """
    Handles calls to a local Llama-based model via Ollama subprocess.
    """

    def __init__(self, model_name: str, timeout: int = 15):
        self.model_name = model_name
        self.timeout = timeout

    async def generate(self, prompt: str) -> str:
        """
        Asynchronously call Ollama to generate text for the given prompt.
        """
        logger.debug(f"LocalLlamaClient calling model '{self.model_name}' with prompt (truncated): {prompt[:100]}...")

        try:
            process = await asyncio.create_subprocess_exec(
                "ollama", "run", self.model_name, prompt,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )

            stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=self.timeout)

            if process.returncode != 0:
                error_msg = stderr.decode('utf-8', errors='replace')
                logger.error(f"Ollama subprocess error: {error_msg}")
                return "Error in LLM processing. Please try again."

            return stdout.decode('utf-8', errors='replace').strip()

        except asyncio.TimeoutError:
            logger.error("Ollama subprocess timed out")
            return "Processing took too long. Please try a simpler query."
        except Exception as e:
            logger.exception(f"Unexpected error in LocalLlamaClient: {e}")
            return f"Unexpected error in LLM processing: {str(e)}"


class RemoteAgentClient:
    """
    Handles HTTP calls to a remote specialized agent (math, coding, creative).
    """

    def __init__(self, agent_name: str, base_url: str, timeout: int = 60):
        self.agent_name = agent_name
        self.base_url = base_url
        self.timeout = timeout

    async def generate(self, question: str) -> str:
        """
        Make an HTTP request (POST) to the remote agent with the user's question.
        """
        try:
            response = await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: requests.post(
                    f"{self.base_url}/process",
                    json={"question": question},
                    timeout=self.timeout
                )
            )
            if response.status_code == 200:
                data = response.json()
                return data.get("answer", "")
            else:
                logger.warning(f"RemoteAgentClient {self.agent_name} returned status {response.status_code}")
                return f"Error: agent responded with status {response.status_code}"
        except requests.exceptions.Timeout:
            logger.warning(f"Timeout when calling {self.agent_name}")
            return f"Sorry, I couldn't get a response from {self.agent_name} within the timeout."
        except requests.exceptions.ConnectionError:
            logger.warning(f"Connection error when calling {self.agent_name}")
            return f"Could not connect to {self.agent_name}."
        except Exception as e:
            logger.exception(f"Error calling remote agent {self.agent_name}: {e}")
            return f"An error occurred: {str(e)}"
