# CUDA 12.8: Blackwell cards (RTX 50-series, sm_120) have no kernels in cu124 builds.
FROM nvidia/cuda:12.8.1-cudnn-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
    && apt-get install -y --no-install-recommends git python3.10 python3-pip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /worker
COPY pyproject.toml .
COPY app app
RUN python3.10 -m pip install --no-cache-dir --upgrade pip \
    && python3.10 -m pip install --no-cache-dir \
      torch==2.9.1 torchvision==0.24.1 \
      --index-url https://download.pytorch.org/whl/cu128 \
    && python3.10 -m pip install --no-cache-dir . \
    && python3.10 -m pip install --no-cache-dir \
      "git+https://github.com/nv-tlabs/kimodo.git"
EXPOSE 8010
CMD ["python3.10", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8010"]
