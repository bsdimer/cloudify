# State Backend — PostgreSQL
# The schema_name is populated per-tenant during repo initialization.

terraform {
  backend "pg" {
    # schema_name will be overridden during tenant setup
  }
}
