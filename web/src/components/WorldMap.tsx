import { geoAzimuthalEqualArea, geoDistance, geoGraticule, geoPath } from "d3-geo";
import type { MultiLineString, MultiPolygon } from "geojson";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { feature } from "topojson-client";
import landTopo from "world-atlas/land-110m.json";
import { useStore } from "../store";
import { HIGH_UNCERTAINTY, formatPct, pointFor, type Region } from "../types";
import { hotspotColor } from "../words";

/** South-polar view of the Southern Ocean, down to about 38°S. */
const S = 1000;
const projection = geoAzimuthalEqualArea()
  .rotate([20, 90])
  .clipAngle(52)
  .fitExtent(
    [
      [6, 6],
      [S - 6, S - 6],
    ],
    { type: "Sphere" },
  );
const pathGen = geoPath(projection);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const topo = landTopo as any;
const LAND = pathGen(feature(topo, topo.objects.land)) ?? "";
const SEA = pathGen({ type: "Sphere" }) ?? "";
const GRATICULE = pathGen(geoGraticule().step([30, 10])()) ?? "";

type Box = [number, number, number, number];
const HOME: Box = [0, 0, S, S];
const MIN_W = 120;

function project(lon: number, lat: number): [number, number] {
  return (projection([lon, lat]) as [number, number] | null) ?? [S / 2, S / 2];
}

/**
 * Split the sea into areas: each grid cell belongs to the nearest region, out to ~24°.
 * Returns one fill path and one outline path per region.
 */
function buildAreas(regions: Region[]) {
  const dLon = 2;
  const dLat = 1.5;
  const lat0 = -80;
  const nLon = 360 / dLon;
  const nLat = Math.round((80 - 38) / dLat);
  const reach = (24 * Math.PI) / 180;
  const owner = new Int16Array(nLon * nLat).fill(-1);
  for (let j = 0; j < nLat; j++) {
    for (let i = 0; i < nLon; i++) {
      const c: [number, number] = [-180 + (i + 0.5) * dLon, lat0 + (j + 0.5) * dLat];
      let best = -1;
      let bestD = reach;
      regions.forEach((r, k) => {
        const d = geoDistance(c, [r.lon, r.lat]);
        if (d < bestD) {
          bestD = d;
          best = k;
        }
      });
      owner[j * nLon + i] = best;
    }
  }
  const at = (i: number, j: number) => (j < 0 || j >= nLat ? -1 : owner[j * nLon + ((i + nLon) % nLon)]);
  const fills: number[][][][][] = regions.map(() => []);
  const edges: number[][][][] = regions.map(() => []);
  for (let j = 0; j < nLat; j++) {
    for (let i = 0; i < nLon; i++) {
      const k = at(i, j);
      if (k < 0) continue;
      const x0 = -180 + i * dLon;
      const x1 = x0 + dLon;
      const y0 = lat0 + j * dLat;
      const y1 = y0 + dLat;
      fills[k].push([
        [
          [x0, y0],
          [x0, y1],
          [x1, y1],
          [x1, y0],
          [x0, y0],
        ],
      ]);
      if (at(i - 1, j) !== k) edges[k].push([[x0, y0], [x0, y1]]);
      if (at(i + 1, j) !== k) edges[k].push([[x1, y0], [x1, y1]]);
      if (at(i, j - 1) !== k) edges[k].push([[x0, y0], [x1, y0]]);
      if (at(i, j + 1) !== k) edges[k].push([[x0, y1], [x1, y1]]);
    }
  }
  return regions.map((region, k) => ({
    id: region.id,
    fill: pathGen({ type: "MultiPolygon", coordinates: fills[k] } as MultiPolygon) ?? "",
    outline: pathGen({ type: "MultiLineString", coordinates: edges[k] } as MultiLineString) ?? "",
  }));
}

function boxFor(focus: string | null, regions: Region[]): Box {
  if (!focus || focus === "southern_ocean") return HOME;
  const region = regions.find((item) => item.id === focus);
  if (!region) return HOME;
  const [x, y] = project(region.lon, region.lat);
  return [x - 210, y - 210, 420, 420];
}

