FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8000 \
    GUNICORN_WORKERS=2 \
    GUNICORN_THREADS=8 \
    GUNICORN_TIMEOUT=600

WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/* && \
    adduser --disabled-password --gecos "" appuser

COPY requirements.txt ./
RUN python -m pip install --upgrade pip && \
    python -m pip install -r requirements.txt

COPY . .

RUN chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT:-8000}/api/health" || exit 1

CMD ["sh", "-c", "exec gunicorn --worker-class gthread --workers \"${GUNICORN_WORKERS:-1}\" --threads \"${GUNICORN_THREADS:-8}\" --timeout \"${GUNICORN_TIMEOUT:-600}\" --bind \"0.0.0.0:${PORT:-8000}\" webapp:app"]
