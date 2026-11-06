# Set this to the Python version of your local .venv (run: python --version).
ARG PYTHON_VERSION=3.13
FROM python:${PYTHON_VERSION}-slim
WORKDIR /srv

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    MPLBACKEND=Agg \
    TF_CPP_MIN_LOG_LEVEL=2

# CPU-only PyTorch (the default Linux wheel drags in ~2.5 GB of CUDA libraries).
# KEEP: the AI-image detector uses CLIP (torch + transformers) to extract features.
RUN pip install torch==2.14.1 --index-url https://download.pytorch.org/whl/cpu

COPY requirements.txt .
RUN pip install -r requirements.txt

# Code only. Model files are mounted at /srv/models at runtime (see cloud/docker-compose.yml).
COPY . .

EXPOSE 8000
# One worker on purpose: every extra worker loads its own copy of the model into RAM.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
