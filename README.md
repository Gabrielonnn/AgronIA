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

## Foto de perfil

En **Configuración → Mi Cuenta** cada usuario puede seleccionar una imagen JPG, PNG o WebP de hasta 5 MB, guardarla o quitarla. La imagen se almacena en el bucket público `avatars` de Supabase Storage y su URL se guarda en los metadatos de la cuenta autenticada. Las políticas restringen las cargas y eliminaciones a la carpeta del propio usuario; cualquiera que tenga la URL pública puede ver la imagen.

Antes de usar esta función, ejecuta `supabase_avatar_setup.sql` en el **SQL Editor** del proyecto Supabase. El avatar aparece también en la tarjeta de usuario de la barra lateral.

## Uso de las tablas de Supabase

En **Datos → Tablas de Supabase** puedes consultar hasta 100 filas por tabla y crear, editar o eliminar registros en `fields`, `crops`, `field_crops`, `devices`, `field_metrics`, `ai_alerts`, `treatments`, `simulations`, `map_elements`, `satellite_imagery` y `map_layers`. El editor de registros utiliza JSON con los nombres y tipos de columna definidos en tu base de datos. Para actualizar o eliminar una fila, la tabla debe tener una columna `id` de tipo texto/UUID.

La sección **Parcelas y Clientes** guarda las parcelas en `fields`, carga el catálogo desde `crops` y crea el registro relacionado en `field_crops` cuando se selecciona un cultivo. En **Visor satelital**, el botón **Guardar en Supabase** crea o actualiza los elementos dibujados en `map_elements`. En **Simulación**, **Nuevo escenario** guarda sus parámetros y resultados en `simulations`. Estas acciones requieren una sesión activa y las políticas RLS correspondientes.

La interfaz respeta las políticas RLS de Supabase: si una operación no está permitida, muestra el error recibido y no evita la política. `profiles` y `user_logs` se consultan en modo lectura; la administración de perfiles sigue en **Usuarios** y la bitácora la genera la aplicación. Las tablas deben existir previamente en Supabase y tener sus políticas/permisos configurados.

## Diagnóstico de enfermedades en plantas

En **Diagnóstico**, los usuarios autenticados pueden seleccionar una imagen JPG, PNG o WebP de hasta 10 MB, o tomar una foto con la cámara del dispositivo. La cámara requiere HTTPS o `localhost` y permiso explícito del navegador. La imagen se envía únicamente al endpoint configurado; AgronIA no la almacena ni genera predicciones simuladas.

### Ejecutar el modelo con licencia MIT declarada

