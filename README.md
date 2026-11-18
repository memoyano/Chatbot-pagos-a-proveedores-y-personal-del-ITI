# Chatbot ITI — Gestión de pagos, comprobantes, eventos, Caja Chica y roles docentes

> **Copia académica del código fuente.** Los registros de los scripts `seed-*` son ficticios, con direcciones `example.com` que no reciben OTP. Sustituye esos correos únicamente en un entorno privado de pruebas. La plantilla `.github/workflows/deploy-azure.yml.example` no despliega automáticamente: habilitar un despliegue requiere configurar un entorno y credenciales propios con autorización institucional.

Chatbot institucional para el Instituto Tecnológico Internacional Universitario ITI,
que automatiza la validación de plazos y el registro de solicitudes de pago,
comprobantes de compra, proveedores, eventos institucionales y reembolsos de
Caja Chica, conforme a la Política de Solicitud de Pagos y Recepción de
Comprobantes de Compra.

## Requisitos previos

- Node.js 22 LTS (misma versión usada en Azure App Service)
- Una base de datos MySQL accesible (local para desarrollo, o Azure Database
  for MySQL Flexible Server para producción)
- Un bot de Telegram creado con [@BotFather](https://t.me/BotFather)

## Instalación

```bash
git clone <url-del-repositorio>
cd chatbot-iti
npm install
cp .env.example .env
```

Edita `.env` con tus propios valores:

```
TELEGRAM_BOT_TOKEN=el_token_que_te_dio_BotFather
DB_HOST=localhost
DB_PORT=3306
DB_NAME=chatbot_iti
DB_USER=root
DB_PASSWORD=tu_password
```

## Crear la base de datos

**Azure Database for MySQL Flexible Server (recomendado, usa el crédito de Azure for Students):**

1. Sigue la guía paso a paso para crear el servidor en el Portal de Azure.
2. Copia el "Nombre del servidor", usuario y contraseña administrador a tu `.env`.
3. Establece `DB_SSL=true` (Azure exige conexión cifrada).
4. Verifica la conexión antes de arrancar la app:
   ```bash
   npm run test:db
   ```
   Si falla, el script te dirá la causa más probable (firewall, credenciales, SSL, host mal escrito).

## Ejecutar en desarrollo

```bash
npm run dev
```

Esto inicia:
- El servidor Express en `http://localhost:3000/health`
- El bot de Telegram en modo *polling* (no requiere URL pública)

## Ejecutar en producción

```bash
npm start
```

## Probar el bot

1. Abre Telegram y busca tu bot por el nombre de usuario que le diste en BotFather.
2. Envía `/start`.
3. Envía `/solicitud` para registrar una solicitud de pago y sigue el flujo guiado.

## Estructura del proyecto

```
src/
├── config/       Configuración (env, conexión a base de datos)
├── utils/        Utilidades (logger)
├── rules/        Motor de reglas de negocio (política institucional)
├── bot/          Bot de Telegram: instancia, flujos conversacionales
└── domains/      Un subdirectorio por dominio (modelo + servicio):
                  solicitudesPago, comprobantes, proveedores, docentes,
                  cajaChica, eventos, notificaciones, autenticacion y erp
```

## Seguridad: autenticación con OTP contra el ERP

Antes de usar cualquier comando, el bot exige verificar identidad:

1. El usuario elige si es **funcionario** o **proveedor** del ITI.
2. Ingresa su cédula/RUC, que se valida contra `erp_replica` (tabla que simula
   el ERP institucional, ya que no existe integración en tiempo real — ver
   Fundamentación Técnica del documento de sustentación).
3. Se envía un código OTP de 6 dígitos al correo registrado en el ERP
   (expira en 5 minutos, máximo 3 intentos, con opción de reenviar).
4. Una vez verificado, el rol queda asociado a su cuenta de Telegram de forma
   permanente (tabla `usuarios_autenticados`), y cada comando se restringe
   según el rol: los funcionarios acceden a `/solicitud`, `/comprobante`,
   `/proveedor` y `/estado`; los proveedores acceden a `/mispagos`.

### Poblar el ERP de prueba

Antes de poder autenticarte, necesitas al menos un registro en `erp_replica`.
Edita `scripts/seed-erp.js` con una cédula/RUC y un **correo real tuyo** (para
poder recibir el OTP), luego:

```bash
npm run seed:erp
```
## Flujo completo: Pago a Proveedor

El bot ahora lleva el seguimiento de **todo** el proceso, no solo la
solicitud inicial. Cada eslabón lo ejecuta un rol distinto:

| Paso | Comando | Rol | Efecto |
|---|---|---|---|
| 1 | `/solicitud` | solicitante | Crea la solicitud (`pendiente`) |
| 1.1 | `/comprobante` | solicitante | Vincula factura/nota/liquidación a la solicitud |
| 1.2 | `/validarcomprobante <id>` | contadora | Revisa y reconoce el comprobante |
| 2 | `/verificar <id>` | contadora | Confirma que la documentación vinculada está completa (`verificada`) |
| 3 | `/reporte <id>` | contadora | Genera reporte para Colecturía (`reporte_generado`) |
| 4 | `/ordentransferencia <id>` | colecturia | Genera la orden (`orden_transferencia`) |
| 5a | `/aprobarcg <id>` | coordinador_general | 1ra firma |
| 5b | `/aprobarcash <id>` | cash_management | 2da firma → al completarse ambas: `aprobada` |
| 6 | `/marcarpagada <id>` | colecturia | Cierra el flujo (`pagada`), notifica a Contabilidad y al solicitante |

Cada transición notifica automáticamente por Telegram al siguiente rol
responsable (por ejemplo, al generar el reporte se notifica a todos los
usuarios con rol `colecturia`).

## Flujo completo: Pago a Docentes

Basado en el documento oficial "Procedimiento y plazos para la elaboración
de roles de pago de docentes". Los docentes **no** son usuarios del bot
(facturan por correo electrónico); el bot lleva el seguimiento del proceso
completo y de cada docente dentro de él.

| Paso | Comando | Rol | Plazo oficial |
|---|---|---|---|
| 1 | `/iniciarroldepagos <periodo>` | director_general | — (dispara el proceso) |
| 2 | `/elaborarrol <id>` | contadora | medio día laborable |
| 2.1 | `/configurarfactura <rolId> <cédula> <monto> <concepto>` | contadora | carga monto/concepto exactos desde el rol elaborado |
| 2.2 | `/resumenrol <id>` | contadora / asistente_contable | valida preparación |
| 3 | `/solicitarfacturas <id>` | asistente_contable | envía correos automáticamente; medio día laborable |
| — | (docente factura por correo) | — | 3 días calendario según el texto del procedimiento |
| 4 | `/facturarecibida <rolId> <cédula> [fecha]` | contadora / asistente_contable | registra número, monto, concepto y archivo |
| — | `/facturaerror <rolId> <cédula> <motivo>` | contadora | devuelve a corrección |
| — | `/rezagados <rolId>` | contadora / asistente_contable | lista quienes van a fin de semestre |
| 5 | `/documentacionrevisada <id>` | contadora | 1 día laborable |
| 6 | `/detallepagodocentes <id>` | contadora | ~2 horas |
| 7 | `/ordendocentes <id>` | colecturia | ~2 horas |
| 8 | `/pagardocentes <id>` | colecturia | cierra el proceso |

Novedades de grado profesional ahora tienen aprobación: el coordinador usa
`/reportarnovedad <cédula> | <nuevo grado> | <valor opcional> | <motivo opcional>`.
La Contadora revisa con `/novedadesdocentes` y aprueba/rechaza sin modificar
directamente los datos económicos hasta la decisión.

### Poblar docentes de prueba

```bash
npm run seed:docentes
```

### Regla clave: plazo de facturación

Un docente tiene 3 días calendario desde que se le solicita la factura. El plazo comienza únicamente cuando SMTP confirma el envío del correo.
Si la envía el día 3, cuenta como a tiempo; el día 4 en adelante queda
**rezagado** y su pago se difiere hasta el final del semestre (no se
reintenta en el rol actual).

Nuevos comandos operativos de consola:

```bash
npm run migrate
npm run migrate:status
npm run schema:validate
npm run verify
```

Nuevos health checks:

```text
GET /health/live
GET /health/ready
GET /health/schema
```
