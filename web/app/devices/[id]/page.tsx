import { auth } from "@/auth"
import { getDeviceDetails } from "@/lib/api"
import { notFound } from "next/navigation"
import Link from "next/link"
import { formatDistanceToNow } from "date-fns"
import { es } from "date-fns/locale"

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
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-2xl font-bold text-white">{device.name}</h1>
                            <p className="text-sm text-slate-400">{device.appVersion}</p>
                        </div>
                        <span
                            className={`px-4 py-2 rounded-full text-sm font-medium ${device.status === 'online'
                                    ? 'bg-green-500/20 text-green-400'
                                    : 'bg-red-500/20 text-red-400'
                                }`}
                        >
                            {device.status === 'online' ? 'En línea' : 'Desconectado'}
                        </span>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Device Info */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* Metrics Cards */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6">
                                <div className="flex items-center justify-between mb-2">
                                    <h3 className="text-sm text-slate-400">Batería</h3>
                                    {device.isCharging && (
                                        <svg className="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                                            <path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1h4v1a2 2 0 11-4 0zM12 14c.015-.34.208-.646.477-.859a4 4 0 10-4.954 0c.27.213.462.519.476.859h4.002z" />
                                        </svg>
                                    )}
                                </div>
                                <div className="text-3xl font-bold text-white">{Math.round(device.battery * 100)}%</div>
                            </div>

                            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6">
                                <h3 className="text-sm text-slate-400 mb-2">CPU</h3>
                                <div className="text-3xl font-bold text-white">{device.cpu?.toFixed(1)}%</div>
                            </div>

                            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6">
                                <h3 className="text-sm text-slate-400 mb-2">RAM</h3>
                                <div className="text-3xl font-bold text-white">{device.ram?.toFixed(0)} MB</div>
                            </div>

                            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6">
                                <h3 className="text-sm text-slate-400 mb-2">Android</h3>
                                <div className="text-3xl font-bold text-white">{device.androidVersion}</div>
                            </div>
                        </div>

                        {/* Remote Commands */}
                        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6">
                            <h3 className="text-lg font-semibold text-white mb-4">Control Remoto</h3>
                            <div className="space-y-3">
                                <button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition-colors">
                                    📤 Solicitar Logcat
                                </button>
                                <p className="text-xs text-slate-400">
                                    Envía una notificación push al dispositivo para capturar y enviar los últimos 500 logs del sistema
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Sidebar */}
                    <div className="space-y-6">
                        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6">
                            <h3 className="text-lg font-semibold text-white mb-4">Información</h3>
                            <dl className="space-y-3">
                                <div>
                                    <dt className="text-sm text-slate-400">WiFi</dt>
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
                                        {formatDistanceToNow(new Date(device.lastSeen), {
                                            addSuffix: true,
                                            locale: es,
                                        })}
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
