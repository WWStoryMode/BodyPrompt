# CUDA 12.8: Blackwell cards (RTX 50-series, sm_120) have no kernels in cu124 builds.
FROM nvidia/cuda:12.8.1-cudnn-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
# cmake and a compiler are here rather than beside their one consumer below because
# reordering this layer would re-download two gigabytes of CUDA wheels.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      git python3.10 python3-pip cmake build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /worker

# Ordered slowest-and-most-stable first, so editing the worker's own code does not
# re-download two gigabytes of CUDA wheels.
RUN python3.10 -m pip install --no-cache-dir --upgrade pip \
    && python3.10 -m pip install --no-cache-dir \
      torch==2.9.1 torchvision==0.24.1 \
      --index-url https://download.pytorch.org/whl/cu128

# Kimodo's setup.py compiles MotionCorrection, a pybind11/Eigen C++ extension, unless
# SKIP_MOTION_CORRECTION_IN_SETUP is set. It performs the foot-skate and constraint
# cleanup, so it is worth the toolchain: python3.10-dev supplies the headers cmake looks
# for, and pybind11 and Eigen are fetched by its CMakeLists during the build.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3.10-dev \
    && rm -rf /var/lib/apt/lists/*

RUN python3.10 -m pip install --no-cache-dir \
      "git+https://github.com/nv-tlabs/kimodo.git"

COPY pyproject.toml .
COPY app app
RUN python3.10 -m pip install --no-cache-dir .
EXPOSE 8010
CMD ["python3.10", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8010"]
