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

# Pinned, not tracking main. Kimodo has changed its SOMA output skeleton once already, and
# its published API differs from its source in four places the worker had to be corrected
# for; a silent bone rename would not crash the adapter, it would return a plausible-looking
# body with false anatomy. This is the commit the bone-rigidity check passed against.
# Moving it is a deliberate edit: bump the hash, re-run the check, record it in
# docs/v1-implementation.md.
RUN python3.10 -m pip install --no-cache-dir \
      "git+https://github.com/nv-tlabs/kimodo.git@1aece8c124d73d255ceff5086d983b844c9f4e94"

# Build context is inference/, not this directory, so the shared canonical package can be
# copied in. Installed before the worker, because the worker declares it as a dependency
# and it is on no index.
COPY common /common
RUN python3.10 -m pip install --no-cache-dir /common

COPY kimodo-worker/pyproject.toml .
COPY kimodo-worker/app app
RUN python3.10 -m pip install --no-cache-dir .
EXPOSE 8010
CMD ["python3.10", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8010"]
