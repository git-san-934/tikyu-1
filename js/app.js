"use strict";

/* 地球の夜の光 — 月次推移ビューア
 * data/nightlights.json を読み込んで Chart.js で描画する。
 * JSON の形式は scripts/build_data.py / scripts/make_sample.py を参照。
 */

const PALETTE = [
  "#1f6feb", "#e0562d", "#2ca25f", "#8250df", "#d9a400",
  "#0e7c86", "#c2255c", "#5b6672", "#3a7d1e", "#b23aee",
  "#0a6ebd", "#a15c00",
];

const state = {
  data: null,
  selected: new Set(),
  colors: new Map(),
  chart: null,
};

const el = (id) => document.getElementById(id);

init();

async function init() {
  try {
    const res = await fetch("data/nightlights.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.data = await res.json();
  } catch (err) {
    const box = el("load-error");
    box.hidden = false;
    box.textContent =
      "データ (data/nightlights.json) を読み込めませんでした: " + err.message;
    return;
  }

  const d = state.data;
  const regionKeys = Object.keys(d.regions);
  regionKeys.forEach((k, i) => state.colors.set(k, PALETTE[i % PALETTE.length]));

  if (d.meta && d.meta.sample) el("sample-banner").hidden = false;

  // 初期選択：世界 + 日本 + あれば米国・中国
  const defaults = ["World", "Japan", "United States", "China"].filter((k) =>
    d.regions[k]
  );
  (defaults.length ? defaults : regionKeys.slice(0, 3)).forEach((k) =>
    state.selected.add(k)
  );

  buildRegionList();
  buildStartYear();
  renderMeta();

  ["y-mode", "smoothing", "start-year"].forEach((id) =>
    el(id).addEventListener("change", update)
  );
  el("btn-all").addEventListener("click", () => {
    regionKeys.forEach((k) => state.selected.add(k));
    syncCheckboxes();
    update();
  });
  el("btn-none").addEventListener("click", () => {
    state.selected.clear();
    syncCheckboxes();
    update();
  });
  el("btn-csv").addEventListener("click", downloadCsv);

  update();
}

function groupLabel(type) {
  return { world: "全体", country: "国", continent: "大陸" }[type] || type;
}

function buildRegionList() {
  const list = el("region-list");
  list.innerHTML = "";
  const d = state.data;
  const order = ["world", "country", "continent"];
  const byType = {};
  for (const [key, r] of Object.entries(d.regions)) {
    (byType[r.type] ||= []).push([key, r]);
  }
  for (const type of order) {
    if (!byType[type]) continue;
    const h = document.createElement("div");
    h.className = "region-subhead";
    h.textContent = groupLabel(type);
    list.appendChild(h);
    for (const [key, r] of byType[type]) {
      const label = document.createElement("label");
      label.className = "region-item";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.value = key;
      cb.checked = state.selected.has(key);
      cb.addEventListener("change", () => {
        cb.checked ? state.selected.add(key) : state.selected.delete(key);
        update();
      });
      const sw = document.createElement("span");
      sw.className = "swatch";
      sw.style.background = state.colors.get(key);
      const txt = document.createElement("span");
      txt.textContent = r.label_ja || key;
      label.append(cb, sw, txt);
      list.appendChild(label);
    }
  }
}

function syncCheckboxes() {
  document
    .querySelectorAll("#region-list input[type=checkbox]")
    .forEach((cb) => (cb.checked = state.selected.has(cb.value)));
}

function buildStartYear() {
  const months = state.data.months;
  const years = [...new Set(months.map((m) => m.slice(0, 4)))];
  const sel = el("start-year");
  sel.innerHTML = "";
  for (const y of years) {
    const o = document.createElement("option");
    o.value = y;
    o.textContent = y + "年〜";
    sel.appendChild(o);
  }
  sel.value = years[0];
}

/* ---- 計算 ---- */

function movingAverage(values, window = 12, minCount = 8) {
  return values.map((_, i) => {
    if (i < window - 1) return null;
    let sum = 0;
    let n = 0;
    for (let j = i - window + 1; j <= i; j++) {
      if (values[j] != null && isFinite(values[j])) {
        sum += values[j];
        n++;
      }
    }
    return n >= minCount ? sum / n : null;
  });
}

function toIndex(values) {
  const base = values.find((v) => v != null && isFinite(v) && v > 0);
  if (base == null) return values.map(() => null);
  return values.map((v) => (v == null ? null : (v / base) * 100));
}

function buildSeries() {
  const d = state.data;
  const startYear = el("start-year").value;
  const startIdx = d.months.findIndex((m) => m.slice(0, 4) >= startYear);
  const from = startIdx < 0 ? 0 : startIdx;
  const months = d.months.slice(from);

  const yMode = el("y-mode").value;
  const smoothing = el("smoothing").value;

  const datasets = [];
  for (const key of Object.keys(d.regions)) {
    if (!state.selected.has(key)) continue;
    const r = d.regions[key];
    let values = r.values.slice(from);
    if (smoothing === "ma12") values = movingAverage(values);
    if (yMode === "index") values = toIndex(values);
    datasets.push({
      label: r.label_ja || key,
      data: values,
      borderColor: state.colors.get(key),
      backgroundColor: state.colors.get(key),
      borderWidth: 2,
      pointRadius: 0,
      pointHoverRadius: 4,
      tension: 0.15,
      spanGaps: false,
    });
  }
  return { months, datasets, yMode };
}

/* ---- 描画 ---- */

function update() {
  syncCheckboxes();
  const { months, datasets, yMode } = buildSeries();

  const cfg = {
    type: "line",
    data: { labels: months, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { position: "bottom" },
        tooltip: {
          callbacks: {
            label: (c) =>
              `${c.dataset.label}: ${
                c.parsed.y == null ? "—" : fmt(c.parsed.y)
              }`,
          },
        },
      },
      scales: {
        x: {
          ticks: { maxTicksLimit: 12, autoSkip: true },
          grid: { display: false },
        },
        y: {
          type: yMode === "log" ? "logarithmic" : "linear",
          title: {
            display: true,
            text:
              yMode === "index"
                ? "指数（最初の月 = 100）"
                : "光量の合計 (Sum of Lights)",
          },
        },
      },
    },
  };

  if (state.chart) {
    state.chart.config.type = cfg.type;
    state.chart.data = cfg.data;
    state.chart.options = cfg.options;
    state.chart.update();
  } else {
    state.chart = new Chart(el("chart"), cfg);
  }

  renderMetricNote(yMode);
  renderTable(months);
}

