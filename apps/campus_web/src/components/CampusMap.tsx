'use client';

import { useRef, type MouseEvent } from 'react';
import type { CampusMap as MapData, Route } from '@/lib/navigation';
import type { Building } from '@/lib/data';

const FILL: Record<string, string> = {
  academic: '#dbeafe',
  administrative: '#ede9fe',
  library: '#d1fae5',
  food: '#ffedd5',
  hostel: '#fce7f3',
  sports: '#dcfce7',
  medical: '#fee2e2',
  event: '#fef3c7',
  parking: '#e2e8f0',
  other: '#f1f5f9',
};
const STROKE: Record<string, string> = {
  academic: '#3b82f6', administrative: '#8b5cf6', library: '#10b981', food: '#f97316', hostel: '#ec4899',
  sports: '#22c55e', medical: '#ef4444', event: '#f59e0b', parking: '#64748b', other: '#94a3b8',
};

export interface MapMarker {
  nodeId: string;
  label: string;
  tone: 'start' | 'end' | 'here';
}

/**
 * The campus as SVG: buildings, walkways and an optional route. Used by the
 * public map, destination pages and the admin map editor.
 */
export function CampusMap({
  map, buildings, route, markers = [], highlightBuildingIds = [], showNodes, selectedNodeIds = [],
  onNodeClick, onBuildingClick, onCanvasClick, className, title = 'Campus map',
}: {
  map: MapData;
  buildings: Building[];
  route?: Route | null;
  markers?: MapMarker[];
  highlightBuildingIds?: string[];
  showNodes?: boolean;
  selectedNodeIds?: string[];
  onNodeClick?: (nodeId: string) => void;
  onBuildingClick?: (buildingId: string) => void;
  onCanvasClick?: (x: number, y: number) => void;
  className?: string;
  title?: string;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const nodes = new Map(map.nodes.map((n) => [n.id, n]));
  const routeEdges = new Set(route?.edgeIds ?? []);

  function canvasClick(e: MouseEvent<SVGSVGElement>) {
    if (!onCanvasClick || !svg.current) return;
    const pt = svg.current.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(svg.current.getScreenCTM()!.inverse());
    onCanvasClick(Math.round(p.x), Math.round(p.y));
  }

  return (
    <svg ref={svg} viewBox={`0 0 ${map.width} ${map.height}`} role="img" aria-label={title}
      className={className ?? 'h-auto w-full'} onClick={canvasClick}>
      <title>{title}</title>
      <rect width={map.width} height={map.height} fill="#eef5ec" rx="16" />
      {map.backgroundUrl && <image href={map.backgroundUrl} width={map.width} height={map.height} preserveAspectRatio="xMidYMid slice" opacity="0.9" />}

      {/* walkways */}
      {map.edges.map((e) => {
        const a = nodes.get(e.from);
        const b = nodes.get(e.to);
        if (!a || !b) return null;
        return (
          <line key={e.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
            stroke={routeEdges.has(e.id) ? '#0c867b' : '#cbd5e1'}
            strokeWidth={routeEdges.has(e.id) ? 9 : 7} strokeLinecap="round"
            strokeDasharray={e.accessible === false ? '3 9' : undefined}>
            <title>{e.accessible === false ? `Path with steps${e.note ? ` (${e.note})` : ''}` : e.note ?? 'Walkway'}</title>
          </line>
        );
      })}

      {/* buildings */}
      {buildings.map((b) => {
        const hi = highlightBuildingIds.includes(b.id);
        return (
          <g key={b.id} onClick={onBuildingClick ? (ev) => { ev.stopPropagation(); onBuildingClick(b.id); } : undefined}
            className={onBuildingClick ? 'cursor-pointer' : undefined}>
            <rect x={b.x} y={b.y} width={b.w} height={b.h} rx="8"
              fill={FILL[b.category] ?? FILL.other} stroke={hi ? '#f08a24' : STROKE[b.category] ?? STROKE.other}
              strokeWidth={hi ? 5 : 2} />
            <text x={b.x + b.w / 2} y={b.y + b.h / 2 - 3} textAnchor="middle" fontSize="15" fontWeight="700" fill="#0f172a">{b.code}</text>
            <text x={b.x + b.w / 2} y={b.y + b.h / 2 + 14} textAnchor="middle" fontSize="10" fill="#334155">
              {b.name.length > 22 ? `${b.name.slice(0, 20)}...` : b.name}
            </text>
            <title>{b.name}</title>
          </g>
        );
      })}

      {/* route */}
      {route && route.nodeIds.length > 1 && (
        <polyline points={route.nodeIds.map((id) => `${nodes.get(id)!.x},${nodes.get(id)!.y}`).join(' ')}
          fill="none" stroke="#0f9b8e" strokeWidth="5" strokeLinejoin="round" strokeLinecap="round" />
      )}

      {/* nodes (editor) */}
      {showNodes && map.nodes.map((n) => (
        <g key={n.id} onClick={onNodeClick ? (ev) => { ev.stopPropagation(); onNodeClick(n.id); } : undefined}
          className={onNodeClick ? 'cursor-pointer' : undefined}>
          <circle cx={n.x} cy={n.y} r={selectedNodeIds.includes(n.id) ? 10 : 7}
            fill={selectedNodeIds.includes(n.id) ? '#f08a24' : n.buildingId ? '#0f9b8e' : '#475569'} stroke="#fff" strokeWidth="2" />
          <title>{n.label}</title>
        </g>
      ))}

      {/* markers */}
      {markers.map((m) => {
        const n = nodes.get(m.nodeId);
        if (!n) return null;
        const color = m.tone === 'end' ? '#f08a24' : m.tone === 'start' ? '#0b1020' : '#0f9b8e';
        return (
          <g key={`${m.tone}-${m.nodeId}`} transform={`translate(${n.x} ${n.y})`}>
            <path d="M0 0 C -10 -14 -14 -20 -14 -27 A 14 14 0 1 1 14 -27 C 14 -20 10 -14 0 0 Z" fill={color} stroke="#fff" strokeWidth="2" />
            <circle cy="-27" r="5" fill="#fff" />
            <title>{m.label}</title>
          </g>
        );
      })}
    </svg>
  );
}

export function MapLegend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
      <span className="flex items-center gap-1.5"><span className="h-1.5 w-6 rounded bg-slate-300" /> Walkway</span>
      <span className="flex items-center gap-1.5"><span className="h-1.5 w-6 rounded border-t-2 border-dotted border-slate-400" /> Path with steps</span>
      <span className="flex items-center gap-1.5"><span className="h-1.5 w-6 rounded bg-brand-500" /> Your route</span>
      <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-navy-900" /> Start</span>
      <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-saffron-500" /> Destination</span>
    </div>
  );
}
