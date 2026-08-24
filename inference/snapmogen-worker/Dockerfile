# Base and torch layer are deliberately IDENTICAL to the Kimodo worker's, so BuildKit
# reuses them. A cold torch layer costs ~850 s; shared, this image builds in about 35.
#
# CUDA 12.8: Blackwell cards (RTX 50-series, sm_120) have no kernels in cu124 builds.
FROM nvidia/cuda:12.8.1-cudnn-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      git python3.10 python3-pip cmake build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /worker

RUN python3.10 -m pip install --no-cache-dir --upgrade pip \
    && python3.10 -m pip install --no-cache-dir \
      torch==2.9.1 torchvision==0.24.1 \
      --index-url https://download.pytorch.org/whl/cu128

# SnapMoGen's own dependencies, deliberately UNPINNED where it pins.
#
# Its requirements.txt asks for torch==2.4.1 and numpy==1.24.3. Neither can drive Blackwell,
# and neither can sit beside torch 2.9. The Stage B spike ran the whole path — import, model
# construction, generate(), VQ decode, forward kinematics — with both pins lifted, on
# torch 2.9.1+cu128 and numpy 2.2.6. protobuf is needed by the T5 tokenizer's sentencepiece
# conversion and is not in their list.
RUN python3.10 -m pip install --no-cache-dir \
      einops transformers tokenizers sentencepiece protobuf scipy pyyaml tqdm

# Pinned, not tracking main, for the same reason the Kimodo worker is pinned: the joint map
# below was enumerated from utils/A_Pose.bvh at this commit, and a silent rig change would
# not crash the adapter — it would return a plausible-looking body with false anatomy.
# Moving it is a deliberate edit: bump the hash, re-run the bone-rigidity check, record it
# in docs/v3-models.md.
ARG SNAPMOGEN_COMMIT=dc6881d
# Outside /worker: setuptools would otherwise see two top-level packages in the build root
# and refuse to install this worker at all.
RUN git clone https://github.com/snap-research/SnapMoGen.git /opt/SnapMoGen \
    && git -C /opt/SnapMoGen checkout ${SNAPMOGEN_COMMIT}

# Build context is inference/, so the shared canonical package is reachable. Installed
# before the worker, which declares it as a dependency and finds it on no index.
COPY common /common
RUN python3.10 -m pip install --no-cache-dir /common

COPY snapmogen-worker/pyproject.toml .
COPY snapmogen-worker/app app
RUN python3.10 -m pip install --no-cache-dir .

# Weights and the 5 KB of dataset statistics are mounted, never baked: they are large,
# licensed separately (Snap Inc. non-commercial), and must not end up in an image layer.
ENV SNAPMOGEN_DIR=/opt/SnapMoGen \
    SNAPMOGEN_CHECKPOINT_DIR=/checkpoints \
    SNAPMOGEN_META_DIR=/meta

EXPOSE 8011
CMD ["python3.10", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8011"]
