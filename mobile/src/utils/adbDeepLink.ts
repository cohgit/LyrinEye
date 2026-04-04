/** Deep link / intent data: lyrineye://adb/record */
export function isAdbRecordDeepLink(url: string | null | undefined): boolean {
    if (!url) return false;
    const u = decodeURIComponent(url).toLowerCase();
    return u.includes('lyrineye://adb/record') || u.includes('adb/record');
}
