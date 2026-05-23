#!/usr/bin/env python3
"""FaceGateway — report figure helpers.

Consumes the CSVs emitted by the edge pipeline's `[metrics]` block and by
`edge/build/eval` (pairs + enroll-scale modes), and renders the figures
referenced in §6 of `docs/Main.tex`.

Run a single figure or the full set:

    python plots.py latency-stages    --input metrics.csv
    python plots.py pairs-far-frr     --input pairs.csv
    python plots.py scale-latency     --input "scale_*.csv"
    python plots.py all  --metrics metrics.csv --pairs pairs.csv --scale "scale_*.csv"

Figures default to `docs/figures/out/`.
"""

from __future__ import annotations

import argparse
import glob
import pathlib
import sys
from typing import Iterable

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

HERE = pathlib.Path(__file__).resolve().parent
DEFAULT_OUT = HERE / "out"

# Labels are PT-BR because the report (docs/Main.tex) is in Portuguese.
STAGE_COLS = ["capture_us", "detect_us", "embed_us", "match_us", "publish_us"]
STAGE_LABELS = ["captura", "detecção", "embedding", "match", "publish"]

plt.rcParams.update({
    "figure.dpi": 150,
    "savefig.dpi": 150,
    "savefig.bbox": "tight",
    "axes.titlesize": 13,
    "axes.labelsize": 11,
    "legend.fontsize": 10,
    "xtick.labelsize": 10,
    "ytick.labelsize": 10,
})


