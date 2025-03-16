# config.py

from enum import Enum

class AgentType(str, Enum):
    MATH = "agent_math"
    CODING = "agent_coding"
    CREATIVE = "agent_creative"
    SELF = "self"

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
