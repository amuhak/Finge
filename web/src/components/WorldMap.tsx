import { geoDistance, geoGraticule10, geoOrthographic, geoPath, type GeoProjection } from "d3-geo";
import type { MultiLineString, MultiPolygon } from "geojson";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { feature } from "topojson-client";
import landTopo from "world-atlas/land-110m.json";
import { useStore } from "../store";
import { HIGH_UNCERTAINTY, formatPct, pointFor, type Region } from "../types";
import { hotspotColor } from "../words";

/** A globe you can spin. View = rotation (λ, φ) plus zoom; the south pole faces you at home. */
const S = 1000;
const BASE = S / 2 - 14;
type View = { rot: [number, number]; zoom: number };
const HOME: View = { rot: [20, 90], zoom: 1.3 };
const WHOLE: View = { rot: [20, 55], zoom: 0.92 };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const topo = landTopo as any;
export const LAND_GEO = feature(topo, topo.objects.land);
const GRATICULE_GEO = geoGraticule10();

export function globeProjection(view: View): GeoProjection {
  return geoOrthographic()
    .rotate([view.rot[0], view.rot[1], 0])
    .scale(BASE * view.zoom)
    .translate([S / 2, S / 2])
    .clipAngle(90)
    .precision(0.6);
}

/**
 * Split the sea into areas: each grid cell belongs to the nearest region, out to ~24°.
 * Cells in a row with the same owner merge into one strip, so the globe stays fast to redraw.
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
    const y0 = lat0 + j * dLat;
    const y1 = y0 + dLat;
    let i = 0;
    while (i < nLon) {
      const k = at(i, j);
      let end = i;
      while (end + 1 < nLon && at(end + 1, j) === k) end++;
      if (k >= 0) {
        const x0 = -180 + i * dLon;
        const x1 = -180 + (end + 1) * dLon;
        const ring: number[][] = [[x0, y0], [x0, y1]];
        for (let x = x0 + dLon; x <= x1; x += dLon) ring.push([x, y1]);
        ring.push([x1, y0]);
        for (let x = x1 - dLon; x >= x0; x -= dLon) ring.push([x, y0]);
        fills[k].push([ring]);
      }
      i = end + 1;
    }
    for (let i2 = 0; i2 < nLon; i2++) {
      const k = at(i2, j);
      if (k < 0) continue;
      const x0 = -180 + i2 * dLon;
      const x1 = x0 + dLon;
      if (at(i2 - 1, j) !== k) edges[k].push([[x0, y0], [x0, y1]]);
      if (at(i2 + 1, j) !== k) edges[k].push([[x1, y0], [x1, y1]]);
      if (at(i2, j - 1) !== k) edges[k].push([[x0, y0], [x1, y0]]);
      if (at(i2, j + 1) !== k) edges[k].push([[x0, y1], [x1, y1]]);
    }
  }
  return regions.map((region, k) => ({
    id: region.id,
    fill: { type: "MultiPolygon", coordinates: fills[k] } as MultiPolygon,
    outline: { type: "MultiLineString", coordinates: edges[k] } as MultiLineString,
  }));
}

function viewFor(focus: string | null, regions: Region[]): View {
  if (!focus || focus === "southern_ocean") return HOME;
  const region = regions.find((item) => item.id === focus);
  if (!region) return HOME;
  return { rot: [-region.lon, -region.lat], zoom: 2.8 };
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
  const [view, setViewState] = useState<View>(HOME);
  const viewRef = useRef<View>(HOME);
  const raf = useRef(0);
  const [px, setPx] = useState(700);
  const drag = useRef<{ x: number; y: number; view: View; moved: boolean; id: number } | null>(null);
  const moved = useRef(false);
  const [spin, setSpin] = useState(false);

  const setView = useCallback((next: View) => {
    viewRef.current = next;
    setViewState(next);
  }, []);

  const animateTo = useCallback(
    (target: View) => {
      cancelAnimationFrame(raf.current);
      setSpin(false);
      const from = viewRef.current;
      // Spin the short way round.
      let dl = ((target.rot[0] - from.rot[0] + 540) % 360) - 180;
      if (Math.abs(dl) > 180) dl = 0;
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / 750);
        const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        setView({
          rot: [from.rot[0] + dl * e, from.rot[1] + (target.rot[1] - from.rot[1]) * e],
          zoom: from.zoom + (target.zoom - from.zoom) * e,
        });
        if (t < 1) raf.current = requestAnimationFrame(tick);
      };
      raf.current = requestAnimationFrame(tick);
    },
    [setView],
  );

  useEffect(() => {
    animateTo(viewFor(focus, regions));
  }, [focus, regions, animateTo]);

  // Slow auto-spin around the pole.
  useEffect(() => {
    if (!spin) return;
    let last = performance.now();
    const tick = (now: number) => {
      const v = viewRef.current;
      setView({ ...v, rot: [v.rot[0] + (now - last) * 0.012, v.rot[1]] });
      last = now;
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [spin, setView]);

  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setPx(Math.min(entry.contentRect.width, entry.contentRect.height)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const unit = S / Math.max(1, px);

  const zoomBy = useCallback(
    (factor: number) => {
      cancelAnimationFrame(raf.current);
      const v = viewRef.current;
      setView({ ...v, zoom: Math.min(7, Math.max(0.8, v.zoom * factor)) });
    },
    [setView],
  );

  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      zoomBy(Math.exp(-event.deltaY * 0.0015));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomBy]);

  const onPointerDown = (event: React.PointerEvent) => {
    cancelAnimationFrame(raf.current);
    setSpin(false);
    drag.current = { x: event.clientX, y: event.clientY, view: viewRef.current, moved: false, id: event.pointerId };
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
    // Degrees per screen pixel shrink as you zoom in.
    const k = (unit * 57.3) / (BASE * d.view.zoom);
    const phi = Math.max(-90, Math.min(90, d.view.rot[1] - dy * k));
    setView({ ...d.view, rot: [d.view.rot[0] + dx * k, phi] });
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  const areas = useMemo(() => buildAreas(regions), [regions]);
  const projection = useMemo(() => globeProjection(view), [view]);
  const path = useMemo(() => geoPath(projection), [projection]);
  const center: [number, number] = [-view.rot[0], -view.rot[1]];

  const ranked = useMemo(
    () =>
      [...regions]
        .map((region) => ({ id: region.id, hotspot: pointFor(region, year, scenario)?.hotspot ?? 0 }))
        .sort((a, b) => b.hotspot - a.hotspot)
        .slice(0, 3)
        .map((row) => row.id),
    [regions, year, scenario],
  );
  const pointed = new Set(highlight ? (highlight.kind === "hotspots" ? highlight.ids : [highlight.id]) : []);
  const roomy = px * view.zoom > 1150;

  const pick = (id: string) => {
    if (moved.current) return;
    select(id);
    focusOn(id);
    if (focus === id) animateTo(viewFor(id, regions));
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
        viewBox={`0 0 ${S} ${S}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Globe showing krill regions in the Southern Ocean. Drag to spin, scroll to zoom."
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
        <path d={path({ type: "Sphere" }) ?? ""} className="sea" onClick={() => !moved.current && reset()} />
        <path d={path(GRATICULE_GEO) ?? ""} className="graticule" />

        {regions.map((region, k) => {
          const point = pointFor(region, year, scenario);
          const hotspot = point?.hotspot ?? 0;
          const d = path(areas[k].fill) ?? "";
          if (!d) return null;
          return (
            <g
              key={region.id}
              className={`area ${selected === region.id ? "is-selected" : ""}`}
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
              <path d={d} fill={hotspotColor(hotspot)} stroke={hotspotColor(hotspot)} className="area-fill" />
              {(point?.uncertainty ?? 0) >= HIGH_UNCERTAINTY && <path d={d} className="area-unsure" />}
            </g>
          );
        })}

        {areas.map((area, k) => (
          <path key={area.id} d={path(area.outline) ?? ""} className={`area-edge ${regions[k].mpa ? "mpa" : ""}`} />
        ))}
        <path d={path(LAND_GEO) ?? ""} className="land" />
        {areas.map((area) =>
          selected === area.id || pointed.has(area.id) ? (
            <path key={`o-${area.id}`} d={path(area.outline) ?? ""} className={`area-ring ${pointed.has(area.id) ? "pulse" : ""}`} />
          ) : null,
        )}

        {regions.map((region) => {
          if (geoDistance(center, [region.lon, region.lat]) > Math.PI / 2 - 0.08) return null;
          const xy = projection([region.lon, region.lat]);
          if (!xy) return null;
          const point = pointFor(region, year, scenario);
          const important = selected === region.id || pointed.has(region.id) || ranked.includes(region.id);
          return (
            <g
              key={`l-${region.id}`}
              className={`label ${important ? "strong" : ""}`}
              transform={`translate(${xy[0]} ${xy[1]}) scale(${unit})`}
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
              {(important || roomy) && (
                <text y={32} textAnchor="middle" className="label-name">
                  {region.name}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      <div className="map-tools">
        <button onClick={() => zoomBy(1.35)} aria-label="Zoom in">
          +
        </button>
        <button onClick={() => zoomBy(1 / 1.35)} aria-label="Zoom out">
          −
        </button>
        <button onClick={reset} aria-label="Back to the Southern Ocean" title="Southern Ocean">
          ⌂
        </button>
        <button onClick={() => animateTo(WHOLE)} aria-label="Show the whole globe" title="Whole globe">
          🌐
        </button>
        <button
          className={spin ? "on" : ""}
          onClick={() => setSpin((s) => !s)}
          aria-pressed={spin}
          aria-label="Spin the globe"
          title="Spin"
        >
          ⟳
        </button>
      </div>
      <p className="map-hint">Drag to spin · scroll to zoom</p>
    </div>
  );
}
