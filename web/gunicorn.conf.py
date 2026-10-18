"""Shared development/production entry point; environment controls deployment."""
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).with_name('.env'))

# A LAN phone needs HOST=0.0.0.0; production ingress supplies PORT.
bind = f"{os.getenv('HOST', '127.0.0.1')}:{os.getenv('PORT', '3001')}"
workers = int(os.getenv('WEB_CONCURRENCY', '2'))
timeout = 30
graceful_timeout = 30
accesslog = '-'
errorlog = '-'
