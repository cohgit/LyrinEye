'use client'

import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

interface TimeDisplayProps {
    date: string
    formatStr?: string
}

export default function TimeDisplay({ date, formatStr = "d 'de' MMM, HH:mm:ss" }: TimeDisplayProps) {
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

    if (!mounted) {
        return <span className="animate-pulse">Cargando...</span>
    }

    try {
        const d = new Date(date)
        return (
            <span title={d.toLocaleString()}>
                {format(d, formatStr, { locale: es })}
            </span>
        )
    } catch (e) {
        return <span>{date}</span>
    }
}
