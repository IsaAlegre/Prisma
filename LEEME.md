# Monitor Hidropónico

PWA para que el productor vea su invernadero y reciba avisos push en el celular.

```
ESP32 (Wi-Fi) --POST /api/lecturas--> servidor --notificación push--> celular (PWA)
```

## Carpetas
- `public/` → la app (HTML, CSS, JS, service worker, manifest, íconos).
- `servidor/` → servidor Node.js que recibe lecturas y envía los push.

## Probar solo la interfaz (sin placa ni servidor)
En `public/app.js` dejá `MODO_DEMO = true` y abrí `public/index.html`
con un servidor local (por ejemplo `npx serve public`).

## Usar con el ESP32
1. `cd servidor && npm install`
2. Generar las claves de push (una sola vez): `npx web-push generate-vapid-keys`
3. Iniciar:
   `VAPID_PUBLICA=xxx VAPID_PRIVADA=yyy CLAVE_ESP32=unaclave npm start`
4. En `public/app.js` poner `MODO_DEMO = false` e `INTERVALO_MS = 30000`.
5. El ESP32 manda cada minuto un POST a `http://SERVIDOR:3000/api/lecturas`
   con el encabezado `x-clave: unaclave` y este cuerpo:
   ```json
   { "temperatura": 21.4, "humedad": 68, "ph": 6.1, "ce": 1.5, "nivelCaldo": 72, "energia": "red" }
   ```
   `energia` puede ser `"red"`, `"generador"` o `"sin"`.
   La respuesta trae `"sirena": true` cuando hay un aviso urgente, para que el ESP32 encienda la sirena.

## Importante sobre las notificaciones push
- Las PWA necesitan **HTTPS** para instalarse y recibir push (en `localhost` funciona sin HTTPS).
  Para publicarla se puede usar un hosting con HTTPS gratuito o un túnel.
- En **iPhone** los push funcionan solo si la app se instaló desde Safari con
  Compartir > Agregar a inicio (iOS 16.4 o posterior).
- En Android funcionan desde Chrome, instalada o no.