El backend usa el modelo EfficientNetV2S de [Animesh Kumar](https://huggingface.co/animeshakr/plant-disease-efficientnetv2s), cuya tarjeta declara licencia MIT, fijado a una revisión concreta. No es el modelo sin licencia del repositorio original. Para iniciar el detector en desarrollo:

1. Con Docker instalado y conexión a Internet, desde la raíz de AgronIA ejecuta `docker build -t agronia-diagnosis ./backend`. El build descarga el modelo TFLite de 42 MB desde la revisión fijada y comprueba su SHA-256; no almacena los pesos en Git.
2. Inicia el servicio con `docker run --rm -p 8000:8000 agronia-diagnosis`.
3. Copia `.env.example` a `.env.local` (conserva tus credenciales Supabase, si ya las configuraste) y establece `VITE_PLANT_DIAGNOSIS_API_URL=http://localhost:8000/predict`. Reinicia Vite (`npm run dev`) si ya estaba iniciado.
4. Comprueba que `http://localhost:8000/health` responda `{"status":"ready"}`. La API y Vite deben ejecutarse a la vez.

### Publicar el diagnóstico en la web

GitHub Pages sirve la interfaz, pero no puede ejecutar el modelo Python. El archivo `render.yaml` configura el backend Docker en Render y permite que la web publicada (`https://jarednn.github.io`) se comunique con él.

1. En Render, crea un **Blueprint** conectado a este repositorio y acepta el servicio `agronia-plant-diagnosis` definido en `render.yaml`. El primer despliegue descarga y verifica el modelo.
2. Espera a que el despliegue esté listo y confirma que `https://<tu-servicio>.onrender.com/health` responda `{"status":"ready"}`.
3. En GitHub, abre **Settings → Secrets and variables → Actions**, crea el secreto `VITE_PLANT_DIAGNOSIS_API_URL` con el valor `https://<tu-servicio>.onrender.com/predict` y vuelve a ejecutar el workflow **Deploy static content to Pages**. El servicio Render autoriza el origen de GitHub Pages mediante `PLANT_DIAGNOSIS_ALLOWED_ORIGINS`.
4. Cuando termine la publicación, recarga la página de AgronIA y prueba **Diagnóstico**. En el plan gratuito de Render, el servicio puede suspenderse por inactividad; la primera solicitud después de una suspensión puede tardar mientras arranca.

El API recibe `multipart/form-data` con un campo `file` y responde el nombre de la clase y la confianza:

```json
{
  "disease": "Apple___healthy",
  "confidence": 0.97,
  "recommendation": "Resultado orientativo. Confirma el diagnóstico y cualquier tratamiento con un especialista agrónomo."
}
```

El modelo clasifica 38 condiciones en manzana, arándano, cereza, maíz, uva, naranja, durazno, pimiento, papa, frambuesa, soya, calabaza, fresa y tomate. Acepta imágenes RGB de 384×384; el preprocesamiento y el mapa de clases siguen la tarjeta del modelo. La API añade una recomendación de cautela si la confianza es menor de 60%. `/health` verifica que el modelo se haya cargado.

La licencia MIT está declarada en la tarjeta de Hugging Face; la revisión exacta y la suma de verificación están registradas en [download_model.py](./backend/download_model.py) y la atribución en [THIRD_PARTY_NOTICES.md](./backend/THIRD_PARTY_NOTICES.md). Esa licencia del modelo no sustituye los términos del dataset ni de la arquitectura base. La tarjeta del modelo identifica PlantVillage como datos de entrenamiento, reporta fotos controladas de laboratorio y advierte que no se ha validado la generalización a fotos de campo ni debe usarse para decisiones comerciales de manejo de cultivos. No uses el resultado como diagnóstico agronómico definitivo. Revisa los términos del dataset y obtén asesoría legal antes de cualquier uso comercial.

La API del modelo no envía alertas de Telegram; eso requeriría añadir credenciales de bot solo en el backend. En producción, despliega el backend en un servicio accesible por HTTPS, configura `VITE_PLANT_DIAGNOSIS_API_URL` con la URL pública `/predict` al compilar el frontend y define `PLANT_DIAGNOSIS_ALLOWED_ORIGINS` con el origen exacto del sitio AgronIA. No publiques un endpoint HTTP ni credenciales en variables `VITE_*`.

## Telemetría de dron MAVLink

En **Simulación → Conexión con dron** hay tres modalidades de telemetría de solo lectura:

El panel también permite iniciar una **vista previa de la cámara local** del teléfono o computadora, con cámara trasera/frontal cuando el dispositivo lo admite. Abre AgronIA desde el propio teléfono para usar su cámara; desde la computadora puedes usar la webcam integrada o una webcam USB. Requiere HTTPS o `localhost` y permiso explícito del navegador. Esta vista previa permanece en el dispositivo y **no transmite, graba ni guarda** el video; no es todavía la cámara integrada del dron.

En **Simulación → Conexión con dron → Registro de campo**, puedes tomar una foto con el teléfono, asociar una ubicación GPS del teléfono o telemetría reciente del dron y descargar la foto para analizarla con el [detector YOLOv8 del repositorio Plant Detection](https://github.com/muqadasejaz/Plant-Detection-using-YOLOv8) o su [demo alojada en Streamlit](https://plant-dectection.streamlit.app/). Esa demo acepta imágenes y detecta las clases del modelo: Apple Scab, Apple Rust, Corn Leaf Blight, Corn Gray Spot, Potato Early Blight, Potato Late Blight, Tomato Bacterial Spot, Tomato Leaf Mold, Tomato Mosaic Virus y Healthy Leaf. No contiene clases de insectos.

La demo y AgronIA son servicios separados: hay que descargar la foto, subirla manualmente a Streamlit y transcribir la clase/confianza mostrada de regreso a AgronIA; ni la foto ni la ubicación se envían automáticamente desde AgronIA a ese servicio. Al subir una imagen a la demo externa, esta sale de tu dispositivo hacia el servicio de Streamlit: no cargues imágenes sensibles sin autorización. Los registros y fotos guardados en AgronIA se almacenan en la tabla `field_observations` y el bucket privado `field-observations`; cada usuario solo puede consultar los propios. Ejecuta `supabase_field_scouting_setup.sql` en el SQL Editor de Supabase antes de usar el guardado. El resultado copiado se registra como informado por el usuario, no como una inferencia validada automáticamente por AgronIA.

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
