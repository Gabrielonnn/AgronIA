# AgronIA

Plataforma web de agricultura de precisión construida con Vue 3, TypeScript y Vite.

## Desarrollo local

1. Instala las dependencias con `npm install`.
2. Copia `.env.example` como `.env.local`.
3. En `.env.local`, configura la URL del proyecto Supabase y su clave `publishable` o `anon` pública. Puedes encontrarlas en **Project Settings → API** en el panel de Supabase.
4. Ejecuta `supabase_setup.sql` en el SQL Editor de Supabase para instalar/perfeccionar perfiles, logs y el trigger de registro. Si el proyecto ya tenía una versión anterior, vuelve a ejecutarlo para reemplazar el trigger y las políticas previas; conserva los perfiles y el estado de cuentas ya activas.
5. Aplica las migraciones versionadas con `supabase link --project-ref <project-ref>` y `supabase db push`. La migración `20261110190000_agronomy_tables.sql` crea las tablas de cultivos, campos, métricas, imágenes, tratamientos, dispositivos, alertas y simulaciones, además de las políticas RLS para los datos por usuario. Si no usas Supabase CLI, ejecuta las migraciones pendientes en orden en el SQL Editor.
6. Inicia la aplicación con `npm run dev`.

El inicio de sesión y el registro requieren un proyecto Supabase configurado. Asegúrate también de que **Authentication → Providers → Email** esté habilitado en ese proyecto. Si tienes activada la confirmación por correo, confirma la dirección antes de iniciar sesión.

La clave pública `publishable`/`anon` se utiliza en el cliente. **No uses ni compartas la `service_role` key** en variables `VITE_*`, en el navegador ni en el repositorio.
Los usuarios nuevos comienzan como clientes pendientes e inactivos. Para habilitar la administración de la primera cuenta, cambia su perfil de forma explícita desde el SQL Editor, identificándola por el correo que tú controles:

```sql
UPDATE public.profiles AS profile
SET role = 'administrador', status = 'aprobado', active = true
FROM auth.users AS auth_user
WHERE profile.id = auth_user.id
  AND auth_user.email = 'tu-correo-administrador@ejemplo.com';
```

Las migraciones versionadas crean también el bucket público `avatars` y sus políticas para que cada usuario gestione solo su propia foto. Si no tienes Supabase CLI, ejecuta los archivos de `supabase/migrations` en orden en el SQL Editor. La configuración de Supabase vive en `.env.local`; no hay credenciales locales disponibles en este checkout, por lo que la conexión al proyecto debe completarse con los valores del panel del proyecto. `.env.example` solo contiene valores de ejemplo y no conecta con una base de datos real.

## Telemetría de dron MAVLink

En **Simulación → Conexión con dron** hay tres modalidades de telemetría de solo lectura:

1. **USB/serial MAVLink:** conecta un controlador ArduPilot o PX4 que exponga MAVLink 1/2 por serie. Requiere Web Serial (Chrome o Edge de escritorio), HTTPS o `localhost`; selecciona el puerto y los baudios del controlador (habitualmente 57 600 o 115 200).
2. **MAVLink por Wi‑Fi/radio:** AgronIA incluye un puente UDP→WebSocket para ejecutar en la computadora conectada a la radio. En esa computadora instala las dependencias del proyecto y ejecuta `npm run bridge:mavlink`; configura el autopiloto/radio para enviar telemetría MAVLink UDP a la IP de esa computadora, puerto `14550`. El puente retransmite los datagramas como mensajes binarios WebSocket a `ws://127.0.0.1:8765/mavlink`. Selecciona **MAVLink** en AgronIA y conecta a esa URL. El servidor WebSocket solo escucha en loopback por defecto y acepta el origen local de Vite; se puede personalizar con `AGRONIA_MAVLINK_UDP_HOST`, `AGRONIA_MAVLINK_UDP_PORT`, `AGRONIA_MAVLINK_WS_HOST`, `AGRONIA_MAVLINK_WS_PORT` y `AGRONIA_ALLOWED_ORIGINS` (lista de origins separada por comas). Para una app alojada remotamente, configura un proxy TLS `wss://` hacia el puente y autoriza su origin. No expongas el WebSocket en una red pública.
3. **DJI mediante puente:** requiere una computadora/app puente basada en el SDK o Cloud API compatible con tu modelo DJI. El puente debe publicar mensajes WebSocket de texto JSON en `ws://` o `wss://` (valor local inicial `ws://127.0.0.1:8766`) con este esquema:

   ```json
   {
     "type": "telemetry",
     "vehicleName": "DJI",
     "latitude": 19.43,
     "longitude": -99.13,
     "altitude": 42.5,
     "relativeAltitude": 5.2,
     "groundSpeed": 3.2,
     "heading": 180,
     "gpsFix": 3,
     "satellites": 12,
     "batteryPercent": 86,
     "batteryVoltage": 15.4,
     "armed": false
   }
   ```

   `type` es obligatorio; los demás campos son opcionales y se validan por tipo y rango. `relativeAltitude` alimenta la elevación visual respecto al punto de inicio cuando el SDK la ofrece; `altitude` corresponde a la altitud reportada por el puente. AgronIA no incluye ni sustituye el SDK de DJI: la compatibilidad depende del puente y del modelo.

