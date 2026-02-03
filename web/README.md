# LyrinEye Web Admin Panel

Panel de administración web para gestionar dispositivos LyrinEye.

## Características

-  Autenticación con Google OAuth
- 📊 Dashboard con lista de dispositivos y métricas en tiempo real
- 🔍 Vista detallada por dispositivo
- 📤 Control remoto (push notifications para logcat)
- 📈 Visualización de telemetría histórica

## Stack Tecnológico

- **Framework**: Next.js 15 (App Router)
- **Auth**: NextAuth.js v5
- **Styling**: TailwindCSS
- **Charts**: Recharts
- **API Client**: Axios

## Setup Local

### 1. Instalar Dependencias

```bash
npm install
```

### 2. Configurar Variables de Entorno

Crea un archivo `.env.local` en la raíz del proyecto:

```bash
cp .env.local.example .env.local
```

Edita `.env.local` con tus credenciales:

```env
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
NEXTAUTH_SECRET=generate_with_openssl_rand_base64_32
NEXTAUTH_URL=http://localhost:3000
BACKEND_API_URL=https://lyrineye-dev-ca-tizsty.kindmeadow-xyz.eastus.azurecontainerapps.io
```

### 3. Generar NextAuth Secret

```bash
openssl rand -base64 32
```

### 4. Ejecutar Servidor de Desarrollo

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000) en tu navegador.

## Configuración de Google OAuth

1. Ve a [Google Cloud Console](https://console.cloud.google.com/)
2. Crea un nuevo proyecto o selecciona uno existente
3. Navega a **APIs & Services** > **Credentials**
4. Haz clic en **Create Credentials** > **OAuth client ID**
5. Selecciona **Web application**
6. Configura:
   - **Authorized JavaScript origins**: `http://localhost:3000`
   - **Authorized redirect URIs**: `http://localhost:3000/api/auth/callback/google`
7. Copia el **Client ID** y **Client Secret** a tu `.env.local`

## Estructura del Proyecto

```
web/
├── app/
│   ├── page.tsx                 # Landing page con login
│   ├── dashboard/
│   │   └── page.tsx             # Lista de dispositivos
│   ├── devices/
│   │   └── [id]/
│   │       └── page.tsx         # Detalle de dispositivo
│   └── api/
│       └── auth/
│           └── [...nextauth]/
│               └── route.ts     # NextAuth handlers
├── lib/
│   └── api.ts                   # API client
├── types/
│   └── device.ts                # TypeScript interfaces
├── auth.ts                      # NextAuth configuration
└── middleware.ts                # Route protection
```

## Deploy a Producción

### Azure Static Web Apps

El proyecto está configurado para deployarse automáticamente a Azure Static Web Apps via GitHub Actions.

Variables de entorno de producción:
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL` (URL de producción)
- `BACKEND_API_URL`

## Próximas Funcionalidades

- [ ] Integración real con Azure Log Analytics
- [ ] Gráficos de telemetría histórica (Recharts)
- [ ] Notificaciones push funcionales (Firebase)
- [ ] Lista de grabaciones por dispositivo
- [ ] Exportación de reportes
