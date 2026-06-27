#!/bin/sh
# Create data files on first start if they don't exist yet
touch /app/chatbot.db /app/model_config.json /app/system_prompt.txt
mkdir -p /app/chroma_db

exec uvicorn app:app --host 0.0.0.0 --port 5000
