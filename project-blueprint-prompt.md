# 🚀 Blueprint del Proyecto: LyrinEye (Azure + OIDC + React Native)

Utiliza este documento como contexto maestro para continuar el desarrollo o replicar el proyecto.

---

## 📝 Especificaciones Actuales

**Contexto:**
LyrinEye es una plataforma de vigilancia móvil "Zero-Cost". Utiliza dispositivos Android antiguos como cámaras de seguridad y dispositivos modernos como monitores.

### 1. Infraestructura (Terraform + Azure)
- **Provider:** `azurerm` v3.x configurado con `use_oidc = true` y `use_cli = false`.
- **Backend:** Terraform Cloud (`cogalde/lyrineye-infra`) en **MODO LOCAL**.
- **Auth:** GitHub OIDC Login (sin secretos de larga duración).
- **Recursos:**
  - **Serverless Architecture:** Azure Container Apps (Min replicas: 0).
  - **No-DB Storage:** Azure Tables (Metadatos) + Blobs (Videos).
  - **Networking:** Acceso público habilitado para el backend ACA.

### 2. CI/CD (GitHub Actions)
- **Workflow:** `.github/workflows/deploy.yml`
- **Permisos:** `id-token: write` (Crítico para OIDC).
- **Secrets Requeridos:**
  - `AZURE_CLIENT_ID`
  - `AZURE_TENANT_ID`
  - `AZURE_SUBSCRIPTION_ID`
  - `TF_API_TOKEN`

### 3. Stack de Aplicación Móvil
- **Tecnología:** React Native.
- **Transmisión:** WebRTC (P2P).
- **Almacenamiento:** Carga directa a Blob via SAS Tokens generados por el backend.

---

## 🏗️ Estructura de Archivos
- `/infrastructure/`: Código Terraform completo.
- `/.github/workflows/`: Pipelines de despliegue.
- `/[mobile_app_root]/`: (Pendiente de inicialización).

---

## 🎯 Instrucciones para la IA
Cuando trabajes en este proyecto:
1. **Seguridad:** Nunca propongas ni generes Client Secrets. Usa siempre el flujo OIDC configurado.
2. **Costo:** Mantén la filosofía "Zero-Cost". Si sugieres un nuevo servicio de Azure, asegúrate de que tenga tier gratuito o modelo de consumo.
3. **Escalabilidad:** El backend debe ser apátrida (stateless), apoyándose en Azure Tables para cualquier persistencia ligera.
