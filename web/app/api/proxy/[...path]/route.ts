import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';

const BACKEND_API_URL = process.env.BACKEND_API_URL || 'http://localhost:8080';

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ path: string[] }> }
) {
    const session = await auth();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { path } = await params;
    const targetPath = path.join('/');
    const queryParams = req.nextUrl.searchParams.toString();

    const url = `${BACKEND_API_URL}/api/${targetPath}${queryParams ? `?${queryParams}` : ''}`;

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-store'
        });

        const data = await response.json();
        return NextResponse.json(data, { status: response.status });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ path: string[] }> }
) {
    const session = await auth();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { path } = await params;
    const targetPath = path.join('/');
    const body = await req.json();

    const url = `${BACKEND_API_URL}/api/${targetPath}`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        const data = await response.json();
        return NextResponse.json(data, { status: response.status });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
