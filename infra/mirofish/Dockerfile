FROM python:3.11-slim AS build

ARG MIROFISH_REPO=https://github.com/666ghj/MiroFish
ARG MIROFISH_REF=7657031ac01184afe2cb220f5ee3545573b5e843

RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates gcc libc6-dev \
  && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir uv==0.9.26

RUN git init -q /app \
  && git -C /app remote add origin "$MIROFISH_REPO" \
  && git -C /app fetch -q --depth 1 origin "$MIROFISH_REF" \
  && git -C /app checkout -q "$MIROFISH_REF" \
  && rm -rf /app/.git

WORKDIR /app/backend

# CPU-only torch in one layer: the machines have no GPU and the CUDA wheels alone exceed Fly's 8 GiB image limit
RUN UV_LINK_MODE=copy UV_COMPILE_BYTECODE=1 UV_HTTP_TIMEOUT=600 uv sync --frozen --no-dev \
  && TORCH=$(uv pip freeze --python .venv | grep -E '^torch==' | cut -d= -f3) \
  && UV_HTTP_TIMEOUT=600 uv pip install --python .venv --reinstall --index-url https://download.pytorch.org/whl/cpu "torch==${TORCH}" \
  && uv pip freeze --python .venv | cut -d= -f1 | grep -Ei '^(nvidia-|triton$)' | xargs -r uv pip uninstall --python .venv \
  && uv cache clean \
  && .venv/bin/python -c "import torch; print(torch.__version__, torch.cuda.is_available())"

FROM python:3.11-slim

ARG MIROFISH_REF=7657031ac01184afe2cb220f5ee3545573b5e843

RUN pip install --no-cache-dir uv==0.9.26 \
  && useradd -u 10001 -m mirofish

COPY --from=build /app /app

WORKDIR /app/backend

RUN test -f /app/LICENSE \
  && mkdir -p /app/backend/uploads /app/backend/logs \
  && chown -R mirofish:mirofish /app/backend/uploads /app/backend/logs

LABEL org.opencontainers.image.source="https://github.com/666ghj/MiroFish" \
  org.opencontainers.image.revision="${MIROFISH_REF}" \
  org.opencontainers.image.licenses="AGPL-3.0" \
  org.opencontainers.image.description="Upstream MiroFish backend, unmodified, packaged for Xenet Opinions"

USER mirofish

ENV FLASK_HOST=0.0.0.0 FLASK_PORT=5001 PYTHONUNBUFFERED=1 UV_NO_SYNC=1
EXPOSE 5001

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:5001/health')"

CMD ["uv","run","python","run.py"]
