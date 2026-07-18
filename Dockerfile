FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Required by OpenCV/RapidOCR in the PDF ingestion pipeline.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

COPY backend /app/backend
WORKDIR /app/backend

EXPOSE 10000
CMD ["sh", "-c", "uvicorn main:app --host ${HOST:-0.0.0.0} --port ${PORT:-10000} --workers 1"]
