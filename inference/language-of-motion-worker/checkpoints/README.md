# Language of Motion — checkpoints

Not in this repository. Two of the four things needed here are ours to point at but not to
redistribute, and one of them is behind a registration a human has to pass.

```
checkpoints/
├── lom_t2m/Instruct_Mixed_T2M_LM.ckpt   954 MB   HF: JuzeZhang/language_of_motion
├── lom_vq_ds/lom_vq.ckpt                 69 MB   HF: JuzeZhang/language_of_motion
└── t5_models/flan-t5-base/               945 MB  HF: google/flan-t5-base
```

The released weights are **Apache-2.0** and the code is **MIT** — unlike SnapMoGen, nothing
here is non-commercial.

```bash
mkdir -p lom_t2m lom_vq_ds t5_models/flan-t5-base
for f in Instruct_Mixed_T2M_LM.ckpt; do
  curl -L -o lom_t2m/$f "https://huggingface.co/JuzeZhang/language_of_motion/resolve/main/$f"
done
curl -L -o lom_vq_ds/lom_vq.ckpt \
  "https://huggingface.co/JuzeZhang/language_of_motion/resolve/main/lom_vq.ckpt"
for f in config.json generation_config.json model.safetensors spiece.model \
         tokenizer.json tokenizer_config.json special_tokens_map.json; do
  curl -L -o t5_models/flan-t5-base/$f \
    "https://huggingface.co/google/flan-t5-base/resolve/main/$f"
done
```

## SMPL-X — a gate only a human can pass

The worker needs `SMPLX_NEUTRAL_2020.npz`, mounted separately at `LOM_SMPLX_DIR`.

1. Register at <https://smpl-x.is.tue.mpg.de/> and accept the licence.
2. Download **SMPL-X 2020 neutral** (160 MB).
3. Put it at `<your dir>/smplx/SMPLX_NEUTRAL_2020.npz` and point `LOM_SMPLX_DIR` at
   `<your dir>`.

**Do not run upstream's `build_resources.sh`.** It prompts for your MPI credentials
interactively and also fetches FLAME, HuBERT, the t2m evaluators and a second copy of
FLAN-T5 — none of which text-to-motion touches.

The SMPL-X model is not optional and not only for rendering: this model outputs pose
*parameters*, and turning rotations into the joint positions our schema carries means
running the body model. `/health` names whatever is missing rather than failing with a
stack trace from inside `smplx`.
