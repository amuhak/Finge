import { geoEquirectangular, geoGraticule10, geoPath } from "d3-geo";
import { useEffect, useMemo, useRef, useState } from "react";
import { feature } from "topojson-client";
import landTopo from "world-atlas/land-110m.json";
import { useStore } from "../store";
import { pointFor, type Region } from "../types";

const W = 1000;
const H = 500;

const projection = geoEquirectangular()
  .translate([W / 2, H / 2])
  .scale(W / (2 * Math.PI));
const pathGen = geoPath(projection);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const topo = landTopo as any;
const LAND = pathGen(feature(topo, topo.objects.land)) ?? "";
const GRATICULE = pathGen(geoGraticule10()) ?? "";

type Box = [number, number, number, number];

const WORLD_BOX: Box = [0, 0, W, H];

function project(lon: number, lat: number): [number, number] {
  return (projection([lon, lat]) as [number, number] | null) ?? [0, 0];
}

function clampBox(box: Box): Box {
  const [x, y, width, height] = box;
  const w = Math.min(W, Math.max(180, width));
  const h = Math.min(H, Math.max(120, height));
  return [Math.min(Math.max(0, x), W - w), Math.min(Math.max(0, y), H - h), w, h];
}

function boxFor(focus: string | null, regions: Region[]): Box {
  if (!focus) return WORLD_BOX;
  if (focus === "southern_ocean") {
    const top = project(0, -32)[1];
    const bottom = project(0, -86)[1];
    return clampBox([0, top, W, bottom - top]);
  }
  const region = regions.find((item) => item.id === focus);
  if (!region) return WORLD_BOX;
  const [x, y] = project(region.lon, region.lat);
  return clampBox([x - 150, y - 105, 300, 210]);
}

function useTweenedBox(target: Box): Box {
  const [box, setBox] = useState<Box>(target);
  const current = useRef<Box>(target);
  const raf = useRef(0);
  const key = target.join(",");

  useEffect(() => {
    const from = current.current;
    const to = target;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / 520);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = [0, 1, 2, 3].map((i) => from[i] + (to[i] - from[i]) * eased) as unknown as Box;
      current.current = next;
      setBox(next);
      if (progress < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return box;
}

function heat(value: number): string {
  const stops = [
    [46, 111, 142],
    [242, 193, 78],
    [227, 93, 91],
  ];
  const t = Math.max(0, Math.min(1, value)) * 2;
  const index = Math.min(1, Math.floor(t));
  const f = t - index;
  const a = stops[index];
  const b = stops[index + 1];
  const channel = (i: number) => Math.round(a[i] + (b[i] - a[i]) * f);
  return `rgb(${channel(0)}, ${channel(1)}, ${channel(2)})`;
}

export function WorldMap() {
  const regions = useStore((s) => s.dataset.regions);
  const year = useStore((s) => s.year);
  const scenario = useStore((s) => s.scenario);
  const selected = useStore((s) => s.selected);
  const focus = useStore((s) => s.focus);
  const select = useStore((s) => s.select);
  const focusOn = useStore((s) => s.focusOn);

  const target = useMemo(() => boxFor(focus, regions), [focus, regions]);
  const [x, y, width, height] = useTweenedBox(target);
  const zoom = Math.pow(width / W, 1);
  const zoomed = width < 620;

  return (
    <svg
      className="worldmap"
      viewBox={`${x} ${y} ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Map of the Southern Ocean with krill density by region"
    >
      <rect x={0} y={0} width={W} height={H} className="ocean" />
      <path d={GRATICULE} className="graticule" />
      <path d={LAND} className="land" />

      {regions.map((region) => {
        const point = pointFor(region, year, scenario);
        const [cx, cy] = project(region.lon, region.lat);
        const density = point?.density ?? 0;
        const hotspot = point?.hotspot ?? 0;
        const uncertainty = point?.uncertainty ?? 0.5;
        const radius = (3.6 + 8.4 * density) * zoom;
        const isSelected = selected === region.id;

        return (
          <g
            key={region.id}
            className={`region ${isSelected ? "is-selected" : ""}`}
            onClick={() => {
              select(region.id);
              focusOn(region.id);
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                select(region.id);
                focusOn(region.id);
              }
            }}
          >
            <title>
              {region.name} · density {Math.round(density * 100)}% · hotspot {Math.round(hotspot * 100)}%
              {region.mpa ? " · MPA" : ""}
            </title>
            <circle cx={cx} cy={cy} r={Math.max(10, radius + 8)} fill="transparent" />
            {region.mpa && <circle cx={cx} cy={cy} r={radius + 3.4 * zoom} className="mpa-ring" />}
            {uncertainty > 0.29 && (
              <circle cx={cx} cy={cy} r={radius + 5.4 * zoom} className="uncertain-ring" />
            )}
            <circle
              cx={cx}
              cy={cy}
              r={radius}
              fill={heat(hotspot)}
              className="krill-dot"
              vectorEffect="non-scaling-stroke"
            />
            {isSelected && <circle cx={cx} cy={cy} r={radius + 6.5 * zoom} className="selected-ring" />}
            {zoomed && (
              <text x={cx} y={cy - radius - 7 * zoom} className="region-label" fontSize={12.5 * zoom}>
                {region.name}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
