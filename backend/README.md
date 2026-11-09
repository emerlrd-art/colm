# Legacy backend directory

Application code has been organized under `app/`:

- `app/Controllers/Api/` contains the API request handlers.
- `app/Middleware/` contains authentication and rate-limiting checks.
- `app/Models/` contains database and persistence modules.
- `app/Services/` contains workflow and integration modules.
- `app/Utils/` contains shared helpers.

The public `api/` PHP files remain as compatibility entry points.
