'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Download } from 'lucide-react';

/** A QR code for a public URL, with PNG and SVG downloads for printing. */
export function QrCode({ value, size = 220, fileName = 'campus-qr', downloads = false }: {
  value: string; size?: number; fileName?: string; downloads?: boolean;
}) {
  const [png, setPng] = useState<string | null>(null);
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const opts = { errorCorrectionLevel: 'M' as const, margin: 2, color: { dark: '#0b1020', light: '#ffffff' } };
    QRCode.toDataURL(value, { ...opts, width: Math.max(size, 600) }).then((u) => live && setPng(u));
    if (downloads) QRCode.toString(value, { ...opts, type: 'svg' }).then((s) => live && setSvg(s));
    return () => { live = false; };
  }, [value, size, downloads]);

  return (
    <div className="inline-flex flex-col items-center gap-3">
      {png ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={png} width={size} height={size} alt={`QR code for ${value}`} className="rounded-lg border border-slate-200 bg-white" />
      ) : (
        <div className="skeleton" style={{ width: size, height: size }} />
      )}
      {downloads && png && (
        <div className="flex gap-2">
          <a href={png} download={`${fileName}.png`} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50">
            <Download className="h-4 w-4" /> PNG
          </a>
          {svg && (
            <a href={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`} download={`${fileName}.svg`}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50">
              <Download className="h-4 w-4" /> SVG
            </a>
          )}
        </div>
      )}
    </div>
  );
}
