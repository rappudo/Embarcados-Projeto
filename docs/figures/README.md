# Figuras do relatório (§6)

Helpers em Python que consomem os CSVs produzidos pelas instrumentações
do projeto e geram as figuras citadas no `docs/Main.tex`.

## Fontes de dados

| CSV               | Origem                                                                                              | Capítulo |
|-------------------|-----------------------------------------------------------------------------------------------------|----------|
| `metrics.csv`     | Edge daemon com `[metrics] csv_path = "metrics.csv"` em `config.toml` (ver `edge/config/`).         | §6.2     |
| `pairs.csv`       | `edge/build/eval --pairs lfw/pairs.txt --dataset lfw/ --out pairs.csv`                              | §6.1     |
| `scale_<N>.csv`   | `edge/build/eval --enroll-scale <N> --dataset lfw/ --out scale_<N>.csv` (rodar para N ∈ {10,50,100,500,1000}) | §6.2, §6.3 |

## Setup

```bash
cd docs/figures
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

## Uso

Figuras individuais:

```bash
python plots.py latency-stages    --input ../../metrics.csv
python plots.py pairs-distributions --input ../../pairs.csv
python plots.py pairs-far-frr     --input ../../pairs.csv
python plots.py scale-latency     --input "../../scale_*.csv"
python plots.py scale-far         --input "../../scale_*.csv" --threshold 0.50
python plots.py scale-accuracy    --input "../../scale_*.csv" --threshold 0.50
```

Tudo de uma vez (procura os CSVs no diretório atual ou no path
informado):

```bash
python plots.py all \
  --metrics ../../metrics.csv \
  --pairs   ../../pairs.csv \
  --scale   "../../scale_*.csv" \
  --threshold 0.50
```

Saída em `docs/figures/out/` (PNG por padrão; passar `--out file.pdf`
funciona, matplotlib detecta pelo sufixo).

Cada subcomando também imprime no stdout os números-chave que
acompanham a figura no relatório (médias por estágio, EER + limiar
ótimo, FAR/FRR em pontos de operação típicos, latência por tamanho de
galeria etc.) — copiar direto pro `Main.tex` evita re-cálculo manual.

## Saídas geradas

| Figura                          | Subcomando            | Capítulo |
|---------------------------------|-----------------------|----------|
| `latency_stages.png`            | `latency-stages`      | §6.2     |
| `pairs_distributions.png`       | `pairs-distributions` | §6.1     |
| `pairs_far_frr.png`             | `pairs-far-frr`       | §6.1     |
| `scale_latency.png`             | `scale-latency`       | §6.2     |
| `scale_far.png`                 | `scale-far`           | §6.3     |
| `scale_accuracy.png`            | `scale-accuracy`      | §6.3     |
