import { auth, signOut } from "@/auth"
import { getDevices } from "@/lib/api"
import Link from "next/link"
import { format, formatDistanceToNow } from "date-fns"
import { es } from "date-fns/locale"

export default async function DashboardPage() {
    const session = await auth()
    const devices = await getDevices(session?.user?.email || undefined)

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
            {/* Header */}
            <header className="border-b border-slate-700 bg-slate-800/50 backdrop-blur-sm">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <img src="/app-icon.png" alt="LyrinEye Logo" className="w-10 h-10 rounded-xl shadow-lg border border-slate-700" />
                        <div>
                            <h1 className="text-2xl font-bold text-white">LyrinEye Admin</h1>
                            <p className="text-sm text-slate-400">{session?.user?.email}</p>
                        </div>
                    </div>
                    <form
                        action={async () => {
                            "use server"
                            await signOut({ redirectTo: "/" })
                        }}
                    >
                        <button
                            type="submit"
                            className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg transition-colors"
                        >
                            Cerrar Sesión
                        </button>
                    </form>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="mb-8">
                    <h2 className="text-xl font-semibold text-white mb-2">Dispositivos</h2>
                    <p className="text-slate-400">
                        {devices.length} dispositivo{devices.length !== 1 ? 's' : ''} registrado{devices.length !== 1 ? 's' : ''}
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {devices.map((device) => {
                        const lastSeenDate = new Date(device.lastSeen);
                        const diffMs = Date.now() - lastSeenDate.getTime();
                        const diffMin = diffMs / (1000 * 60);
                        const diffDay = diffMs / (1000 * 60 * 60 * 24);

                        let statusLabel = 'Offline';
                        let statusColor = 'bg-red-500/20 text-red-400';
                        let showMetrics = true;

                        if (diffMin < 1) {
                            statusLabel = 'En línea';
                            statusColor = 'bg-green-500/20 text-green-400';
                        } else if (diffDay < 1) {
                            statusLabel = 'Inactivo';
                            statusColor = 'bg-yellow-500/20 text-yellow-400';
                        } else {
                            statusLabel = 'Desconectado';
                            statusColor = 'bg-red-500/20 text-red-400';
                            showMetrics = false;
                        }

                        return (
                            <Link
                                key={device.id}
                                href={`/devices/${device.id}`}
                                className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6 hover:border-slate-600 transition-all duration-200 hover:scale-[1.02] flex flex-col gap-4"
                            >
                                {/* Status Badge */}
                                <div className="flex items-start gap-4">
                                    <img src="/app-icon.png" alt="Device Icon" className="w-12 h-12 rounded-xl border border-slate-700/50" />
                                    <div className="flex-1">
                                        <h3 className="text-lg font-semibold text-white line-clamp-1">{device.name}</h3>
                                        <p className="text-slate-500 text-xs font-normal">({device.id})</p>
                                        {device.appVersion && (
                                            <p className="text-[10px] text-slate-400 mt-0.5">{device.appVersion}</p>
                                        )}
                                        <div className="flex gap-2.5 mt-2">
                                            <span className={`px-3 py-0.5 rounded-full text-[10px] font-medium ${statusColor}`}>
                                                {statusLabel}
                                            </span>
                                            {device.mode && (
                                                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                                                    {device.mode.charAt(0).toUpperCase() + device.mode.slice(1)}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Metrics */}
                                {showMetrics ? (
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm text-slate-400">Batería</span>
                                            <div className="flex items-center gap-2">
                                                <div className="w-24 h-2 bg-slate-700 rounded-full overflow-hidden">
                                                    <div
                                                        className={`h-full ${device.battery > 0.5
                                                            ? 'bg-green-500'
                                                            : device.battery > 0.2
                                                                ? 'bg-yellow-500'
                                                                : 'bg-red-500'
                                                            }`}
                                                        style={{ width: `${device.battery * 100}%` }}
                                                    />
                                                </div>
                                                <span className="text-sm text-white w-12 text-right">
                                                    {Math.round(device.battery * 100)}%
                                                </span>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between">
                                            <span className="text-sm text-slate-400">CPU</span>
                                            <span className="text-sm text-white">{device.cpu?.toFixed(1)}%</span>
                                        </div>

                                        <div className="flex items-center justify-between">
                                            <span className="text-sm text-slate-400">RAM</span>
                                            <span className="text-sm text-white">{device.ram?.toFixed(0)} MB</span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center py-6 text-slate-500 italic text-xs">
                                        <p>Sin datos recientes</p>
                                    </div>
                                )}

                                {/* Last Seen */}
                                <div className="mt-4 pt-4 border-t border-slate-700">
                                    <p className="text-xs text-slate-400">
                                        Última actividad:{' '}
                                        {format(lastSeenDate, "d 'de' MMM, HH:mm:ss", {
                                            locale: es,
                                        })}
                                    </p>
                                </div>
                            </Link>
                        );
                    })}
                </div>

                {devices.length === 0 && (
                    <div className="text-center py-12">
                        <p className="text-slate-400">No hay dispositivos registrados</p>
                    </div>
                )}
            </main>
        </div>
    )
}

// Force refresh git tracking
