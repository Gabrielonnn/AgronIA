# AgronIA

Plataforma web de agricultura de precisión construida con Vue 3, TypeScript y Vite.

## Desarrollo local

1. Instala las dependencias con `npm install`.
2. Copia `.env.example` como `.env.local`.
3. En `.env.local`, configura la URL del proyecto Supabase y su clave `publishable` o `anon` pública. Puedes encontrarlas en **Project Settings → API** en el panel de Supabase.
4. Inicia la aplicación con `npm run dev`.

El inicio de sesión y el registro requieren un proyecto Supabase configurado. Asegúrate también de que **Authentication → Providers → Email** esté habilitado en ese proyecto. Si tienes activada la confirmación por correo, confirma la dirección antes de iniciar sesión.

La clave pública `publishable`/`anon` se utiliza en el cliente. **No uses ni compartas la `service_role` key** en variables `VITE_*`, en el navegador ni en el repositorio.

## Foto de perfil

En **Configuración → Mi Cuenta** cada usuario puede seleccionar una imagen JPG, PNG o WebP de hasta 5 MB, guardarla o quitarla. La imagen se almacena en el bucket público `avatars` de Supabase Storage y su URL se guarda en los metadatos de la cuenta autenticada. Las políticas restringen las cargas y eliminaciones a la carpeta del propio usuario; cualquiera que tenga la URL pública puede ver la imagen.

Antes de usar esta función, ejecuta `supabase_avatar_setup.sql` en el **SQL Editor** del proyecto Supabase. El avatar aparece también en la tarjeta de usuario de la barra lateral.

## Uso de las tablas de Supabase

En **Datos → Tablas de Supabase** puedes consultar hasta 100 filas por tabla y crear, editar o eliminar registros en `fields`, `crops`, `field_crops`, `devices`, `field_metrics`, `ai_alerts`, `treatments`, `simulations`, `map_elements`, `satellite_imagery` y `map_layers`. El editor de registros utiliza JSON con los nombres y tipos de columna definidos en tu base de datos. Para actualizar o eliminar una fila, la tabla debe tener una columna `id` de tipo texto/UUID.

La sección **Parcelas y Clientes** guarda las parcelas en `fields`, carga el catálogo desde `crops` y crea el registro relacionado en `field_crops` cuando se selecciona un cultivo. En **Visor satelital**, el botón **Guardar en Supabase** crea o actualiza los elementos dibujados en `map_elements`. En **Simulación**, **Nuevo escenario** guarda sus parámetros y resultados en `simulations`. Estas acciones requieren una sesión activa y las políticas RLS correspondientes.

La interfaz respeta las políticas RLS de Supabase: si una operación no está permitida, muestra el error recibido y no evita la política. `profiles` y `user_logs` se consultan en modo lectura; la administración de perfiles sigue en **Usuarios** y la bitácora la genera la aplicación. Las tablas deben existir previamente en Supabase y tener sus políticas/permisos configurados.

## Telemetría de dron MAVLink

En **Simulación → Conexión con dron** hay tres modalidades de telemetría de solo lectura:

El panel también permite iniciar una **vista previa de la cámara local** del teléfono o computadora, con cámara trasera/frontal cuando el dispositivo lo admite. Abre AgronIA desde el propio teléfono para usar su cámara; desde la computadora puedes usar la webcam integrada o una webcam USB. Requiere HTTPS o `localhost` y permiso explícito del navegador. Esta vista previa permanece en el dispositivo y **no transmite, graba ni guarda** el video; no es todavía la cámara integrada del dron.

En **Simulación → Conexión con dron → Registro de campo**, puedes tomar una foto con el teléfono, asociar una ubicación GPS del teléfono o telemetría reciente del dron, clasificar manualmente el hallazgo (plaga, enfermedad, estrés, deficiencia u otro) y guardar la observación. Los registros y fotos se guardan en la tabla `field_observations` y el bucket privado `field-observations`; cada usuario solo puede consultar sus propios registros y fotos. Ejecuta `supabase_field_scouting_setup.sql` en el SQL Editor de Supabase antes de usarlo. La clasificación es manual: **no hay detección automática por IA** en este flujo.

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
     "groundSpeed": 3.2,
     "heading": 180,
     "gpsFix": 3,
     "satellites": 12,
     "batteryPercent": 86,
     "batteryVoltage": 15.4,
     "armed": false
   }
   ```

   `type` es obligatorio; los demás campos son opcionales y se validan por tipo y rango. AgronIA no incluye ni sustituye el SDK de DJI: la compatibilidad depende del puente y del modelo.

Las tres integraciones son **solo lectura**: no envían paquetes de control, no arman el vehículo ni ejecutan misiones. Los botones de riego, fumigación, análisis y centinelas solo animan el simulador 3D. MAVLink valida el CRC; las tramas MAVLink 2 firmadas se omiten porque la aplicación no valida claves de firma. La conexión Wi‑Fi/radio requiere un puente que exponga WebSocket accesible desde el navegador (el navegador no puede abrir UDP directamente). Para pruebas de banco, retira las hélices y sigue las indicaciones del fabricante del dron/controlador. En móviles, Safari y navegadores sin Web Serial, solo están disponibles las modalidades con puente.

## Comandos

- `npm run dev`: servidor de desarrollo.
- `npm run build`: verificación de TypeScript y compilación de producción.
- `npm run preview`: vista previa de la compilación.
