import { auth } from "@/auth"
import { getDeviceDetails } from "@/lib/api"
import { notFound } from "next/navigation"
import Link from "next/link"
import { formatDistanceToNow } from "date-fns"
import { es } from "date-fns/locale"
import DeviceViews from "@/app/components/DeviceViews"
import DeviceActions from "@/app/components/DeviceActions"
import TimeDisplay from "@/app/components/TimeDisplay"
import { Wifi, Radio, BatteryCharging } from "lucide-react"

export default async function DevicePage({ params }: { params: Promise<{ id: string }> }) {
    const session = await auth()
    const { id } = await params

    const device = await getDeviceDetails(id)

    if (!device) {
        notFound()
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
                        <div>
                            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                                {device.name}
                                {device.isTransmitting && (
                                    <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-400 text-xs border border-indigo-500/30 animate-pulse">
                                        <Radio className="w-3 h-3" />
                                        Transmitiendo
                                    </span>
                                )}
                            </h1>
                            <p className="text-sm text-slate-400">{device.appVersion}</p>
                        </div>
                        <div className="flex items-center gap-4">
                            <DeviceActions deviceId={id} />
                            <span
                                className={`px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2 ${device.status === 'online'
                                    ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                                    : 'bg-red-500/20 text-red-400 border border-red-500/30'
                                    }`}
                            >
                                <div className={`w-2 h-2 rounded-full ${device.status === 'online' ? 'bg-green-400' : 'bg-red-400'}`}></div>
                                {device.status === 'online' ? 'En línea' : 'Desconectado'}
                            </span>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Device Info */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* Metrics Cards */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-4">
                                <div className="flex items-center justify-between mb-2">
                                    <h3 className="text-xs text-slate-400">Batería</h3>
                                    {device.isCharging && (
                                        <BatteryCharging className="w-4 h-4 text-yellow-500 animate-pulse" />
                                    )}
                                </div>
                                <div className="text-2xl font-bold text-white">{Math.round(device.battery * 100)}%</div>
                            </div>

                            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-4">
                                <h3 className="text-xs text-slate-400 mb-2">CPU</h3>
                                <div className="text-2xl font-bold text-white">{device.cpu?.toFixed(1)}%</div>
                            </div>

                            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-4">
                                <h3 className="text-xs text-slate-400 mb-2">RAM</h3>
                                <div className="text-2xl font-bold text-white">{device.ram?.toFixed(0)} MB</div>
                            </div>

                            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-4">
                                <h3 className="text-xs text-slate-400 mb-2">Android</h3>
                                <div className="text-2xl font-bold text-white">v{device.androidVersion}</div>
                            </div>
                        </div>

                        {/* Views (Live / History) */}
                        <DeviceViews deviceId={id} />
                    </div>

                    {/* Sidebar */}
                    <div className="space-y-6">
                        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6">
                            <h3 className="text-lg font-semibold text-white mb-4">Información</h3>
                            <dl className="space-y-4">
                                <div>
                                    <dt className="text-sm text-slate-400 flex items-center gap-2">
                                        <Wifi className="w-4 h-4" /> WiFi
                                    </dt>
                                    <dd className="text-sm text-white mt-1">{device.wifiSSID}</dd>
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
