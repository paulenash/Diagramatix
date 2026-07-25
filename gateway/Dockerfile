# Anthropic-compatible Gemini gateway for Diagramatix (LiteLLM Proxy).
# The config is baked in so the image is self-contained; secrets (the Google key
# and the master key) are supplied at runtime as env vars, never built in.
#
# Build straight into your ACR (no local Docker needed):
#   az acr build -r dgxprodacr -t litellm-gateway:1 gateway/
FROM ghcr.io/berriai/litellm:main-latest
COPY config.yaml /app/config.yaml
CMD ["--config", "/app/config.yaml", "--port", "4000", "--num_workers", "1"]
