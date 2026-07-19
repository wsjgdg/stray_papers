'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, ZoomIn, ZoomOut, Maximize2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/lib/store';
import { type Spot, parseCoords, getDistrict, getCategoryColor } from '@/lib/spot-data';

interface NetSpot extends Spot { coords: { lat: number; lng: number }; district: string; sx: number; sy: number; }

const BUBBLE_R = 8;
const BUBBLE_R_MAJOR = 12;
const EDGE_PAD = 60;

// Per-district color palette for connection lines
const DISTRICT_LINE_COLORS = [
  '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#3B82F6',
  '#EC4899', '#06B6D4', '#F97316', '#14B8A6', '#6366F1',
  '#84CC16', '#E11D48', '#0EA5E9', '#A855F7', '#D946EF',
];

function getDistrictColor(index: number): string {
  return DISTRICT_LINE_COLORS[index % DISTRICT_LINE_COLORS.length];
}

export default function NetworkView() {
  const { spots, setSelectedSpot, dissuasionRecords } = useAppStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [centeredId, setCenteredId] = useState<string | null>(null);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const dragOrigin = useRef({ x: 0, y: 0 });
  const hasMoved = useRef(false);
  const [viewW, setViewW] = useState(800);
  const [viewH, setViewH] = useState(600);
  const animFrameRef = useRef<number>(0);

  // ═══ 劝退热力图：按景点ID统计劝退记录数 ═══
  const heatCounts = useMemo(() => {
    const m: Record<string, number> = {};
    dissuasionRecords.forEach(r => {
      m[r.spotId] = (m[r.spotId] || 0) + 1;
    });
    return m;
  }, [dissuasionRecords]);
  const maxHeat = useMemo(() => Math.max(1, ...Object.values(heatCounts)), [heatCounts]);

  // Resize observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setViewW(width); setViewH(height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Parse + project spots
  const { projected, districts, districtColorMap, minLat, maxLat, minLng, maxLng } = useMemo(() => {
    const valid = spots.map((s) => {
      const coords = parseCoords(s);
      return { ...s, coords: coords as NonNullable<typeof coords>, district: getDistrict(s.address), sx: 0, sy: 0 };
    }).filter((s) => s.coords) as NetSpot[];

    if (valid.length === 0) return { projected: [] as NetSpot[], districts: [] as { name: string; cx: number; cy: number; spots: NetSpot[] }[], districtColorMap: {} as Record<string, string>, minLat: 0, maxLat: 1, minLng: 0, maxLng: 1 };

    const lats = valid.map((s) => s.coords.lat), lngs = valid.map((s) => s.coords.lng);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    const latR = maxLat - minLat || 1, lngR = maxLng - minLng || 1;

    const w = Math.max(viewW, 600) - EDGE_PAD * 2;
    const h = Math.max(viewH, 400) - EDGE_PAD * 2;
    const aspect = w / h;
    const dataAspect = lngR / latR;
    let scaleX: number, scaleY: number;
    if (dataAspect > aspect) { scaleX = w; scaleY = w / dataAspect; }
    else { scaleY = h; scaleX = h * dataAspect; }

    const projected = valid.map((s) => ({
      ...s,
      sx: EDGE_PAD + ((s.coords.lng - minLng) / lngR) * scaleX,
      sy: EDGE_PAD + ((maxLat - s.coords.lat) / latR) * scaleY,
    }));

    // Group by district
    const groups = new Map<string, NetSpot[]>();
    projected.forEach((s) => { const g = groups.get(s.district) || []; g.push(s); groups.set(s.district, g); });
    const districts = Array.from(groups.entries()).map(([name, sp]) => ({
      name,
      cx: sp.reduce((a, s) => a + s.sx, 0) / sp.length,
      cy: sp.reduce((a, s) => a + s.sy, 0) / sp.length,
      spots: sp,
    }));

    // Assign color per district
    const districtColorMap: Record<string, string> = {};
    districts.forEach((d, i) => { districtColorMap[d.name] = getDistrictColor(i); });

    return { projected, districts, districtColorMap, minLat, maxLat, minLng, maxLng };
  }, [spots, viewW, viewH]);

  // Anti-overlap: nudge overlapping bubbles
  const finalSpots = useMemo(() => {
    const pts = projected.map((s) => ({ ...s }));
    for (let iter = 0; iter < 30; iter++) {
      let moved = false;
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const dx = pts[j].sx - pts[i].sx, dy = pts[j].sy - pts[i].sy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const minDist = BUBBLE_R * 3.5;
          if (dist < minDist && dist > 0) {
            const push = (minDist - dist) / 2;
            const nx = dx / dist, ny = dy / dist;
            pts[i].sx -= nx * push; pts[i].sy -= ny * push;
            pts[j].sx += nx * push; pts[j].sy += ny * push;
            moved = true;
          }
        }
      }
      if (!moved) break;
    }
    return pts;
  }, [projected]);

  const activeDistrict = hoveredId ? finalSpots.find((s) => s.id === hoveredId)?.district : (centeredId ? finalSpots.find((s) => s.id === centeredId)?.district : null);

  // ─── Pan handlers (mouse) ───
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as SVGElement).closest('.spot-bubble')) return;
    e.preventDefault();
    isDragging.current = true;
    hasMoved.current = false;
    dragStart.current = { x: e.clientX, y: e.clientY };
    dragOrigin.current = { x: transform.x, y: transform.y };
  }, [transform]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) hasMoved.current = true;
    cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = requestAnimationFrame(() => {
      setTransform((t) => ({ ...t, x: dragOrigin.current.x + dx, y: dragOrigin.current.y + dy }));
    });
    setCenteredId(null);
  }, []);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
    cancelAnimationFrame(animFrameRef.current);
  }, []);

  // ─── Pan handlers (touch) ───
  const touchStart = useRef({ x: 0, y: 0 });
  const touchOrigin = useRef({ x: 0, y: 0 });

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if ((e.target as SVGElement).closest('.spot-bubble')) return;
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
    touchOrigin.current = { x: transform.x, y: transform.y };
    hasMoved.current = false;
  }, [transform]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    const dx = t.clientX - touchStart.current.x;
    const dy = t.clientY - touchStart.current.y;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) hasMoved.current = true;
    setTransform((prev) => ({ ...prev, x: touchOrigin.current.x + dx, y: touchOrigin.current.y + dy }));
    setCenteredId(null);
  }, []);

  // ─── Zoom ───
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.92 : 1.08;
    setTransform((t) => ({ ...t, scale: Math.max(0.3, Math.min(8, t.scale * factor)) }));
  }, []);

  // ─── Compute center lat/lng from current viewport ───
  const centerCoords = useMemo(() => {
    if (projected.length === 0) return null;
    // Center of the viewport in screen coords
    const screenCX = viewW / 2;
    const screenCY = viewH / 2;
    // Inverse transform: world coord = (screen - translate) / scale
    const worldX = (screenCX - transform.x) / transform.scale;
    const worldY = (screenCY - transform.y) / transform.scale;

    // Need the projection parameters to inverse
    const lats = projected.map((s) => s.coords.lat), lngs = projected.map((s) => s.coords.lng);
    const mnLat = Math.min(...lats), mxLat = Math.max(...lats);
    const mnLng = Math.min(...lngs), mxLng = Math.max(...lngs);
    const latR = mxLat - mnLat || 1, lngR = mxLng - mnLng || 1;
    const w = Math.max(viewW, 600) - EDGE_PAD * 2;
    const h = Math.max(viewH, 400) - EDGE_PAD * 2;
    const aspect = w / h;
    const dataAspect = lngR / latR;
    let sX: number, sY: number;
    if (dataAspect > aspect) { sX = w; sY = w / dataAspect; }
    else { sY = h; sX = h * dataAspect; }

    // Inverse projection
    const lng = mnLng + ((worldX - EDGE_PAD) / sX) * lngR;
    const lat = mxLat - ((worldY - EDGE_PAD) / sY) * latR;
    return { lat, lng };
  }, [transform, viewW, viewH, projected]);

  // ─── Click spot: first click = center, second click = detail ───
  const handleSpotClick = useCallback((spot: NetSpot) => {
    if (hasMoved.current) return; // Don't trigger click after drag
    if (centeredId === spot.id) {
      setSelectedSpot(spot);
      setCenteredId(null);
    } else {
      setCenteredId(spot.id);
      // Animate to center the spot smoothly
      const targetScale = Math.max(transform.scale, 1.5);
      const targetX = viewW / 2 - spot.sx * targetScale;
      const targetY = viewH / 2 - spot.sy * targetScale;

      // Smooth animation using requestAnimationFrame
      const startT = { x: transform.x, y: transform.y, scale: transform.scale };
      const duration = 400;
      const startTime = performance.now();

      const animate = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // Ease out cubic
        const ease = 1 - Math.pow(1 - progress, 3);
        setTransform({
          x: startT.x + (targetX - startT.x) * ease,
          y: startT.y + (targetY - startT.y) * ease,
          scale: startT.scale + (targetScale - startT.scale) * ease,
        });
        if (progress < 1) requestAnimationFrame(animate);
      };
      requestAnimationFrame(animate);
    }
  }, [centeredId, transform, viewW, viewH, setSelectedSpot]);

  const resetView = useCallback(() => {
    const startT = { x: transform.x, y: transform.y, scale: transform.scale };
    const target = { x: 0, y: 0, scale: 1 };
    const duration = 300;
    const startTime = performance.now();
    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      setTransform({
        x: startT.x + (target.x - startT.x) * ease,
        y: startT.y + (target.y - startT.y) * ease,
        scale: startT.scale + (target.scale - startT.scale) * ease,
      });
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
    setCenteredId(null);
  }, [transform]);

  if (spots.length === 0) {
    return <div className="flex items-center justify-center h-full text-gray-400 text-sm">暂无景点数据，请先导入</div>;
  }

  if (projected.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center gap-4">
        <MapPin className="w-12 h-12 text-gray-300" />
        <div>
          <p className="text-gray-700 font-medium mb-1">暂无坐标数据</p>
          <p className="text-sm text-gray-400">请导入包含 location（经纬度）字段的景点 JSON</p>
        </div>
      </div>
    );
  }

  // Calculate zoom level in degrees per pixel (approximate)
  const zoomDegPerPx = centerCoords && projected.length > 0 ? (() => {
    const lats = projected.map((s) => s.coords.lat);
    const latRange = Math.max(...lats) - Math.min(...lats);
    const effectiveHeight = (Math.max(viewH, 400) - EDGE_PAD * 2) * transform.scale;
    return (latRange / effectiveHeight).toFixed(5);
  })() : null;

  return (
    <div className="relative w-full h-full bg-white rounded-xl overflow-hidden border border-gray-200/80">
      {/* SVG Container with edge fade */}
      <div
        ref={containerRef}
        className="w-full h-full"
        style={{
          maskImage: 'radial-gradient(ellipse at center, black 55%, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(ellipse at center, black 55%, transparent 100%)',
        }}
      >
        <svg
          ref={svgRef}
          width="100%" height="100%"
          className="select-none"
          style={{ touchAction: 'none', cursor: isDragging.current ? 'grabbing' : 'grab' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onWheel={handleWheel}
        >
          <g transform={`translate(${transform.x},${transform.y}) scale(${transform.scale})`}>
            {/* District connection lines — colored solid lines */}
            {districts.map((d) => {
              const lineColor = districtColorMap[d.name] || '#CBD5E1';
              const isActive = activeDistrict === d.name;
              return (
                <g key={d.name}>
                  {d.spots.map((s) => (
                    <line
                      key={s.id}
                      x1={s.sx} y1={s.sy} x2={d.cx} y2={d.cy}
                      stroke={lineColor}
                      strokeWidth={isActive ? 1.5 : 1}
                      opacity={isActive ? 0.8 : 0.45}
                    />
                  ))}
                  <circle cx={d.cx} cy={d.cy} r={isActive ? 4 : 3} fill={lineColor} opacity={isActive ? 0.7 : 0.4} />
                </g>
              );
            })}

            {/* Spot bubbles */}
            {finalSpots.map((spot) => {
              const isCentered = centeredId === spot.id;
              const isHovered = hoveredId === spot.id;
              const r = isCentered ? BUBBLE_R_MAJOR + 2 : isHovered ? BUBBLE_R_MAJOR : BUBBLE_R;
              const lineColor = districtColorMap[spot.district] || '#34D399';
              const heat = heatCounts[spot.id] || 0;
              const heatIntensity = showHeatmap && heat > 0 ? heat / maxHeat : 0;
              return (
                <g key={spot.id} className="spot-bubble" style={{ cursor: 'pointer' }}
                  onClick={(e) => { e.stopPropagation(); handleSpotClick(spot); }}
                  onMouseEnter={() => setHoveredId(spot.id)} onMouseLeave={() => setHoveredId(null)}>
                  <circle cx={spot.sx} cy={spot.sy} r={r + 4} fill="transparent" />
                  {/* ═══ 劝退热力图：红色光晕 ═══ */}
                  {heatIntensity > 0 && (
                    <circle cx={spot.sx} cy={spot.sy} r={r + 6 + heatIntensity * 8}
                      fill="#EF4444" opacity={heatIntensity * 0.4} style={{ pointerEvents: 'none' }} />
                  )}
                  <circle cx={spot.sx} cy={spot.sy} r={r}
                    fill={heatIntensity > 0 ? `rgba(239,68,68,${0.3 + heatIntensity * 0.5})` : (isCentered ? '#059669' : lineColor)}
                    opacity={heatIntensity > 0 ? 1 : (isCentered ? 0.9 : 0.75)}
                    stroke={heatIntensity > 0 ? '#DC2626' : (isCentered ? '#047857' : 'white')}
                    strokeWidth={isCentered ? 2 : 1.5} />
                  {/* 劝退记录数角标 */}
                  {heat > 0 && (
                    <g style={{ pointerEvents: 'none' }}>
                      <circle cx={spot.sx + r - 2} cy={spot.sy - r + 2} r={6} fill="#DC2626" stroke="white" strokeWidth={1.2} />
                      <text x={spot.sx + r - 2} y={spot.sy - r + 5} textAnchor="middle" fontSize="8" fill="white" fontWeight="bold">{heat}</text>
                    </g>
                  )}
                  {/* Label */}
                  <text x={spot.sx} y={spot.sy - r - 4} textAnchor="middle" fontSize="10"
                    fill={isCentered ? '#065F46' : '#374151'} fontWeight={isCentered ? 600 : 400}
                    style={{ pointerEvents: 'none' }}>
                    {spot.name.length > 6 ? spot.name.slice(0, 6) + '…' : spot.name}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {/* Top-right district label */}
      <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-sm rounded-lg px-3 py-1.5 shadow-sm border border-gray-100">
        <p className="text-xs text-gray-500">当前区域</p>
        <p className="text-sm font-semibold text-gray-800">{activeDistrict || '全部区域'}</p>
      </div>

      {/* Spot count */}
      <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm rounded-lg px-3 py-1.5 shadow-sm border border-gray-100">
        <p className="text-xs text-gray-400">
          {finalSpots.length} 个景点 · {districts.length} 个区域
        </p>
      </div>

      {/* Zoom controls */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-1">
        <Button variant="outline" size="icon" className="w-8 h-8 rounded-lg shadow-sm" onClick={() => setTransform((t) => ({ ...t, scale: Math.min(8, t.scale * 1.2) }))}>
          <ZoomIn className="w-4 h-4" />
        </Button>
        <Button variant="outline" size="icon" className="w-8 h-8 rounded-lg shadow-sm" onClick={() => setTransform((t) => ({ ...t, scale: Math.max(0.3, t.scale / 1.2) }))}>
          <ZoomOut className="w-4 h-4" />
        </Button>
        <Button variant="outline" size="icon" className="w-8 h-8 rounded-lg shadow-sm" onClick={resetView}>
          <Maximize2 className="w-4 h-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className={`w-8 h-8 rounded-lg shadow-sm ${showHeatmap ? 'bg-red-50 border-red-300' : ''}`}
          onClick={() => setShowHeatmap(v => !v)}
          title="切换劝退热力图"
        >
          <AlertTriangle className={`w-4 h-4 ${showHeatmap ? 'text-red-500' : 'text-gray-400'}`} />
        </Button>
      </div>

      {/* Bottom-left: zoom level + center coordinates */}
      <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-sm rounded-lg px-3 py-2 shadow-sm border border-gray-100 space-y-1">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-400">缩放</span>
          <span className="font-mono font-semibold text-gray-700">{transform.scale.toFixed(2)}x</span>
        </div>
        {centerCoords && (
          <div className="flex items-center gap-3 text-xs">
            <span className="text-gray-400">中心</span>
            <span className="font-mono text-gray-600">
              {centerCoords.lat.toFixed(4)}°N, {centerCoords.lng.toFixed(4)}°E
            </span>
          </div>
        )}
        {zoomDegPerPx && (
          <div className="text-[10px] text-gray-400">
            ~{zoomDegPerPx}°/px
          </div>
        )}
      </div>
    </div>
  );
}