import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/** Middleware auth kontrolü için cookie adı */
const AUTH_COOKIE_NAME = 'ramis_auth';

/**
 * Public rotalar — auth cookie kontrolü yapılmaz.
 * - /login: Giriş sayfası
 * - /offline: Offline sayfası
 * - /api/*: API route'ları (backend kendi auth'ını kontrol eder)
 * - /_next/*: Next.js internal
 * - /favicon.ico, /icons/*, /sounds/*: Static assets
 * - /manifest.webmanifest: PWA manifest
 */
const PUBLIC_PATHS = [
    '/login',
    '/offline',
    '/kds/prep-window',
    '/api',
    '/_next',
    '/favicon.ico',
    '/icons',
    '/sounds',
    '/manifest.webmanifest',
    '/sw.js',
    '/workbox',
];

/**
 * Edge middleware — her istekte çalışır.
 *
 * Amaç: Auth cookie'si olmayan kullanıcıları /login'e yönlendir.
 * Bu, authenticate olmamış kullanıcıların full JS bundle indirmesini engeller.
 *
 * Not: Token validasyonu client-side yapılır (AuthGuard + useAuthMe).
 * Middleware sadece "cookie var mı" kontrolü yapar — hızlı ve lightweight.
 */
/**
 * Tüm yanıtlara pathname header'ı ekler — i18n request.ts'in
 * sadece ilgili modülleri yüklemesi için kullanılır.
 */
function withPathnameHeader(request: NextRequest, response: NextResponse): NextResponse {
    response.headers.set('x-ramis-pathname', request.nextUrl.pathname);
    return response;
}

/** /tr/kds/prep-window gibi locale önekli public rotalar */
function isLocalePublicPath(pathname: string): boolean {
    return /^\/[a-z]{2}\/kds\/prep-window(\/.*)?$/.test(pathname);
}

export function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;

    if (isLocalePublicPath(pathname)) {
        return withPathnameHeader(request, NextResponse.next());
    }

    // Public path'leri atla
    for (const publicPath of PUBLIC_PATHS) {
        if (pathname === publicPath || pathname.startsWith(publicPath + '/')) {
            return withPathnameHeader(request, NextResponse.next());
        }
    }

    // Root path (/) — login'e yönlendir (eğer cookie yoksa)
    if (pathname === '/') {
        const hasAuthCookie = request.cookies.has(AUTH_COOKIE_NAME);
        if (!hasAuthCookie) {
            const loginUrl = new URL('/login', request.url);
            return NextResponse.redirect(loginUrl);
        }
        return withPathnameHeader(request, NextResponse.next());
    }

    // Diğer tüm rotalar — auth cookie kontrolü
    const hasAuthCookie = request.cookies.has(AUTH_COOKIE_NAME);
    if (!hasAuthCookie) {
        const loginUrl = new URL('/login', request.url);
        // Nereye yönlendirildiğini bilmek için return URL ekle
        loginUrl.searchParams.set('returnUrl', pathname);
        return NextResponse.redirect(loginUrl);
    }

    return withPathnameHeader(request, NextResponse.next());
}

/**
 * Middleware'in çalışacağı rotalar.
 * Sadece page route'ları — static assets ve API'ler hariç.
 */
export const config = {
    matcher: [
        /*
         * Aşağıdaki path'ler hariç tüm isteklerde çalış:
         * - _next/static (static files)
         * - _next/image (image optimization)
         * - favicon.ico
         * - icons, sounds (static assets)
         * - api route'ları
         */
        '/((?!_next/static|_next/image|favicon.ico|icons/|sounds/|api/).*)',
    ],
};
