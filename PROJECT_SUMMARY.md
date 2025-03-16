# AI Cluster Project Documentation

## Overview

AI Cluster is a distributed AI system architecture that leverages specialized agents to handle different types of user queries. The system uses an orchestrator to route requests to the most appropriate specialized agent, creating a more efficient and effective AI response system.

## Architecture

### Core Components

1. **Orchestrator Service** - Central routing mechanism that:
   - Evaluates incoming user queries
   - Determines the most appropriate agent to handle each query
   - Manages communication between users and specialized agents
   - Evaluates and refines agent responses when necessary

2. **Specialized Agents**:
   - `agent_math` - Optimized for mathematical problems and calculations using the deepseek-r1 model
   - `agent_coding` - Specialized for programming and software development tasks using the codellama model
   - `agent_creative` - Handles creative and open-ended questions using the vicuna model
   - `self` (Orchestrator's internal capability) - Handles general knowledge and conversation using llama3.2 model

### Request Flow

1. User sends query to the orchestrator
2. Orchestrator evaluates the query to determine the appropriate agent
3. If the orchestrator can handle it directly, it responds using its internal LLM
4. Otherwise, it routes the query to the specialized agent with an introduction
5. Specialized agent processes the query and returns a response
6. Orchestrator evaluates the response quality
7. If needed, orchestrator requests refinements from the agent
8. Orchestrator provides follow-up commentary and returns the complete response to the user

## Technical Details

### Technologies

- **Framework**: FastAPI
- **Response Streaming**: Server-Sent Events (SSE)
- **Base Models**:
  - llama3.2 (Orchestrator)
  - deepseek-r1 (Math Agent)
  - codellama (Coding Agent)
  - vicuna (Creative Agent)
- **Deployment**: Docker containers with inter-service communication

### API Endpoints

- `/query` - Main endpoint for processing user queries (streaming responses)
- `/health` - Health check endpoint to monitor system status
- `/` - Root endpoint with basic service information

### Error Handling

- Robust error handling with retries for agent communication
- Timeout management to prevent hanging responses
- Graceful degradation when specialized agents are unavailable

### Response Processing

- Response sanitization to remove AI disclaimers and thinking markers
- Quality evaluation to ensure helpful and accurate answers
- Automated refinement requests when responses are insufficient

## Development and Deployment

### Local Development

```bash
# Start the orchestrator service
python orchestrator.py

# Each agent should be started separately on their designated ports
# agent_math: 8001
# agent_coding: 8002
# agent_creative: 8003
```

### System Requirements

- Python 3.8+
- Ollama for local LLM inference
- Sufficient RAM to support multiple concurrent LLM instances
- Network configuration allowing inter-service communication

## Future Improvements

1. Add authentication and rate limiting
2. Implement agent performance analytics
3. Add support for more specialized agents
4. Develop a feedback mechanism to improve agent selection
5. Implement conversation history management
6. Add support for multimodal inputs (images, audio)

## Project Status

The project is currently in active development with core functionality implemented and working.
