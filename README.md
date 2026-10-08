# AgronIA

Plataforma web de agricultura de precisión construida con Vue 3, TypeScript y Vite.

## Desarrollo local

1. Instala las dependencias con `npm install`.
2. Copia `.env.example` como `.env.local`.
3. En `.env.local`, configura la URL del proyecto Supabase y su clave `publishable` o `anon` pública. Puedes encontrarlas en **Project Settings → API** en el panel de Supabase.
4. Inicia la aplicación con `npm run dev`.

El inicio de sesión y el registro requieren un proyecto Supabase configurado. Asegúrate también de que **Authentication → Providers → Email** esté habilitado en ese proyecto. Si tienes activada la confirmación por correo, confirma la dirección antes de iniciar sesión.

La clave pública `publishable`/`anon` se utiliza en el cliente. **No uses ni compartas la `service_role` key** en variables `VITE_*`, en el navegador ni en el repositorio.

## Telemetría de dron MAVLink

En **Simulación → Conexión con dron**, puedes conectar por USB un controlador ArduPilot o PX4 que exponga telemetría serie MAVLink 1 o 2. El navegador debe admitir Web Serial (Chrome o Edge de escritorio) y la aplicación debe servirse en HTTPS o `localhost`. Conecta el controlador, pulsa **Conectar por USB**, elige el puerto del controlador y selecciona la misma velocidad en baudios configurada para ese enlace (habitualmente 57 600 o 115 200).

La integración es **solo lectura**: valida el CRC MAVLink y recibe heartbeat, posición, GPS, velocidad, rumbo y batería cuando el autopiloto transmite esos mensajes. No envía paquetes de control, no arma el vehículo y no ejecuta misiones; las acciones de la escena 3D siguen siendo simuladas. Los mensajes MAVLink 2 firmados se omiten porque esta conexión no valida claves de firma. Para una prueba de banco, retira las hélices y verifica el puerto y la velocidad con el fabricante del controlador. En móviles, Safari y navegadores sin Web Serial, el panel informa que la conexión directa no está disponible.

## Comandos

- `npm run dev`: servidor de desarrollo.
- `npm run build`: verificación de TypeScript y compilación de producción.
- `npm run preview`: vista previa de la compilación.
