export type AdbCommand = 'start' | 'stop' | 'toggle';

export interface ParsedAdbCommand {
    action: AdbCommand;
    commandId: string;
}

/** Supported deep links:
 *  - lyrineye://adb/record (legacy => start)
 *  - lyrineye://adb/start
 *  - lyrineye://adb/stop
 *  - lyrineye://adb/toggle
 *  - lyrineye://adb/record?cmd=start|stop|toggle&id=123
 *  - lyrineye://adb/record?command=start|stop|toggle&id=123
 */
export function parseAdbCommandFromUrl(url: string | null | undefined): ParsedAdbCommand | null {
    if (!url) return null;
    const decoded = decodeURIComponent(url);
    const u = decoded.toLowerCase();

    let action: AdbCommand | null = null;
    if (u.includes('cmd=stop') || u.includes('command=stop') || u.includes('adb/stop')) action = 'stop';
    else if (u.includes('cmd=toggle') || u.includes('command=toggle') || u.includes('adb/toggle')) action = 'toggle';
    else if (u.includes('cmd=start') || u.includes('command=start') || u.includes('adb/start') || u.includes('adb/record')) action = 'start';

    if (!action) return null;

    const idMatch = decoded.match(/[?&](?:id|commandId)=([^&#]+)/i);
    const commandId = idMatch?.[1] || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    return { action, commandId };
}

/** Backward compatibility helper. */
export function isAdbRecordDeepLink(url: string | null | undefined): boolean {
    const parsed = parseAdbCommandFromUrl(url);
    return parsed?.action === 'start';
}
