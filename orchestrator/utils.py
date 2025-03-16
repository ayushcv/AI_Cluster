# utils.py
import re

def sanitize_text(text: str) -> str:
    """
    Remove any internal thought process markers, disclaimers, etc.
    """
    # Remove <think> blocks
    text = re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL)

    # Remove disclaimers
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
