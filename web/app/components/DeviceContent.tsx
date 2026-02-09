"use client"

import { useState } from "react"
import { DeviceDetail } from "@/types/device" // Assume this type exists or use any
import DeviceCharts from "./DeviceCharts"
import DeviceViews from "./DeviceViews"
import { BatteryCharging, Radio } from "lucide-react"

interface DeviceContentProps {
    deviceId: string
    device: any // Using any to avoid type import issues for now, or match PageProps
    userEmail?: string
}

export default function DeviceContent({ deviceId, device, userEmail }: DeviceContentProps) {
    const [activeTab, setActiveTab] = useState<'charts' | 'history'>('charts')

    // Determine status for metrics availability
    const lastSeenDate = new Date(device.lastSeen);
    const diffMs = Date.now() - lastSeenDate.getTime();
    const diffDay = diffMs / (1000 * 60 * 60 * 24);
    const showMetrics = diffDay < 1;

    return (
        <div className="space-y-6">
            {/* Tabs */}
            <div className="flex space-x-1 bg-slate-800/50 p-1 rounded-xl w-fit border border-slate-700">
                <button
                    onClick={() => setActiveTab('charts')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'charts'
                            ? 'bg-slate-700 text-white shadow'
                            : 'text-slate-400 hover:text-white hover:bg-slate-800'
                        }`}
                >
                    Gráficos
                </button>
                <button
                    onClick={() => setActiveTab('history')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'history'
                            ? 'bg-slate-700 text-white shadow'
                            : 'text-slate-400 hover:text-white hover:bg-slate-800'
                        }`}
                >
                    Historial
                </button>
            </div>

            {/* Content */}
            {activeTab === 'charts' ? (
                <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6">
                    <DeviceCharts deviceId={deviceId} />
                </div>
            ) : (
                <div className="space-y-6">
                    {/* Metrics Cards */}
                    {showMetrics ? (
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
                                <div className="text-lg font-bold text-white">
                                    {device.ramUsed ? `${(device.ramUsed / 1024).toFixed(1)}GB / ` : ''}
                                    {(device.ram / 1024).toFixed(1)} GB
                                </div>
                            </div>

                            <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-4">
                                <h3 className="text-xs text-slate-400 mb-2">Almacenamiento</h3>
                                <div className="text-2xl font-bold text-white">
                                    {device.storageFree ? `${(device.storageFree / 1024).toFixed(1)} GB` : 'N/A'}
                                </div>
                                <div className="text-[10px] text-slate-500">Libre</div>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 rounded-xl p-8 flex flex-col items-center justify-center text-slate-500 gap-2">
                            <div className="p-3 bg-slate-800 rounded-full">
                                <Radio className="w-6 h-6 opacity-20" />
                            </div>
                            <p className="text-sm italic text-center">Sin telemetría reciente disponible</p>
                            <p className="text-[10px] uppercase tracking-widest opacity-50 text-center">El dispositivo lleva más de 24h sin conexión</p>
                        </div>
                    )}

                    {/* Views (Live / History) */}
                    <DeviceViews deviceId={deviceId} isLiveEnabled={showMetrics} userEmail={userEmail} />
                </div>
            )}
        </div>
    )
}
