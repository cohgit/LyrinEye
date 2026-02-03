'use client';

import { useEffect } from 'react';
import { azureLogger } from '@/lib/logger';

export default function LoggerInitializer() {
    useEffect(() => {
        azureLogger.init();
    }, []);

    return null;
}
