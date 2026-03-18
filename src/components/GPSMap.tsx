import {useRef, useEffect, useState, useMemo, useCallback} from 'preact/hooks';

interface FieldInfo {
    name: string;
    color: string;
    values: number[];
}

interface GPSMapProps {
    points: [number, number][];
    pointIndices: number[];
    fields: FieldInfo[];
}

function latToY(lat: number): number {
    const rad = (lat * Math.PI) / 180;
    return Math.log(Math.tan(Math.PI / 4 + rad / 2));
}

function yToLat(y: number): number {
    return ((2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180) / Math.PI;
}

function latLonToPixel(
    lat: number, lon: number,
    centerLat: number, centerLon: number,
    zoom: number, width: number, height: number
): [number, number] {
    const scale = Math.pow(2, zoom) * 256;
    const cx = ((centerLon + 180) / 360) * scale;
    const radC = (centerLat * Math.PI) / 180;
    const cy = ((1 - Math.log(Math.tan(radC) + 1 / Math.cos(radC)) / Math.PI) / 2) * scale;
    const px = ((lon + 180) / 360) * scale - cx + width / 2;
    const radLat = (lat * Math.PI) / 180;
    const py = ((1 - Math.log(Math.tan(radLat) + 1 / Math.cos(radLat)) / Math.PI) / 2) * scale - cy + height / 2;
    return [px, py];
}

const TILE_SIZE = 256;
const tileCache = new Map<string, HTMLImageElement>();

function loadTile(x: number, y: number, z: number): Promise<HTMLImageElement> {
    const key = `${z}/${x}/${y}`;
    const cached = tileCache.get(key);
    if (cached) return Promise.resolve(cached);
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => { tileCache.set(key, img); resolve(img); };
        img.onerror = reject;
        img.src = `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
    });
}

export function GPSMap({points, pointIndices, fields}: GPSMapProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [size, setSize] = useState({width: 600, height: 400});
    const [hover, setHover] = useState<{x: number; y: number; idx: number} | null>(null);
    const renderIdRef = useRef(0);

    const bounds = useMemo(() => {
        if (points.length === 0) return {centerLat: 0, centerLon: 0, zoom: 2};
        let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
        for (const [lat, lon] of points) {
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
            if (lon < minLon) minLon = lon;
            if (lon > maxLon) maxLon = lon;
        }
        const centerLat = (minLat + maxLat) / 2;
        const centerLon = (minLon + maxLon) / 2;
        let zoom = 18;
        for (let z = 18; z >= 1; z--) {
            const scale = Math.pow(2, z) * 256;
            const pxWidth = ((maxLon - minLon) / 360) * scale;
            const pxHeight = ((latToY(maxLat) - latToY(minLat)) / (2 * Math.PI)) * scale;
            if (pxWidth < size.width * 0.8 && pxHeight < size.height * 0.8) { zoom = z; break; }
        }
        return {centerLat, centerLon, zoom};
    }, [points, size]);

    const [view, setView] = useState(bounds);
    useEffect(() => setView(bounds), [bounds]);

    const pixelPoints = useMemo(() =>
        points.map(([lat, lon]) => latLonToPixel(lat, lon, view.centerLat, view.centerLon, view.zoom, size.width, size.height)),
    [points, view, size]);

    const speeds = useMemo(() => {
        const s: number[] = [0];
        for (let i = 1; i < points.length; i++) {
            const [lat1, lon1] = points[i - 1];
            const [lat2, lon2] = points[i];
            const dlat = lat2 - lat1;
            const dlon = (lon2 - lon1) * Math.cos(((lat1 + lat2) / 2 * Math.PI) / 180);
            s.push(Math.sqrt(dlat * dlat + dlon * dlon));
        }
        return s;
    }, [points]);

    // Drag
    const dragRef = useRef<{startX: number; startY: number; startLat: number; startLon: number; moved: boolean} | null>(null);

    const handleMouseDown = useCallback((e: MouseEvent) => {
        dragRef.current = {
            startX: e.clientX, startY: e.clientY,
            startLat: view.centerLat, startLon: view.centerLon,
            moved: false,
        };
    }, [view]);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!dragRef.current) return;
            const dx = e.clientX - dragRef.current.startX;
            const dy = e.clientY - dragRef.current.startY;
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragRef.current.moved = true;
            if (!dragRef.current.moved) return;
            const scale = Math.pow(2, view.zoom) * 256;
            const lonDelta = -(dx / scale) * 360;
            const yCenter = latToY(dragRef.current.startLat);
            const yDelta = (dy / scale) * 2 * Math.PI;
            setView(v => ({
                ...v,
                centerLat: yToLat(yCenter + yDelta),
                centerLon: dragRef.current!.startLon + lonDelta,
            }));
        };
        const handleMouseUp = () => { dragRef.current = null; };
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [view.zoom]);

    const handleWheel = useCallback((e: WheelEvent) => {
        e.preventDefault();
        const container = containerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        setView(v => {
            const oldZoom = v.zoom;
            const newZoom = Math.max(1, Math.min(19, oldZoom + (e.deltaY > 0 ? -1 : 1)));
            if (newZoom === oldZoom) return v;
            const oldScale = Math.pow(2, oldZoom) * 256;
            const newScale = Math.pow(2, newZoom) * 256;
            const worldCx = ((v.centerLon + 180) / 360) * oldScale;
            const radC = (v.centerLat * Math.PI) / 180;
            const worldCy = ((1 - Math.log(Math.tan(radC) + 1 / Math.cos(radC)) / Math.PI) / 2) * oldScale;
            const worldMx = worldCx + (mx - size.width / 2);
            const worldMy = worldCy + (my - size.height / 2);
            const newWorldCx = worldMx * (newScale / oldScale) - (mx - size.width / 2);
            const newWorldCy = worldMy * (newScale / oldScale) - (my - size.height / 2);
            const newLon = (newWorldCx / newScale) * 360 - 180;
            const newLat = yToLat((1 - (newWorldCy / newScale) * 2) * Math.PI);
            return {centerLat: newLat, centerLon: newLon, zoom: newZoom};
        });
    }, [size]);

    // Hover
    const handleHoverMove = useCallback((e: MouseEvent) => {
        if (dragRef.current?.moved) { setHover(null); return; }
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        let bestDist = 400;
        let bestIdx = -1;
        for (let i = 0; i < pixelPoints.length; i++) {
            const dx = pixelPoints[i][0] - mx;
            const dy = pixelPoints[i][1] - my;
            const d = dx * dx + dy * dy;
            if (d < bestDist) { bestDist = d; bestIdx = i; }
        }
        setHover(bestIdx >= 0 ? {x: e.clientX, y: e.clientY, idx: bestIdx} : null);
    }, [pixelPoints]);

    // Resize
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const ro = new ResizeObserver(entries => {
            const {width, height} = entries[0].contentRect;
            if (width > 0 && height > 0) setSize({width, height});
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // Render
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const {width, height} = size;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.scale(dpr, dpr);

        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        ctx.fillStyle = isDark ? '#18181b' : '#f4f4f5';
        ctx.fillRect(0, 0, width, height);

        const {centerLat, centerLon, zoom} = view;
        const mapScale = Math.pow(2, zoom) * TILE_SIZE;
        const worldCx = ((centerLon + 180) / 360) * mapScale;
        const radCenter = (centerLat * Math.PI) / 180;
        const worldCy = ((1 - Math.log(Math.tan(radCenter) + 1 / Math.cos(radCenter)) / Math.PI) / 2) * mapScale;

        const n = Math.pow(2, zoom);
        const tileXMin = Math.floor((worldCx - width / 2) / TILE_SIZE);
        const tileXMax = Math.floor((worldCx + width / 2) / TILE_SIZE);
        const tileYMin = Math.max(0, Math.floor((worldCy - height / 2) / TILE_SIZE));
        const tileYMax = Math.min(n - 1, Math.floor((worldCy + height / 2) / TILE_SIZE));

        const renderId = ++renderIdRef.current;
        const tilePromises: Promise<void>[] = [];

        for (let tx = tileXMin; tx <= tileXMax; tx++) {
            for (let ty = tileYMin; ty <= tileYMax; ty++) {
                const wrappedTx = ((tx % n) + n) % n;
                const px = tx * TILE_SIZE - worldCx + width / 2;
                const py = ty * TILE_SIZE - worldCy + height / 2;
                tilePromises.push(
                    loadTile(wrappedTx, ty, zoom).then(img => {
                        if (renderIdRef.current !== renderId) return;
                        ctx.drawImage(img, px, py, TILE_SIZE, TILE_SIZE);
                    }).catch(() => {})
                );
            }
        }

        Promise.all(tilePromises).then(() => {
            if (renderIdRef.current !== renderId) return;
            if (pixelPoints.length < 2) return;

            const maxSpeed = Math.max(...speeds.filter(s => s > 0)) || 1;

            // Path
            ctx.lineWidth = 4;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';

            for (let i = 1; i < pixelPoints.length; i++) {
                const [x1, y1] = pixelPoints[i - 1];
                const [x2, y2] = pixelPoints[i];
                if (Math.max(x1, x2) < -50 || Math.min(x1, x2) > width + 50 ||
                    Math.max(y1, y2) < -50 || Math.min(y1, y2) > height + 50) continue;

                const t = Math.min(speeds[i] / maxSpeed, 1);
                const r = t < 0.5 ? Math.round(t * 2 * 255) : 255;
                const g = t < 0.5 ? 255 : Math.round((1 - (t - 0.5) * 2) * 255);
                ctx.strokeStyle = `rgb(${r},${g},0)`;
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.stroke();
            }

            // Start (green)
            const [sx, sy] = pixelPoints[0];
            ctx.beginPath();
            ctx.arc(sx, sy, 6, 0, Math.PI * 2);
            ctx.fillStyle = '#22c55e';
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.stroke();

            // End (red)
            const [ex, ey] = pixelPoints[pixelPoints.length - 1];
            ctx.beginPath();
            ctx.arc(ex, ey, 6, 0, Math.PI * 2);
            ctx.fillStyle = '#ef4444';
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Hover marker (blue)
            if (hover && hover.idx >= 0 && hover.idx < pixelPoints.length) {
                const [hx, hy] = pixelPoints[hover.idx];
                ctx.beginPath();
                ctx.arc(hx, hy, 5, 0, Math.PI * 2);
                ctx.fillStyle = '#3b82f6';
                ctx.fill();
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 2;
                ctx.stroke();
            }

            // Attribution
            ctx.font = '10px system-ui, sans-serif';
            ctx.fillStyle = isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)';
            ctx.textAlign = 'right';
            ctx.fillText('\u00A9 OpenStreetMap contributors', width - 4, height - 4);
        });
    }, [view, size, pixelPoints, speeds, hover]);

    // Tooltip data
    const tooltipData = useMemo(() => {
        if (!hover || hover.idx < 0) return null;
        const dataIdx = pointIndices[hover.idx];
        return fields.map(f => ({
            name: f.name,
            color: f.color,
            value: f.values[dataIdx],
        }));
    }, [hover, pointIndices, fields]);

    return (
        <div ref={containerRef} class="w-full h-full relative cursor-grab active:cursor-grabbing select-none">
            <canvas
                ref={canvasRef}
                style={{width: '100%', height: '100%'}}
                onMouseDown={handleMouseDown}
                onMouseMove={handleHoverMove}
                onMouseLeave={() => setHover(null)}
                onWheel={handleWheel}
            />
            {tooltipData && hover && (
                <div
                    class="fixed z-50 pointer-events-none ml-4 mt-4 px-2 py-1.5 bg-zinc-100 dark:bg-zinc-800 border border-zinc-400 dark:border-zinc-600 rounded shadow-xl text-xs font-mono"
                    style={{left: hover.x, top: hover.y}}
                >
                    {tooltipData.map(f => (
                        <div key={f.name} style={{color: f.color}}>
                            {f.name}: {f.value?.toFixed(2) ?? 'N/A'}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
