# SnapMoGen checkpoints

Not in the repository, and not baked into the image: they are large, and they are under
**Snap Inc.'s non-commercial research licence**, which is not this repository's to
redistribute.

Three checkpoints are needed, all inside the `snapmogen` archive linked from SnapMoGen's
`prepare/download_models.sh`:

- the residual VQ-VAE,
- the MoMask++ masked transformer,
- the **GlobalRegressor** (`gmr`), which post-processes global root translation — easy to
  miss, because it is loaded separately from the other two.

Unpack the archive here so this directory contains `snapmogen/`.

> ⚠️ **Do not run `prepare/download_models.sh` from a directory that matters.** Its first
> line is `rm -rf checkpoint_dir`. Only the *snapmogen* archive is needed; the humanml3d one
> is for a different dataset.

Google Drive rate-limits that file globally ("too many users have viewed or downloaded this
file recently"), so the API often refuses it even when a signed-in browser will not.

`../meta/mean.npy` and `std.npy` are already here — 2,496 bytes each, fetched straight from
the `meta_data/` folder of the HuggingFace dataset `Ericguo5513/SnapMoGen`. Inference needs
only those two files from the 16.5 GB corpus.