Las tres integraciones son **solo lectura**: no envían paquetes de control, no arman el vehículo ni ejecutan misiones. Los botones de riego, fumigación y centinelas de **Simulación** solo animan el simulador 3D. MAVLink valida el CRC; las tramas MAVLink 2 firmadas se omiten porque la aplicación no valida claves de firma. La conexión Wi‑Fi/radio requiere un puente que exponga WebSocket accesible desde el navegador (el navegador no puede abrir UDP directamente). Para pruebas de banco, retira las hélices y sigue las indicaciones del fabricante del dron/controlador. En móviles, Safari y navegadores sin Web Serial, solo están disponibles las modalidades con puente.

Al seleccionar un campo con geometría GeoJSON, **Simulación** proyecta su perímetro a metros, muestra dimensiones/área y recibe posición GPS, rumbo y altitud relativa de la telemetría entrante. La trayectoria y el marcador desaparecen al perder la conexión. Si el dron o puente no informa altitud relativa, el marcador usa una altura visual estimada a partir del estado armado; no es una medición de altura. La telemetría GPS se guarda en `field_metrics` cada cinco segundos mientras llega una posición válida. La geometría del campo es real; las plantas, métricas visuales y zonas de estrés del escenario 3D siguen siendo demostrativas, no datos de sensores ni un levantamiento de vuelo. No se envían órdenes de control al dron.

**Inicio** y **Dashboards** muestran las mediciones del campo seleccionado desde `field_metrics` y consultan cambios cada diez segundos. Las métricas sin valor aparecen como “—”; NDVI y plagas se leen de `raw_data.ndvi_avg` y `raw_data.pest_index`, respectivamente. El importador CSV conserva sus columnas originales como texto en `raw_data`, además de mapear humedad, temperatura e índice de sustentabilidad a columnas numéricas.

Los registros guardados desde el escenario 3D se marcan con `raw_data.source = "simulation"` y la interfaz advierte que son datos demostrativos. La telemetría entrante se marca como `drone_telemetry`; un CSV conserva las columnas importadas. No conectes instrumentos reales a una base de producción antes de revisar los formatos y unidades que envían.

## Análisis de imágenes de cultivo

En **Análisis IA** puedes seleccionar una imagen, capturarla con una cámara permitida por el navegador o mostrar imágenes de un puente de cámara. La vista optimiza la imagen en el navegador; el análisis solo se ejecuta al solicitarlo y requiere la Edge Function `analyze-crop` y un proveedor compatible con la API OpenAI Chat Completions, entrada visual por `image_url` y `response_format: { "type": "json_object" }`.

1. Configura los secretos **en Supabase**, nunca en variables `VITE_*` ni en el navegador:

   ```sh
   supabase secrets set AGRONIA_AI_API_URL=https://proveedor.example/v1/chat/completions AGRONIA_AI_API_KEY=... AGRONIA_AI_MODEL=...
   ```

2. Despliega las funciones con `supabase functions deploy analyze-crop` y `supabase functions deploy admin-create-user`. La última utiliza `SUPABASE_SERVICE_ROLE_KEY` solo en Edge Functions; nunca la configures con prefijo `VITE_`.
3. La URL debe ser el endpoint HTTPS de chat completions del proveedor y el modelo debe aceptar imágenes. La función valida sesión y perfil activo, limita el tamaño de la imagen a 3 MB, valida el formato estructurado de salida y no almacena la imagen. Se necesita configurar Supabase en la aplicación y ejecutar las migraciones del repositorio.
4. La cámara del dron no es un protocolo universal. Para mostrar sus imágenes, conecta un puente compatible con el SDK del fabricante en **Análisis IA → Conectar cámara del dron por puente**. El puente debe aceptar WebSocket desde el navegador y enviar tramas binarias individuales JPEG, PNG o WebP (máximo 3 MB); usa `wss://` si AgronIA está bajo HTTPS. La telemetría MAVLink ya existente no transporta imágenes. La cámara del navegador solo ve cámaras que el sistema operativo exponga como dispositivos de video.

El proveedor de IA procesa la imagen cuando se solicita el análisis; revisa sus condiciones de privacidad y retención antes de usar imágenes sensibles. Los resultados son observaciones asistidas por visión, no diagnósticos agronómicos confirmados ni recomendaciones de dosis/tratamientos. Confirma los hallazgos en campo con personal especialista. No hay un modelo entrenado ni una integración DJI universal incluidos en el repositorio.

Las páginas **Parcelas**, **Gestión de usuarios** y **Análisis IA** leen/escriben registros en Supabase. **Mapas** guarda cada mapa como un campo y sus geometrías como elementos; **Datos** importa filas CSV como métricas de campo; **Gestión → Campos y registros** permite administrar cultivos, siembras, tratamientos, dispositivos, imágenes y alertas; **Simulación** persiste escenarios y, al asociarlos a un campo, métricas y alertas. También se conservan los flujos existentes en `parcels`, `crop_analysis_results`, `profiles` y `user_logs`. Los administradores invitan usuarios mediante `admin-create-user`; configura el envío de correo de Supabase Auth. Las imágenes originales de análisis IA no se guardan. Las políticas RLS limitan la lectura y escritura de registros a usuarios autenticados y propietarios de los campos, con permisos administrativos para administradores activos.

## Comandos

- `npm run dev`: servidor de desarrollo.
- `npm run build`: verificación de TypeScript y compilación de producción.
- `npm run test:unit`: pruebas unitarias de análisis de IA, geometría de parcelas y parser MAVLink.
- `npm run preview`: vista previa de la compilación.
