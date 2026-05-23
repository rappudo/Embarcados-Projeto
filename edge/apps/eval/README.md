# `eval` — offline evaluation harness

Standalone C++ binary that exercises the exact `FaceDetector` +
`FaceEmbedder` code paths used on the Pi, but reads JPEGs from disk
instead of a camera. Produces CSVs you can drive a FAR/FRR sweep and a
scale study off of in pandas/Excel.

Built alongside the daemon:

```bash
cd edge
cmake -S . -B build -DBUILD_TESTING=ON
cmake --build build -j$(nproc)
./build/eval        # prints usage
```

---

## Dataset — LFW (Labeled Faces in the Wild)

13,233 images of 5,749 identities. Standard academic benchmark for face
verification.

```bash
mkdir -p data && cd data

# Aligned/funneled images, ~170 MB
curl -O http://vis-www.cs.umass.edu/lfw/lfw-funneled.tgz
tar xzf lfw-funneled.tgz   # → lfw_funneled/<Name>/<Name>_NNNN.jpg

# Canonical 6,000-pair verification file (10 folds × 600)
curl -O http://vis-www.cs.umass.edu/lfw/pairs.txt
```

The raw (non-funneled) `lfw.tgz` works too; funneled just gives BlazeFace
an easier time on a few profile shots. Either way the directory layout
must be `<root>/<Name>/<Name>_NNNN.jpg` — the LFW default.

---

## Mode 1 — pairs evaluation (FAR/FRR)

For each of LFW's 6,000 standard pairs, compute the cosine distance
between the two embeddings. The output CSV lets you sweep thresholds
externally without re-running inference.

```bash
./build/eval --pairs data/pairs.txt \
             --dataset data/lfw_funneled \
             --out far_frr.csv \
             --onnx-threads 4
```

Expected wall time on a laptop CPU: ~3–6 minutes (deduplicates to ~9–11k
unique images; ArcFace inference is the bottleneck). Progress prints to
stderr every 250 images.

Output columns:

| col          | meaning                                                                |
|--------------|------------------------------------------------------------------------|
| `image_a`    | LFW path of first image of the pair                                    |
| `image_b`    | LFW path of second image                                               |
| `same`       | 1 = same identity (genuine), 0 = different identity (impostor)         |
| `distance`   | Cosine distance (1 - cosine similarity). Empty if either embed failed. |
| `status`     | `ok`, or `a:no_face`, `b:imread_failed`, etc. for diagnostic counts.   |

### Analysis sketch (pandas)

```python
import pandas as pd, numpy as np
df = pd.read_csv("far_frr.csv").dropna(subset=["distance"])
gen, imp = df[df.same == 1].distance, df[df.same == 0].distance

ts = np.linspace(0.20, 0.90, 71)
far = [(imp < t).mean() for t in ts]   # impostors accepted at t
frr = [(gen >= t).mean() for t in ts]  # genuines rejected at t
eer_idx = np.argmin(np.abs(np.array(far) - np.array(frr)))
print(f"EER ≈ {(far[eer_idx] + frr[eer_idx]) / 2:.4f} at threshold {ts[eer_idx]:.3f}")
```

Plot `far` and `frr` against `ts`. The crossing is the equal-error-rate
operating point; pick the project threshold from that curve (currently
`edge/config/config.toml` ships `vision.threshold = 0.5`).

---

## Mode 2 — enrollment scale study

Picks N random identities, enrolls one reference embedding for each into
an in-memory `Matcher`, then runs every other image of those N (genuine
probes) plus a sample of out-of-gallery images (impostor probes) through
`Matcher::find_match` with the threshold disabled (so every probe
records its top-1 distance regardless).

```bash
for N in 10 50 100 500 1000; do
  ./build/eval --enroll-scale $N \
               --dataset data/lfw_funneled \
               --out scale_${N}.csv \
               --max-probes-per-identity 5 \
               --max-impostors 1000 \
               --seed 42
done
```

The N=1000 run takes ~6–10 minutes on a laptop CPU (≈1k+5k probes ×
~25 ms/embed).

Output columns:

| col              | meaning                                                                |
|------------------|------------------------------------------------------------------------|
| `gallery_size`   | Actual gallery size after dropping failed enrollments (≤ N).           |
| `probe_path`     | Path of the probe image                                                |
| `probe_identity` | Ground-truth identity of the probe                                     |
| `is_genuine`     | 1 = probe identity is in the gallery, 0 = impostor                     |
| `top1_identity`  | Identity of the nearest gallery embedding                              |
| `distance`       | Cosine distance to that nearest entry                                  |
| `match_us`       | Microseconds for `Matcher::find_match` (linear scan over the gallery). |

### Analysis sketch

```python
import pandas as pd, glob
parts = [pd.read_csv(f) for f in glob.glob("scale_*.csv")]
df = pd.concat(parts, ignore_index=True)

# Latency vs gallery size (the O(N) story).
print(df.groupby("gallery_size").match_us.agg(["mean", "median", "max"]))

# FAR at a fixed operating threshold, as gallery grows.
T = 0.50
imp = df[df.is_genuine == 0]
far = imp.groupby("gallery_size").apply(lambda g: (g.distance < T).mean())
print(far)

# Identification accuracy on genuine probes (rank-1, threshold-gated).
gen = df[df.is_genuine == 1]
acc = gen.groupby("gallery_size").apply(
    lambda g: ((g.distance < T) & (g.top1_identity == g.probe_identity)).mean()
)
print(acc)
```

The interesting plots for the report:
- **§6.1** — FAR/FRR curve + EER from mode 1.
- **§6.2** — `match_us` vs `gallery_size` from mode 2 (and the per-stage
  CSV from the production pipeline's `[metrics]` block — see edge README).
- **§6.3** — FAR(T=0.50) vs `gallery_size` from mode 2. This is the
  "what happens as the company grows" story.