function clampBox([x, y, w, h]: Box): Box {
  const width = Math.min(S * 1.2, Math.max(MIN_W, w));
  const height = (h / w) * width;
  return [Math.min(S - width * 0.3, Math.max(-width * 0.7, x)), Math.min(S - height * 0.3, Math.max(-height * 0.7, y)), width, height];
}

export function WorldMap() {
  const regions = useStore((s) => s.dataset.regions);
  const year = useStore((s) => s.year);
  const scenario = useStore((s) => s.scenario);
  const selected = useStore((s) => s.selected);
  const focus = useStore((s) => s.focus);
  const highlight = useStore((s) => s.highlight);
  const select = useStore((s) => s.select);
  const focusOn = useStore((s) => s.focusOn);

  const svg = useRef<SVGSVGElement>(null);
  const [box, setBoxState] = useState<Box>(HOME);
  const boxRef = useRef<Box>(HOME);
  const raf = useRef(0);
  const [px, setPx] = useState({ w: 800, h: 600 });
  const drag = useRef<{ x: number; y: number; box: Box; moved: boolean; id: number } | null>(null);
  const moved = useRef(false);

  const setBox = useCallback((next: Box) => {
    boxRef.current = next;
    setBoxState(next);
  }, []);

  const animateTo = useCallback(
    (target: Box) => {
      cancelAnimationFrame(raf.current);
      const from = boxRef.current;
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / 550);
        const e = 1 - Math.pow(1 - t, 3);
        setBox(from.map((v, i) => v + (target[i] - v) * e) as Box);
        if (t < 1) raf.current = requestAnimationFrame(tick);
      };
      raf.current = requestAnimationFrame(tick);
    },
    [setBox],
  );

  useEffect(() => {
    animateTo(boxFor(focus, regions));
  }, [focus, regions, animateTo]);

  // Rendered size, so labels can stay a fixed number of screen pixels at any zoom.
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setPx({ w: entry.contentRect.width, h: entry.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scale = Math.min(px.w / box[2], px.h / box[3]);
  const unit = 1 / scale; // svg units per screen pixel

  const toUnits = useCallback(
    (clientX: number, clientY: number): [number, number] => {
      const el = svg.current!;
      const rect = el.getBoundingClientRect();
      const [bx, by, bw, bh] = boxRef.current;
      const k = Math.min(rect.width / bw, rect.height / bh);
      const ox = (rect.width - bw * k) / 2;
      const oy = (rect.height - bh * k) / 2;
      return [bx + (clientX - rect.left - ox) / k, by + (clientY - rect.top - oy) / k];
    },
    [],
  );

  const zoomAt = useCallback(
    (factor: number, at?: [number, number]) => {
      cancelAnimationFrame(raf.current);
      const [x, y, w, h] = boxRef.current;
      const [cx, cy] = at ?? [x + w / 2, y + h / 2];
      const nw = Math.min(S * 1.2, Math.max(MIN_W, w * factor));
      const r = nw / w;
      setBox(clampBox([cx - (cx - x) * r, cy - (cy - y) * r, nw, h * r]));
    },
    [setBox],
  );

  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      zoomAt(Math.exp(event.deltaY * 0.0015), toUnits(event.clientX, event.clientY));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt, toUnits]);

  const onPointerDown = (event: React.PointerEvent) => {
    cancelAnimationFrame(raf.current);
    drag.current = { x: event.clientX, y: event.clientY, box: boxRef.current, moved: false, id: event.pointerId };
    moved.current = false;
  };
  const onPointerMove = (event: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = event.clientX - d.x;
    const dy = event.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 5) return;
    if (!d.moved) svg.current?.setPointerCapture(d.id);
    d.moved = true;
    moved.current = true;
    const [x, y, w, h] = d.box;
    setBox(clampBox([x - dx * unit, y - dy * unit, w, h]));
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  const areas = useMemo(() => buildAreas(regions), [regions]);

  const ranked = useMemo(
    () =>
      [...regions]
        .map((region) => ({ id: region.id, hotspot: pointFor(region, year, scenario)?.hotspot ?? 0 }))
        .sort((a, b) => b.hotspot - a.hotspot)
        .slice(0, 3)
        .map((row) => row.id),
    [regions, year, scenario],
  );
  const pointed = new Set(
    highlight ? (highlight.kind === "hotspots" ? highlight.ids : [highlight.id]) : [],
  );
  const zoomedIn = box[2] < S * 0.62;
  const roomy = px.w * (S / box[2]) > 1100;

  const pick = (id: string) => {
    if (moved.current) return;
    select(id);
    focusOn(id);
    if (focus === id) animateTo(boxFor(id, regions));
  };

  const reset = () => {
    select(null);
    focusOn(null);
    animateTo(HOME);
  };

  return (
    <div className="map-shell">
      <svg
        ref={svg}
        className="worldmap"
        viewBox={box.join(" ")}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Map of the Southern Ocean around Antarctica, split into krill regions. Drag to move, scroll to zoom."
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <defs>
          <pattern id="unsure" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="10" className="unsure-line" />
          </pattern>
        </defs>
        <rect x={-S} y={-S} width={S * 3} height={S * 3} className="backdrop" onClick={() => !moved.current && reset()} />
        <path d={SEA} className="sea" onClick={() => !moved.current && reset()} />

        {regions.map((region, k) => {
          const point = pointFor(region, year, scenario);
          const hotspot = point?.hotspot ?? 0;
          const area = areas[k];
          return (
            <g
              key={region.id}
              className={`area ${selected === region.id ? "is-selected" : ""} ${pointed.has(region.id) ? "is-pointed" : ""}`}
              onClick={(event) => {
                event.stopPropagation();
                pick(region.id);
              }}
              role="button"
              tabIndex={0}
              aria-label={`${region.name}: hotspot chance ${formatPct(hotspot)}`}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") pick(region.id);
              }}
            >
              <title>
                {region.name} · hotspot {formatPct(hotspot)} · krill {formatPct(point?.density ?? 0)}
              </title>
              <path d={area?.fill} fill={hotspotColor(hotspot)} stroke={hotspotColor(hotspot)} className="area-fill" />
              {(point?.uncertainty ?? 0) >= HIGH_UNCERTAINTY && <path d={area?.fill} className="area-unsure" />}
            </g>
          );
        })}

        <path d={GRATICULE} className="graticule" />
        {areas.map((area, k) => (
          <path key={area.id} d={area.outline} className={`area-edge ${regions[k].mpa ? "mpa" : ""}`} />
        ))}
        <path d={LAND} className="land" />
        {areas.map((area) =>
          selected === area.id || pointed.has(area.id) ? (
            <path key={`o-${area.id}`} d={area.outline} className={`area-ring ${pointed.has(area.id) ? "pulse" : ""}`} />
          ) : null,
        )}

        {regions.map((region) => {
          const point = pointFor(region, year, scenario);
          const [cx, cy] = project(region.lon, region.lat);
          const important = selected === region.id || pointed.has(region.id) || ranked.includes(region.id);
          const showName = zoomedIn || important || roomy;
          return (
            <g
              key={`l-${region.id}`}
              className={`label ${important ? "strong" : ""}`}
              transform={`translate(${cx} ${cy}) scale(${unit})`}
              onClick={(event) => {
                event.stopPropagation();
                pick(region.id);
              }}
            >
              <rect x={-24} y={-14} width={48} height={28} rx={14} className="label-pill" />
              <text y={6} textAnchor="middle" className="label-val">
                {formatPct(point?.hotspot ?? 0)}
              </text>
              {region.mpa && <circle cx={22} cy={-12} r={6} className="label-mpa" />}
              {showName && (
                <text y={32} textAnchor="middle" className="label-name">
                  {region.name}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      <div className="map-tools">
        <button onClick={() => zoomAt(0.7)} aria-label="Zoom in">
          +
        </button>
        <button onClick={() => zoomAt(1.4)} aria-label="Zoom out">
          −
        </button>
        <button onClick={reset} aria-label="Show the whole Southern Ocean" title="Whole ocean">
          ⌂
        </button>
      </div>
    </div>
  );
}
