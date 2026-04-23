# HazPost Backend

Sistema Python/Flask independiente para monitoreo, seguridad, SEO, backups y aprendizaje colectivo de **hazpost.app**.

## Estructura

```
hazpost-backend/
├── app.py                      # Servidor Flask principal
├── requirements.txt            # Dependencias Python
├── .env.example                # Variables de entorno requeridas
├── src/
│   ├── monitor.py              # Detección de caídas (checks HTTP cada 5 min)
│   ├── scanner.py              # Escaneo completo cada 6 horas
│   ├── telegram_alerts.py      # Alertas al bot @eco_social_alerts_bot
│   ├── backup.py               # Backup diario comprimido con retención
│   ├── security.py             # Headers de seguridad y rate limiting
│   ├── seo.py                  # sitemap.xml, robots.txt, meta tags OG/Twitter
│   ├── duplicados.py           # Detección y fusión de skills duplicadas
│   ├── aislamiento.py          # Middleware de aislamiento de datos por usuario
│   └── aprendizaje_colectivo.py # IA colectiva por rubro de negocio
├── templates/
│   └── skills.html             # Tabla paginada de skills detectadas
└── data/                       # Datos locales (excluido en .gitignore)
    ├── backups/
    ├── models/
    └── users/
```

## Instalación

```bash
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Edita .env con tus valores reales
```

## Uso

```bash
# Desarrollo
python app.py

# Producción con Gunicorn
gunicorn -w 2 -b 0.0.0.0:5000 "app:create_app()"
```

## Endpoints principales

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/` | Estado del servicio |
| GET | `/health` | Health check |
| GET | `/sitemap.xml` | Sitemap dinámico |
| GET | `/robots.txt` | Robots.txt |
| GET | `/api/monitor/` | Estado actual del sitio |
| POST | `/api/monitor/check` | Forzar verificación |
| GET | `/api/scanner/` | Último escaneo |
| POST | `/api/scanner/run` | Ejecutar escaneo manual |
| GET | `/api/scanner/skills` | Skills detectadas |
| GET | `/api/backup/` | Listar backups |
| POST | `/api/backup/run` | Ejecutar backup manual |
| GET | `/api/duplicados/` | Listar skills duplicadas |
| POST | `/api/duplicados/merge` | Fusionar duplicadas |
| GET | `/api/aprendizaje/rubros` | Rubros con modelos entrenados |
| GET | `/api/aprendizaje/sugerencias/<rubro>` | Sugerencias por rubro |
| POST | `/api/aprendizaje/interaccion` | Registrar interacción anonimizada |
| POST | `/api/aprendizaje/entrenar/<rubro>` | Entrenar modelo por rubro |

## Autenticación

Todos los endpoints **POST y DELETE** (escritura) requieren el header `X-API-Key`:

```
X-API-Key: <tu_api_key>
```

Los endpoints **GET** de solo lectura (`/`, `/health`, `/api/monitor/`, `/api/scanner/`, etc.) son públicos y no requieren clave.

Configura la clave en tu `.env`:

```bash
# Genera una clave segura
python -c "import secrets; print(secrets.token_hex(32))"
# Cópiala en .env
API_KEY=tu_clave_secreta
```

Si `API_KEY` está vacía en `.env`, la autenticación queda **desactivada** (solo para desarrollo local). En producción siempre debe configurarse.

**Ejemplo de uso con curl:**

```bash
# GET — público, sin header
curl https://hazpost.app/api/monitor/

# POST — requiere X-API-Key
curl -X POST https://hazpost.app/api/monitor/check \
  -H "X-API-Key: tu_clave_secreta"

curl -X POST https://hazpost.app/api/scanner/run \
  -H "X-API-Key: tu_clave_secreta"

curl -X POST https://hazpost.app/api/backup/run \
  -H "X-API-Key: tu_clave_secreta"
```

## Aislamiento de usuarios

Los endpoints `/api/aislamiento/` requieren tanto `X-API-Key` como el header `X-User-ID`. Cada usuario tiene su directorio aislado en `data/users/<user_id>/`. El sistema nunca permite acceso cruzado entre usuarios.

## Schedulers automáticos

- **Cada 5 min**: Verificación HTTP del sitio → alerta Telegram si cae
- **Cada 6 horas**: Escaneo completo de páginas y skills → reporte Telegram
- **Diariamente a las 02:00 UTC**: Backup comprimido de datos → alerta Telegram