function renderMetricNote(yMode) {
  const m = state.data.meta || {};
  const parts = [];
  if (m.unit) parts.push("単位: " + m.unit);
  if (m.scale_m) parts.push("集計解像度: " + m.scale_m + "m");
  if (yMode === "index")
    parts.push("各系列を最初の有効な月で正規化しています");
  el("metric-note").textContent = parts.join(" ／ ");
}

function renderTable(months) {
  const d = state.data;
  const keys = Object.keys(d.regions).filter((k) => state.selected.has(k));
  const table = el("data-table");
  if (!keys.length) {
    table.innerHTML =
      "<tbody><tr><td>地域を選択してください</td></tr></tbody>";
    return;
  }
  const from = d.months.length - months.length;
  let head = "<thead><tr><th>月</th>";
  for (const k of keys) head += `<th>${d.regions[k].label_ja || k}</th>`;
  head += "</tr></thead>";

  let body = "<tbody>";
  // 直近が上に来るよう逆順
  for (let i = months.length - 1; i >= 0; i--) {
    body += `<tr><td>${months[i]}</td>`;
    for (const k of keys) {
      const v = d.regions[k].values[from + i];
      body += `<td>${v == null ? "—" : fmt(v)}</td>`;
    }
    body += "</tr>";
  }
  body += "</tbody>";
  table.innerHTML = head + body;
}

function renderMeta() {
  const m = state.data.meta || {};
  const bits = [];
  if (m.generated) bits.push("データ生成日: " + m.generated);
  if (m.source) bits.push("出典: " + m.source);
  if (m.sample) bits.push("※サンプルデータ");
  el("data-meta").textContent = bits.join(" ／ ");
}

/* ---- ユーティリティ ---- */

function fmt(v) {
  if (v == null || !isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a >= 1e9) return (v / 1e9).toFixed(2) + "B";
  if (a >= 1e6) return (v / 1e6).toFixed(2) + "M";
  if (a >= 1e3) return (v / 1e3).toFixed(1) + "k";
  return v.toFixed(a < 10 ? 2 : 1);
}

function downloadCsv() {
  const d = state.data;
  const keys = Object.keys(d.regions).filter((k) => state.selected.has(k));
  if (!keys.length) return;
  const header = ["month", ...keys.map((k) => d.regions[k].label_ja || k)];
  const rows = [header.join(",")];
  d.months.forEach((mo, i) => {
    const row = [mo];
    for (const k of keys) {
      const v = d.regions[k].values[i];
      row.push(v == null ? "" : v);
    }
    rows.push(row.join(","));
  });
  const blob = new Blob(["﻿" + rows.join("\r\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "nightlights.csv";
  a.click();
  URL.revokeObjectURL(url);
}
