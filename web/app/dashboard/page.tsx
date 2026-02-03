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
                    <div>
                        <h1 className="text-2xl font-bold text-white">LyrinEye Admin</h1>
                        <p className="text-sm text-slate-400">{session?.user?.email}</p>
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
                    {devices.map((device) => (
                        <Link
                            key={device.id}
                            href={`/devices/${device.id}`}
                            className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6 hover:border-slate-600 transition-all duration-200 hover:scale-[1.02]"
                        >
                            {/* Status Badge */}
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-semibold text-white">{device.name}</h3>
                                <span
                                    className={`px-3 py-1 rounded-full text-xs font-medium ${device.status === 'online'
                                        ? 'bg-green-500/20 text-green-400'
                                        : 'bg-red-500/20 text-red-400'
                                        }`}
                                >
                                    {device.status === 'online' ? 'En línea' : 'Desconectado'}
                                </span>
                            </div>

                            {/* Metrics */}
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

                            {/* Last Seen */}
                            <div className="mt-4 pt-4 border-t border-slate-700">
                                <p className="text-xs text-slate-400">
                                    Última actividad:{' '}
                                    {format(new Date(device.lastSeen), "d 'de' MMM, HH:mm:ss", {
                                        locale: es,
                                    })}
                                </p>
                            </div>
                        </Link>
                    ))}
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