def _ensure_outdir(path: pathlib.Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def _percentile(s: pd.Series, q: float) -> float:
    return float(s.quantile(q)) if len(s) else float("nan")


# --------------------- Latency from the edge pipeline ---------------------

def plot_latency_stages(metrics_csv: str, out_path: pathlib.Path) -> None:
    df = pd.read_csv(metrics_csv)
    data_ms = [df[c].dropna() / 1000.0 for c in STAGE_COLS]
    total_ms = df["total_us"].dropna() / 1000.0

    fig, ax = plt.subplots(figsize=(8, 4.5))
    ax.boxplot(data_ms, tick_labels=STAGE_LABELS, showfliers=False, widths=0.55)
    ax.set_ylabel("Latência (ms)")
    ax.set_title(
        f"Latência por estágio do pipeline (n={len(df)} ciclos, "
        f"total p95={_percentile(total_ms, 0.95):.1f} ms)"
    )
    ax.grid(axis="y", alpha=0.3)
    _ensure_outdir(out_path)
    fig.savefig(out_path)
    plt.close(fig)

    print(f"[latency-stages] cycles loaded: {len(df)}")
    for col, label in zip(STAGE_COLS, STAGE_LABELS):
        s = df[col].dropna() / 1000.0
        if len(s) == 0:
            print(f"  {label:<10} — no samples")
            continue
        print(f"  {label:<10} n={len(s):>5}  mean={s.mean():6.2f}ms  "
              f"p50={_percentile(s, 0.50):6.2f}  p95={_percentile(s, 0.95):6.2f}  "
              f"max={s.max():6.2f}")
    if len(total_ms):
        print(f"  {'total':<10} n={len(total_ms):>5}  mean={total_ms.mean():6.2f}ms  "
              f"p95={_percentile(total_ms, 0.95):6.2f}  max={total_ms.max():6.2f}")
    print(f"  → {out_path}")


# --------------------- Pairs / FAR-FRR (§6.1) ---------------------

def _load_pairs(path: str) -> tuple[np.ndarray, np.ndarray]:
    df = pd.read_csv(path).dropna(subset=["distance"])
    gen = df.loc[df["same"] == 1, "distance"].to_numpy()
    imp = df.loc[df["same"] == 0, "distance"].to_numpy()
    if len(gen) == 0 or len(imp) == 0:
        raise SystemExit(
            f"[pairs] expected both same=1 and same=0 rows in {path}; "
            f"got gen={len(gen)} imp={len(imp)}"
        )
    return gen, imp


def plot_pairs_distributions(pairs_csv: str, out_path: pathlib.Path) -> None:
    gen, imp = _load_pairs(pairs_csv)
    upper = float(np.percentile(np.concatenate([gen, imp]), 99.5))
    bins = np.linspace(0.0, max(1.0, upper + 0.05), 60)

    fig, ax = plt.subplots(figsize=(8, 4.5))
    ax.hist(imp, bins=bins, alpha=0.55, label=f"impostor (n={len(imp)})", color="#d62728")
    ax.hist(gen, bins=bins, alpha=0.55, label=f"mesmo (n={len(gen)})",    color="#2ca02c")
    ax.set_xlabel("Distância de cosseno")
    ax.set_ylabel("Frequência")
    ax.set_title("Distribuição de distâncias — pares LFW")
    ax.legend()
    ax.grid(axis="y", alpha=0.3)
    _ensure_outdir(out_path)
    fig.savefig(out_path)
    plt.close(fig)
    print(f"[pairs-distributions] gen={len(gen)} imp={len(imp)} → {out_path}")


def plot_far_frr(pairs_csv: str, out_path: pathlib.Path,
                 t_min: float = 0.20, t_max: float = 1.20, n: int = 201) -> None:
    gen, imp = _load_pairs(pairs_csv)
    ts = np.linspace(t_min, t_max, n)
    far = np.array([(imp < t).mean() for t in ts])
    frr = np.array([(gen >= t).mean() for t in ts])

    eer_idx = int(np.argmin(np.abs(far - frr)))
    eer = float((far[eer_idx] + frr[eer_idx]) / 2.0)
    eer_t = float(ts[eer_idx])

    fig, ax = plt.subplots(figsize=(8, 4.5))
    ax.plot(ts, far, label="FAR (falso aceite)", color="#d62728")
    ax.plot(ts, frr, label="FRR (falsa rejeição)", color="#1f77b4")
    ax.axvline(eer_t, ls="--", color="grey", alpha=0.6)
    ax.scatter([eer_t], [eer], color="black", zorder=10,
               label=f"EER ≈ {eer:.4f} @ T={eer_t:.3f}")
    ax.set_xlabel("Limiar de distância de cosseno T")
    ax.set_ylabel("Taxa")
    ax.set_title("Curvas FAR e FRR — LFW")
    ax.set_ylim(0, max(0.05, float(max(far.max(), frr.max())) + 0.02))
    ax.grid(alpha=0.3)
    ax.legend()
    _ensure_outdir(out_path)
    fig.savefig(out_path)
    plt.close(fig)

    # Surface the operating points the report will quote.
    for ref_t in (0.40, 0.45, 0.50, 0.55, 0.60):
        i = int(np.argmin(np.abs(ts - ref_t)))
        print(f"  T={ts[i]:.3f}  FAR={far[i]:.4f}  FRR={frr[i]:.4f}")
    print(f"[pairs-far-frr] EER ≈ {eer:.4f} at T ≈ {eer_t:.3f} → {out_path}")


# --------------------- Scale (§6.2 + §6.3) ---------------------

def _load_scale(pattern: str) -> pd.DataFrame:
    paths = sorted(glob.glob(pattern))
    if not paths:
        raise SystemExit(f"no files match pattern: {pattern}")
    df = pd.concat([pd.read_csv(p) for p in paths], ignore_index=True)
    df["match_us"] = pd.to_numeric(df["match_us"], errors="coerce")
    df["distance"] = pd.to_numeric(df["distance"], errors="coerce")
    df["is_genuine"] = df["is_genuine"].astype(int)
    return df


def plot_scale_latency(pattern: str, out_path: pathlib.Path) -> None:
    df = _load_scale(pattern).dropna(subset=["match_us"])
    grouped = df.groupby("gallery_size")["match_us"].agg(
        mean="mean",
        median="median",
        p95=lambda s: float(s.quantile(0.95)),
    ).sort_index()

    fig, ax = plt.subplots(figsize=(8, 4.5))
    ax.plot(grouped.index, grouped["mean"],   marker="o", label="média")
    ax.plot(grouped.index, grouped["median"], marker="s", label="mediana")
    ax.plot(grouped.index, grouped["p95"],    marker="^", label="p95")
    ax.set_xlabel("Tamanho da galeria (N embeddings registrados)")
    ax.set_ylabel("Tempo de Matcher::find_match (μs)")
    ax.set_title("Latência do match vs tamanho da galeria (varredura linear O(N))")
    if grouped.index.max() / max(1, grouped.index.min()) >= 10:
        ax.set_xscale("log")
    ax.grid(alpha=0.3)
    ax.legend()
    _ensure_outdir(out_path)
    fig.savefig(out_path)
    plt.close(fig)

    print(f"[scale-latency] gallery sizes: {sorted(df['gallery_size'].unique())}")
    print(grouped.to_string(float_format=lambda v: f"{v:.1f}"))
    print(f"  → {out_path}")


def plot_scale_far(pattern: str, out_path: pathlib.Path, threshold: float) -> None:
    df = _load_scale(pattern).dropna(subset=["distance"])
    imp = df[df["is_genuine"] == 0]
    if imp.empty:
        raise SystemExit("scale-far needs is_genuine=0 rows (impostor probes)")
    far_by_n = imp.groupby("gallery_size").apply(
        lambda g: float((g["distance"] < threshold).mean()),
        include_groups=False,
    ).sort_index()

    fig, ax = plt.subplots(figsize=(8, 4.5))
    ax.plot(far_by_n.index, far_by_n.values, marker="o", color="#d62728")
    ax.set_xlabel("Tamanho da galeria")
    ax.set_ylabel(f"FAR @ T={threshold:.2f}")
    ax.set_title("Falso aceite vs tamanho da galeria (impostores LFW)")
    if far_by_n.index.max() / max(1, far_by_n.index.min()) >= 10:
        ax.set_xscale("log")
    ax.grid(alpha=0.3)
    _ensure_outdir(out_path)
    fig.savefig(out_path)
    plt.close(fig)

    print(f"[scale-far] T={threshold:.2f}, n impostor probes by gallery:")
    print(imp.groupby("gallery_size").size().to_string())
    print(far_by_n.to_string(float_format=lambda v: f"{v:.4f}"))
    print(f"  → {out_path}")


def plot_scale_accuracy(pattern: str, out_path: pathlib.Path, threshold: float) -> None:
    df = _load_scale(pattern).dropna(subset=["distance"])
    gen = df[df["is_genuine"] == 1]
    if gen.empty:
        raise SystemExit("scale-accuracy needs is_genuine=1 rows (genuine probes)")
    acc = gen.groupby("gallery_size").apply(
        lambda g: float(
            ((g["distance"] < threshold) &
             (g["top1_identity"] == g["probe_identity"])).mean()
        ),
        include_groups=False,
    ).sort_index()

    fig, ax = plt.subplots(figsize=(8, 4.5))
    ax.plot(acc.index, acc.values, marker="o", color="#2ca02c")
    ax.set_xlabel("Tamanho da galeria")
    ax.set_ylabel(f"Acurácia top-1 (T={threshold:.2f})")
    ax.set_title("Acurácia de identificação vs tamanho da galeria")
    if acc.index.max() / max(1, acc.index.min()) >= 10:
        ax.set_xscale("log")
    ax.set_ylim(0, 1.02)
    ax.grid(alpha=0.3)
    _ensure_outdir(out_path)
    fig.savefig(out_path)
    plt.close(fig)

    print(f"[scale-accuracy] T={threshold:.2f}")
    print(acc.to_string(float_format=lambda v: f"{v:.4f}"))
    print(f"  → {out_path}")


# --------------------- CLI ---------------------

def _add_io(p: argparse.ArgumentParser, default_in: str, default_out: str) -> None:
    p.add_argument("--input", default=default_in,
                   help=f"input CSV (default: {default_in})")
    p.add_argument("--out", default=str(DEFAULT_OUT / default_out),
                   help=f"output PNG/PDF (default: {DEFAULT_OUT / default_out})")


def main(argv: Iterable[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)

    a = sub.add_parser("latency-stages",
                       help="per-stage pipeline latency (boxplot) from metrics.csv")
    _add_io(a, "metrics.csv", "latency_stages.png")

    b = sub.add_parser("pairs-distributions",
                       help="genuine vs impostor distance histograms from pairs.csv")
    _add_io(b, "pairs.csv", "pairs_distributions.png")

    c = sub.add_parser("pairs-far-frr",
                       help="FAR + FRR sweep with EER marked, from pairs.csv")
    _add_io(c, "pairs.csv", "pairs_far_frr.png")

    d = sub.add_parser("scale-latency",
                       help="match_us vs gallery_size from scale_*.csv")
    _add_io(d, "scale_*.csv", "scale_latency.png")

    e = sub.add_parser("scale-far",
                       help="FAR at fixed threshold vs gallery size")
    _add_io(e, "scale_*.csv", "scale_far.png")
    e.add_argument("--threshold", type=float, default=0.50)

    f = sub.add_parser("scale-accuracy",
                       help="rank-1 identification accuracy vs gallery size")
    _add_io(f, "scale_*.csv", "scale_accuracy.png")
    f.add_argument("--threshold", type=float, default=0.50)

    g = sub.add_parser("all", help="run every figure with one command")
    g.add_argument("--metrics", default="metrics.csv")
    g.add_argument("--pairs",   default="pairs.csv")
    g.add_argument("--scale",   default="scale_*.csv")
    g.add_argument("--threshold", type=float, default=0.50)

    args = p.parse_args(list(argv) if argv is not None else None)

    if args.cmd == "latency-stages":
        plot_latency_stages(args.input, pathlib.Path(args.out))
    elif args.cmd == "pairs-distributions":
        plot_pairs_distributions(args.input, pathlib.Path(args.out))
    elif args.cmd == "pairs-far-frr":
        plot_far_frr(args.input, pathlib.Path(args.out))
    elif args.cmd == "scale-latency":
        plot_scale_latency(args.input, pathlib.Path(args.out))
    elif args.cmd == "scale-far":
        plot_scale_far(args.input, pathlib.Path(args.out), args.threshold)
    elif args.cmd == "scale-accuracy":
        plot_scale_accuracy(args.input, pathlib.Path(args.out), args.threshold)
    elif args.cmd == "all":
        DEFAULT_OUT.mkdir(parents=True, exist_ok=True)
        ran = []
        if pathlib.Path(args.metrics).exists():
            plot_latency_stages(args.metrics, DEFAULT_OUT / "latency_stages.png")
            ran.append("latency-stages")
        else:
            print(f"[skip] metrics: {args.metrics} not found")
        if pathlib.Path(args.pairs).exists():
            plot_pairs_distributions(args.pairs, DEFAULT_OUT / "pairs_distributions.png")
            plot_far_frr(args.pairs, DEFAULT_OUT / "pairs_far_frr.png")
            ran.append("pairs-*")
        else:
            print(f"[skip] pairs: {args.pairs} not found")
        if glob.glob(args.scale):
            plot_scale_latency(args.scale, DEFAULT_OUT / "scale_latency.png")
            plot_scale_far(args.scale, DEFAULT_OUT / "scale_far.png", args.threshold)
            plot_scale_accuracy(args.scale, DEFAULT_OUT / "scale_accuracy.png", args.threshold)
            ran.append("scale-*")
        else:
            print(f"[skip] scale: no files match {args.scale}")
        print(f"\nFigures generated: {', '.join(ran) if ran else '(none)'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
