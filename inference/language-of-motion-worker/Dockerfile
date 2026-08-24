# Base and torch layer are deliberately IDENTICAL to the Kimodo and SnapMoGen workers', so
# BuildKit reuses them. Byte-for-byte, including the line breaks: the v3 Stage E spike
# reformatted this block, missed the cache, and paid ~850 s for a cold torch layer.
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

# Language of Motion's dependencies, minus everything text-to-motion does not touch.
#
# Its requirements.txt asks for numpy==1.23.1, transformers==5.12.1 and an omegaconf pin
# with no Python 3.10 artefact. It also lists fairseq (only demo.py and the data-prep
# scripts import it), chumpy (only for legacy .pkl body models — ours is .npz), and the
# whole rendering stack. The Stage E spike ran the entire path — LM construction, weight
# loading, generation, VQ decode, SMPL-X forward kinematics — with this set instead.
RUN python3.10 -m pip install --no-cache-dir \
      "omegaconf>=2.1,<2.2" pytorch_lightning einops transformers tokenizers \
      sentencepiece protobuf scipy pyyaml tqdm loguru rich shortuuid smplx

# Pinned, not tracking main, for the same reason the other two workers are: the pose
# assembly in app/main.py follows demo.py:493-545 at this commit, and a silent change there
# would not crash — it would return a plausible-looking body with false anatomy. Moving it
# is a deliberate edit: bump the hash, re-run the head-height check, record it in
# docs/v3-models.md.
ARG LOM_COMMIT=f238afb
RUN git clone https://github.com/Juzezhang/language_of_motion.git /opt/language_of_motion \
    && git -C /opt/language_of_motion checkout ${LOM_COMMIT}

# Build context is inference/, so the shared canonical package is reachable.
COPY common /common
RUN python3.10 -m pip install --no-cache-dir /common

COPY language-of-motion-worker/pyproject.toml .
COPY language-of-motion-worker/app app
RUN python3.10 -m pip install --no-cache-dir .

# Weights and the SMPL-X body model are mounted, never baked: large, and SMPL-X is licensed
# separately behind an MPI registration that is not ours to redistribute past.
ENV LOM_DIR=/opt/language_of_motion \
    LOM_CHECKPOINT_DIR=/checkpoints \
    LOM_SMPLX_DIR=/smplx \
    LOM_T5_DIR=/checkpoints/t5_models/flan-t5-base

EXPOSE 8012
CMD ["python3.10", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8012"]
