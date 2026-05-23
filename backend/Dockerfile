# Stage 1: Build & Ingest Dependencies
FROM python:3.11-slim

# Set environment variables for optimized execution
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PORT=8000

WORKDIR /app

# Install system dependencies (e.g., git, gcc, build-essential if needed for native packages)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies with caching optimization
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# Copy backend source code
COPY . .

# Create directory structure for dynamic storage
RUN mkdir -p storage/sessions logs

# Expose port
EXPOSE 8000

# Start production multi-worker ASGI server configuration
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
