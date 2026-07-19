FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080

WORKDIR /app
COPY cloud_gateway/requirements.txt /app/cloud_gateway/requirements.txt
RUN pip install --no-cache-dir -r /app/cloud_gateway/requirements.txt
COPY cloud_gateway /app/cloud_gateway

RUN useradd --create-home --uid 10001 gateway
USER gateway

CMD ["sh", "-c", "uvicorn cloud_gateway.main:app --host 0.0.0.0 --port ${PORT}"]

