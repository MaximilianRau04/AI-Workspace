#!/bin/sh
# Create data files on first start if they don't exist yet
touch /app/chatbot.db /app/model_config.json /app/system_prompt.txt /app/mcp_servers.json
mkdir -p /app/chroma_db

# Behind a reverse proxy, set FORWARDED_ALLOW_IPS to the proxy's address so the
# real client IP (used by the login rate limit) is taken from X-Forwarded-For.
exec uvicorn app:app --host 0.0.0.0 --port 5000 --proxy-headers \
  --forwarded-allow-ips "${FORWARDED_ALLOW_IPS:-127.0.0.1}"
