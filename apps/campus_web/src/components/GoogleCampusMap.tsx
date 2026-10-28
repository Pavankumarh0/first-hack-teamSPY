'use client';

import { useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { AdvancedMarker, APIProvider, APIProviderContext, Circle, Map, Polygon, Polyline, useMap, type MapMouseEvent } from '@vis.gl/react-google-maps';
import type { Building } from '@/lib/data';
import { publicEnv } from '@/lib/env';
import { rectToLatLngs, toLatLng, toPlan, type GeoRef, type LatLng, type PlanPoint } from '@/lib/geo';
import type { CampusMap } from '@/lib/navigation';

// The campus drawn over Google's satellite imagery: buildings, walkways, the
// route and the walker's own position. All campus data stays in plan
// coordinates (lib/geo.ts converts); Google only provides the backdrop.

export type GeoCampusMap = CampusMap & { geo: GeoRef };

const FILL: Record<string, string> = {
  academic: '#7d8dd6', administrative: '#f1bd3b', library: '#56b49c', food: '#ee7a22', hostel: '#ea8cc1',
  sports: '#9fd9a8', medical: '#f6a28f', event: '#c9b6f0', parking: '#d6c6ab', other: '#e7dac3',
};
const INK = '#1d1a16';

export interface GeoMarker { point: PlanPoint; tone: 'start' | 'end'; label: string }
export interface Me { lat: number; lng: number; accuracyM: number }

export function googleMapsReady(map: CampusMap | null | undefined): map is GeoCampusMap {
  return !!publicEnv.googleMapsKey && !!map?.geo;
}

/** Fits the camera to the campus once, when the map first loads. */
function FitCampus({ map, focus }: { map: GeoCampusMap; focus?: LatLng | null }) {
  const gmap = useMap();
  const done = useRef(false);
  useEffect(() => {
    if (!gmap || done.current) return;
    done.current = true;
    const corners = [toLatLng(map, { x: 0, y: 0 }), toLatLng(map, { x: map.width, y: map.height }),
      toLatLng(map, { x: map.width, y: 0 }), toLatLng(map, { x: 0, y: map.height })];
    const lats = corners.map((c) => c.lat), lngs = corners.map((c) => c.lng);
    gmap.fitBounds({ north: Math.max(...lats), south: Math.min(...lats), east: Math.max(...lngs), west: Math.min(...lngs) }, 24);
  }, [gmap, map]);
  useEffect(() => { if (gmap && focus) gmap.panTo(focus); }, [gmap, focus]);
  return null;
}

export function GoogleCampusMap({
  map, buildings, routePoints, markers = [], me, followMe = false, highlightBuildingIds = [], selectedId,
  onBuildingClick, onMapClick, editable = false, onBuildingMove, onNodeMove, onNodeClick, showNodes = false, className, children,
}: {
  map: GeoCampusMap;
  buildings: Building[];
  routePoints?: PlanPoint[] | null;
  markers?: GeoMarker[];
  me?: Me | null;
  followMe?: boolean;
  highlightBuildingIds?: string[];
  selectedId?: string | null;
  onBuildingClick?: (id: string) => void;
  onMapClick?: (p: PlanPoint) => void;
  editable?: boolean;
  onBuildingMove?: (id: string, center: PlanPoint) => void;
  onNodeMove?: (id: string, p: PlanPoint) => void;
  onNodeClick?: (id: string) => void;
  showNodes?: boolean;
  className?: string;
  /** Extra overlays (e.g. the placement anchor in the dashboard). */
  children?: ReactNode;
}) {
  const nodes = useMemo(() => new globalThis.Map(map.nodes.map((n) => [n.id, n])), [map.nodes]);
  const walkways = useMemo(() => map.edges.flatMap((e) => {
    const a = nodes.get(e.from), b = nodes.get(e.to);
    return a && b ? [{ e, path: [toLatLng(map, a), toLatLng(map, b)] }] : [];
  }), [map, nodes]);
  const route = useMemo(() => routePoints?.map((p) => toLatLng(map, p)) ?? null, [map, routePoints]);
  const fromMouse = (e: MapMouseEvent | google.maps.MapMouseEvent) => {
    const ll = 'detail' in e ? e.detail.latLng : e.latLng?.toJSON();
    return ll ? toPlan(map, ll) : null;
  };

  return (
    <div className={className ?? 'h-[460px] w-full'}>
      <MapsProvider>
        <Map
          mapId={publicEnv.googleMapsMapId}
          defaultCenter={{ lat: map.geo.lat, lng: map.geo.lng }}
          defaultZoom={17}
          mapTypeId="hybrid"
          tilt={0}
          gestureHandling="greedy"
          disableDefaultUI
          zoomControl
          mapTypeControl
          clickableIcons={false}
          onClick={onMapClick ? (e) => { const p = fromMouse(e); if (p) onMapClick(p); } : undefined}
          style={{ width: '100%', height: '100%' }}
        >
          <FitCampus map={map} focus={followMe && me ? { lat: me.lat, lng: me.lng } : null} />

          {walkways.map(({ e, path }) => (
            <Polyline key={e.id} path={path} strokeColor={e.accessible === false ? '#f6a28f' : '#f7f0e3'} strokeOpacity={0.9}
              strokeWeight={e.accessible === false ? 3 : 4} clickable={false} />
          ))}

          {buildings.map((b) => {
            const hi = highlightBuildingIds.includes(b.id) || selectedId === b.id;
            return (
              <Polygon key={b.id} paths={[rectToLatLngs(map, b)]} fillColor={FILL[b.category] ?? FILL.other} fillOpacity={hi ? 0.85 : 0.6}
                strokeColor={INK} strokeWeight={hi ? 4 : 2} clickable={!!onBuildingClick}
                onClick={onBuildingClick ? () => onBuildingClick(b.id) : undefined} />
            );
          })}
          {buildings.map((b) => (
            <AdvancedMarker key={`label-${b.id}`} position={toLatLng(map, { x: b.x + b.w / 2, y: b.y + b.h / 2 })}
              title={b.name} draggable={editable} clickable={!!onBuildingClick || editable}
              onClick={onBuildingClick ? () => onBuildingClick(b.id) : undefined}
              onDragEnd={editable && onBuildingMove ? (e) => { const p = fromMouse(e); if (p) onBuildingMove(b.id, p); } : undefined}
              anchorLeft="-50%" anchorTop="-50%">
              <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, border: `2px solid ${INK}`,
                background: selectedId === b.id ? '#f1bd3b' : '#f7f0e3', color: INK, font: '800 11px/1.3 var(--font-body), sans-serif',
                textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap', cursor: editable ? 'grab' : 'pointer' }}>
                {b.code || b.name}
              </span>
            </AdvancedMarker>
          ))}

          {showNodes && map.nodes.map((n) => (
            <AdvancedMarker key={n.id} position={toLatLng(map, n)} title={n.label} draggable={editable}
              onClick={onNodeClick ? () => onNodeClick(n.id) : undefined}
              onDragEnd={editable && onNodeMove ? (e) => { const p = fromMouse(e); if (p) onNodeMove(n.id, p); } : undefined}
              anchorLeft="-50%" anchorTop="-50%">
              <span style={{ display: 'block', width: 14, height: 14, borderRadius: 999, border: `2.5px solid ${INK}`,
                background: selectedId === n.id ? '#ee7a22' : n.buildingId ? '#56b49c' : '#f7f0e3' }} />
            </AdvancedMarker>
          ))}

          {route && route.length > 1 && (
            <>
              <Polyline path={route} strokeColor={INK} strokeWeight={10} strokeOpacity={1} clickable={false} zIndex={5} />
              <Polyline path={route} strokeColor="#f1bd3b" strokeWeight={6} strokeOpacity={1} clickable={false} zIndex={6} />
            </>
          )}

          {markers.map((m) => (
            <AdvancedMarker key={`${m.tone}-${m.point.x}-${m.point.y}`} position={toLatLng(map, m.point)} title={m.label} zIndex={10}>
              <span style={{ display: 'grid', placeItems: 'center', width: 30, height: 30, borderRadius: '50% 50% 50% 0', transform: 'rotate(-45deg)',
                border: `3px solid ${INK}`, background: m.tone === 'end' ? '#d9472b' : '#f1bd3b' }}>
                <span style={{ width: 10, height: 10, borderRadius: 999, background: '#f7f0e3', border: `2px solid ${INK}` }} />
              </span>
            </AdvancedMarker>
          ))}

          {me && (
            <>
              <Circle center={{ lat: me.lat, lng: me.lng }} radius={me.accuracyM} fillColor="#4285f4" fillOpacity={0.15}
                strokeColor="#4285f4" strokeOpacity={0.5} strokeWeight={1} clickable={false} />
              <AdvancedMarker position={{ lat: me.lat, lng: me.lng }} title="You are here" zIndex={20} anchorLeft="-50%" anchorTop="-50%">
                <span aria-label="You are here" style={{ display: 'block', width: 20, height: 20, borderRadius: 999, background: '#4285f4',
                  border: '3px solid #fff', boxShadow: '0 0 0 2px rgba(29,26,22,.6)' }} />
              </AdvancedMarker>
            </>
          )}
          {children}
        </Map>
      </MapsProvider>
    </div>
  );
}

/** Loads the Maps JavaScript API once; reuses a provider higher up if there is one. */
export function MapsProvider({ children }: { children: ReactNode }) {
  const outer = useContext(APIProviderContext);
  if (outer) return <>{children}</>;
  return <APIProvider apiKey={publicEnv.googleMapsKey}>{children}</APIProvider>;
}
