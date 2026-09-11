# integrations/

Clients for external services the API talks to - anything outside this
process's own database and HTTP surface (identity provider, object storage,
email, etc.).

Nothing lives here yet. Each integration should get its own module here once
a real one is needed, rather than being reached for directly from a feature
module.
