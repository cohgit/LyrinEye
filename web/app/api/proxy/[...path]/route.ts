import { NextRequest, NextResponse } from 'next/server';

const BACKEND_API_URL = process.env.BACKEND_API_URL || 'http://localhost:8080';

export async function GET(
    request: NextRequest,
    { params }: { params: { path: string[] } }
) {
    const path = params.path.join('/');
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

        const data = await response.json();
        return NextResponse.json(data, { status: response.status });
    } catch (error: any) {
        console.error(`[PROXY ERROR] GET ${url}:`, error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(
    request: NextRequest,
    { params }: { params: { path: string[] } }
) {
    const path = params.path.join('/');
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

        const data = await response.json();
        return NextResponse.json(data, { status: response.status });
    } catch (error: any) {
        console.error(`[PROXY ERROR] POST ${url}:`, error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
