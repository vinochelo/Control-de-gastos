# Guía de Despliegue (GitHub + Vercel)

Esta aplicación está diseñada para funcionar en Vercel con una base de datos Firebase y Groq AI.

## 1. Preparación en GitHub

1. Crea un nuevo repositorio en GitHub.
2. Sube el código de este proyecto (excluyendo `node_modules` y archivos `.env`).
   - **Nota:** Asegúrate de que el archivo `firebase-applet-config.json` esté incluido si no contiene secretos críticos, o mejor aún, configúralo como variable de entorno.

## 2. Configuración en Vercel

1. Importa tu repositorio de GitHub en Vercel.
2. Configura las siguientes **Variables de Entorno** en el panel de Vercel:

### Obligatorias:
- `GROQ_API_KEY`: Tu API Key de Groq (consíguela en console.groq.com).
- `TELEGRAM_BOT_TOKEN`: El token de tu bot de Telegram (consíguelo con @BotFather).
- `APP_URL`: La URL de tu aplicación en Vercel (ej: `https://tu-app.vercel.app`).

### Configuración de Firebase:
Vercel necesita saber cómo conectarse a Firebase. Puedes crear un archivo `firebase-applet-config.json` en la raíz o, para mayor seguridad, modificar `lib/firebase_service.ts` para que lea estas variables individualmente:

- `FIREBASE_API_KEY`
- `FIREBASE_AUTH_DOMAIN`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_APP_ID`
- `FIREBASE_FIRESTORE_DATABASE_ID` (opcional si usas la base de datos default)

## 3. Configurar el Webhook de Telegram

Una vez que tu app esté desplegada en Vercel, debes decirle a Telegram a dónde enviar los mensajes.
Visita esta URL en tu navegador (reemplazando los valores):

`https://api.telegram.org/bot<TU_TELEGRAM_BOT_TOKEN>/setWebhook?url=https://<TU_APP_VERCEL_URL>/api/telegram/webhook`

## 4. Notas Importantes

- **Firestore Rules:** Asegúrate de desplegar las reglas de seguridad de Firestore desde el panel de Firebase para que la app pueda escribir datos.
- **CORS:** Vercel maneja esto automáticamente para la mayoría de los casos de Next.js.
- **Sincronización:** El bot responderá en tiempo real a través del Webhook. La opción de "Sincronizar" en la web es un respaldo que usa `getUpdates`.
