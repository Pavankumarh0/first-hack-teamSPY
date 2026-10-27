import type { DeepLinkType } from './constants';

// One URL format for every QR code, kiosk link and share link:
//   <site>/campus/location/<id>     a room or facility
//   <site>/campus/building/<id>
//   <site>/campus/event/<id>
//   <site>/campus/club/<id>
//   <site>/campus/notice/<id>
//   <site>/campus/route?from=<placeId>&to=<placeId>
// The same path opens the matching screen in the mobile app (App Links /
// Universal Links) and a useful page on the website otherwise. The Flutter
// app parses it with lib/core/deep_links.dart.

export const DEEP_LINK_TYPES: DeepLinkType[] = ['location', 'building', 'event', 'club', 'notice', 'route'];
const ID = /^[A-Za-z0-9_-]{1,100}$/;

export interface CampusLink {
  type: DeepLinkType;
  id?: string;
  from?: string;
  to?: string;
}

export function isValidId(id: string | null | undefined): id is string {
  return typeof id === 'string' && ID.test(id);
}

export function campusPath(link: CampusLink): string {
  if (link.type === 'route') {
    const q = new URLSearchParams();
    if (link.from) q.set('from', link.from);
    if (link.to) q.set('to', link.to);
    const s = q.toString();
    return `/campus/route${s ? `?${s}` : ''}`;
  }
  if (!isValidId(link.id)) throw new Error(`Invalid ${link.type} id`);
  return `/campus/${link.type}/${link.id}`;
}

export function campusUrl(siteUrl: string, link: CampusLink): string {
  return siteUrl.replace(/\/+$/, '') + campusPath(link);
}

/** Parses a campus path (and query) into a link, or null if it is not one. */
export function parseCampusPath(pathname: string, search = ''): CampusLink | null {
  const parts = pathname.replace(/\/+$/, '').split('/').filter(Boolean);
  if (parts[0] !== 'campus' || parts.length < 2) return null;
  const type = parts[1] as DeepLinkType;
  if (!DEEP_LINK_TYPES.includes(type)) return null;
  if (type === 'route') {
    if (parts.length !== 2) return null;
    const q = new URLSearchParams(search);
    const from = q.get('from') ?? undefined;
    const to = q.get('to') ?? undefined;
    if ((from && !isValidId(from)) || !isValidId(to)) return null;
    return { type, from, to };
  }
  if (parts.length !== 3 || !isValidId(parts[2])) return null;
  return { type, id: parts[2] };
}

/** The custom-scheme form, used only by the "Open in the app" button. */
export function appSchemeUrl(link: CampusLink): string {
  return 'campusmithra:/' + campusPath(link);
}
