import { NextRequest, NextResponse } from 'next/server';

const BACKEND_API_URL = process.env.BACKEND_API_URL || 'http://localhost:8080';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ path: string[] }> }
) {
    const resolvedParams = await params;
    const path = resolvedParams.path.join('/');
    const searchParams = request.nextUrl.searchParams.toString();
    const url = `${BACKEND_API_URL}/${path}${searchParams ? `?${searchParams}` : ''}`;

    console.log(`[PROXY] GET ${url}`);

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
        });

        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            const data = await response.json();
            return NextResponse.json(data, { status: response.status });
        } else {
            const text = await response.text();
            return new NextResponse(text, {
                status: response.status,
                headers: { 'Content-Type': contentType || 'text/plain' }
            });
        }
    } catch (error: any) {
        console.error(`[PROXY ERROR] GET ${url}:`, error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ path: string[] }> }
) {
    const resolvedParams = await params;
    const path = resolvedParams.path.join('/');
    const url = `${BACKEND_API_URL}/${path}`;

    console.log(`[PROXY] POST ${url}`);

    try {
        const body = await request.json();
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            const data = await response.json();
            return NextResponse.json(data, { status: response.status });
        } else {
            const text = await response.text();
            return new NextResponse(text, {
                status: response.status,
                headers: { 'Content-Type': contentType || 'text/plain' }
            });
        }
    } catch (error: any) {
        console.error(`[PROXY ERROR] POST ${url}:`, error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
