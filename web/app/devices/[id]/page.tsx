import { auth } from "@/auth"
import { getDeviceDetails } from "@/lib/api"
import { notFound } from "next/navigation"
import Link from "next/link"
import { formatDistanceToNow } from "date-fns"
import { es } from "date-fns/locale"
import DeviceViews from "@/app/components/DeviceViews"
import DeviceActions from "@/app/components/DeviceActions"
import DeviceContent from "@/app/components/DeviceContent"
import TimeDisplay from "@/app/components/TimeDisplay"
import { Wifi, Radio, BatteryCharging } from "lucide-react"

export default async function DevicePage({ params }: { params: Promise<{ id: string }> }) {
    const session = await auth()
    const { id } = await params

    const device = await getDeviceDetails(id)

    if (!device) {
        notFound()
    }

    const lastSeenDate = new Date(device.lastSeen);
    const diffMs = Date.now() - lastSeenDate.getTime();
    const diffMin = diffMs / (1000 * 60);
    const diffDay = diffMs / (1000 * 60 * 60 * 24);

    let statusLabel = 'Desconectado';
    let statusColor = 'bg-red-500/20 text-red-400 border-red-500/30';
    let statusDot = 'bg-red-400';
    let showMetrics = true;

    if (diffMin < 1) {
        statusLabel = 'En línea';
        statusColor = 'bg-green-500/20 text-green-400 border-green-500/30';
        statusDot = 'bg-green-400';
    } else if (diffDay < 1) {
        statusLabel = 'Inactivo';
        statusColor = 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
        statusDot = 'bg-yellow-400';
    } else {
        statusLabel = 'Desconectado';
        statusColor = 'bg-red-500/20 text-red-400 border-red-500/30';
        statusDot = 'bg-red-400';
        showMetrics = false;
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
            {/* Header */}
            <header className="border-b border-slate-700 bg-slate-800/50 backdrop-blur-sm">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <Link
                        href="/dashboard"
                        className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-4"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                        Volver al Dashboard
                    </Link>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <img src="/app-icon.png" alt="Device Icon" className="w-14 h-14 rounded-2xl shadow-xl border border-slate-700" />
                            <div>
                                <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                                    {device.name}
                                    <span className="text-slate-500 text-lg font-normal">({device.id})</span>
                                    {(device.isTransmitting || device.streaming) && (
                                        <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-400 text-xs border border-indigo-500/30 animate-pulse">
                                            <Radio className="w-3 h-3" />
                                            Transmitiendo
                                        </span>
                                    )}
                                </h1>
                                <p className="text-sm text-slate-400">{device.appVersion}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            <DeviceActions deviceId={id} isEnabled={showMetrics} />
                            <span
                                className={`px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2 ${statusColor}`}
                            >
                                <div className={`w-2 h-2 rounded-full ${statusDot}`}></div>
                                {statusLabel}
                            </span>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Device Info */}
                    {/* Device Info (Tabs: Charts | History) */}
                    <div className="lg:col-span-2">
                        <DeviceContent
                            deviceId={id}
                            device={device}
                            userEmail={session?.user?.email || undefined}
                        />
                    </div>

                    {/* Sidebar */}
                    <div className="space-y-6">
                        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6">
                            <h3 className="text-lg font-semibold text-white mb-4">Información del Dispositivo</h3>
                            <dl className="space-y-4">
                                <div>
                                    <dt className="text-sm text-slate-400">ID del Dispositivo</dt>
                                    <dd className="text-sm text-white mt-1 break-all font-mono bg-slate-900/50 p-1 rounded">{id}</dd>
                                </div>
                                <div>
                                    <dt className="text-sm text-slate-400 flex items-center gap-2">
                                        <Wifi className="w-4 h-4" /> Red WiFi
                                    </dt>
                                    <dd className="text-sm text-white mt-1">{device.wifiSSID || 'No disponible'}</dd>
                                </div>
                                <div>
                                    <dt className="text-sm text-slate-400">Dirección IP</dt>
                                    <dd className="text-sm text-white mt-1 font-mono">{device.ipAddress || 'Desconocida'}</dd>
                                </div>
                                <div>
                                    <dt className="text-sm text-slate-400">Versión Android</dt>
                                    <dd className="text-sm text-white mt-1">v{device.androidVersion}</dd>
                                </div>
                                <div>
                                    <dt className="text-sm text-slate-400">Versión App</dt>
                                    <dd className="text-sm text-white mt-1">{device.appVersion}</dd>
                                </div>
                                <div>
                                    <dt className="text-sm text-slate-400">Modo de Operación</dt>
                                    <dd className="text-sm text-white mt-1">
                                        {device.mode ? (
                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 capitalize">
                                                {device.mode}
                                            </span>
                                        ) : 'Desconocido'}
                                    </dd>
                                </div>
                                <div>
                                    <dt className="text-sm text-slate-400">Estado Batería</dt>
                                    <dd className="text-sm text-white mt-1 capitalize">
                                        {device.batteryStatus || 'Desconocido'}
                                        {device.lowPowerMode && <span className="ml-2 text-xs text-yellow-500">(Ahorro activado)</span>}
                                    </dd>
                                </div>
                                <div>
                                    <dt className="text-sm text-slate-400">Estado de Conexión</dt>
                                    <dd className="text-sm text-white mt-1">
                                        {device.telemetry?.ConnectionStart ? (
                                            <span className="text-green-400 flex items-center gap-1">
                                                <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></div>
                                                Conectado
                                            </span>
                                        ) : 'Desconectado'}
                                    </dd>
                                </div>
                                {device.location && (
                                    <div>
                                        <dt className="text-sm text-slate-400">Ubicación</dt>
                                        <dd className="text-sm text-white mt-1">
                                            {device.location.latitude.toFixed(6)}, {device.location.longitude.toFixed(6)}
                                        </dd>
                                    </div>
                                )}
                                <div>
                                    <dt className="text-sm text-slate-400">Última actividad</dt>
                                    <dd className="text-sm text-white mt-1">
                                        <TimeDisplay date={device.lastSeen} />
                                    </dd>
                                </div>
                            </dl>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    )
}
