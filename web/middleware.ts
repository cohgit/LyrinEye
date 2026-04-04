import { auth } from "@/auth"
import { NextResponse } from "next/server"

export default auth((req) => {
    try {
        // Just proceed, auth() already handles redirection to signIn if configured
        return NextResponse.next();
    } catch (error: any) {
        console.error("[MIDDLEWARE-AUTH-ERROR]", error.message || error);
        return NextResponse.next();
    }
})

export const config = {
    matcher: ['/dashboard/:path*', '/devices/:path*'],
}
