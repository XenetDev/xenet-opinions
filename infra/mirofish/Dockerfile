FROM python:3.11-slim

ARG MIROFISH_REPO=https://github.com/666ghj/MiroFish
ARG MIROFISH_REF=7657031ac01184afe2cb220f5ee3545573b5e843

RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates gcc libc6-dev \
  && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:0.9.26 /uv /uvx /bin/

RUN git init -q /app \
  && git -C /app remote add origin "$MIROFISH_REPO" \
  && git -C /app fetch -q --depth 1 origin "$MIROFISH_REF" \
  && git -C /app checkout -q "$MIROFISH_REF"

WORKDIR /app/backend

RUN UV_LINK_MODE=copy UV_COMPILE_BYTECODE=1 uv sync --frozen --no-dev

ENV FLASK_HOST=0.0.0.0 FLASK_PORT=5001 PYTHONUNBUFFERED=1 UV_NO_SYNC=1
EXPOSE 5001

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:5001/health')"

CMD ["uv","run","python","run.py"]
